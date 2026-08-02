import assert from "node:assert/strict";
import test from "node:test";
import {
  createFeedbackCaptureCore,
  createFeedbackSubmission,
  createHttpFeedbackTransport,
  FeedbackTransportError,
  parseFeedbackCapturePayload,
  validateFeedbackCapturePayload,
} from "../dist/index.js";

const createPayload = () =>
  createFeedbackCaptureCore().getPayload({
    sourceApp: "transport-test",
    title: "Synthetic feedback",
    description: "A safe payload for the transport contract.",
    context: { scenario: "test" },
  });

const receiptResponse = () =>
  Response.json({
    id: "fb_123",
    status: "received",
    createdAt: "2026-08-02T10:00:00.000Z",
    version: 1,
  });

const apiResponse = () =>
  Response.json(
    {
      feedback: {
        id: "fb_api_123",
        status: "new",
        createdAt: "2026-08-02T10:00:00.000Z",
        version: 1,
      },
    },
    { status: 201 },
  );

test("validates and parses the versioned capture payload", () => {
  const payload = createPayload();
  const result = validateFeedbackCapturePayload(payload);

  assert.equal(result.success, true);
  assert.equal(parseFeedbackCapturePayload(payload).schemaVersion, "1.0");

  const invalid = validateFeedbackCapturePayload({
    ...payload,
    errors: "nope",
  });
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.deepEqual(invalid.issues[0], {
      path: "errors",
      message: "must be an array",
    });
  }
  assert.throws(
    () => parseFeedbackCapturePayload({ ...payload, schemaVersion: "2.0" }),
    /schemaVersion/,
  );
});

test("submits JSON with an idempotency key and progress events", async () => {
  const calls = [];
  const progress = [];
  const transport = createHttpFeedbackTransport({
    endpoint: "https://feedback.example/v1/feedback",
    headers: async () => ({ authorization: "Bearer host-owned-token" }),
    fetch: async (url, init) => {
      calls.push({ url, init });
      return receiptResponse();
    },
  });
  const submission = createFeedbackSubmission({
    payload: createPayload(),
    idempotencyKey: "idem_test_123",
  });

  const receipt = await transport.submit(submission, {
    onProgress: (event) => progress.push(event),
  });

  assert.equal(receipt.id, "fb_123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.get("idempotency-key"), "idem_test_123");
  assert.equal(
    calls[0].init.headers.get("authorization"),
    "Bearer host-owned-token",
  );
  assert.equal(calls[0].init.headers.get("content-type"), "application/json");
  assert.equal(JSON.parse(calls[0].init.body).schemaVersion, "1.0");
  assert.deepEqual(
    progress.map((event) => event.phase),
    ["preparing", "uploading", "complete"],
  );
});

test("retries only configured retryable failures using the same idempotency key", async () => {
  const keys = [];
  let attempts = 0;
  const transport = createHttpFeedbackTransport({
    endpoint: "https://feedback.example/v1/feedback",
    retry: { maxAttempts: 2, baseDelayMs: 0 },
    fetch: async (_url, init) => {
      attempts += 1;
      keys.push(init.headers.get("idempotency-key"));
      return attempts === 1
        ? new Response(null, { status: 503 })
        : receiptResponse();
    },
  });

  await transport.submit(
    createFeedbackSubmission({
      payload: createPayload(),
      idempotencyKey: "idem_retry",
    }),
  );

  assert.equal(attempts, 2);
  assert.deepEqual(keys, ["idem_retry", "idem_retry"]);
});

test("rejects invalid and oversized submissions before making a request", async () => {
  let calls = 0;
  const transport = createHttpFeedbackTransport({
    endpoint: "https://feedback.example/v1/feedback",
    maxPayloadBytes: 10,
    fetch: async () => {
      calls += 1;
      return receiptResponse();
    },
  });

  await assert.rejects(
    transport.submit(createFeedbackSubmission({ payload: createPayload() })),
    (error) =>
      error instanceof FeedbackTransportError &&
      error.code === "invalid_submission" &&
      /exceeds/.test(error.message),
  );
  assert.equal(calls, 0);
});

test("creates feedback then uploads bounded attachments idempotently", async () => {
  const calls = [];
  const transport = createHttpFeedbackTransport({
    endpoint: "https://feedback.example/v1/feedback",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return calls.length === 1
        ? apiResponse()
        : Response.json({ feedback: { version: 2 } }, { status: 201 });
    },
  });
  const data = new Blob(["synthetic screenshot"], { type: "image/png" });

  await transport.submit(
    createFeedbackSubmission({
      payload: createPayload(),
      idempotencyKey: "idem_attachment",
      attachments: [
        {
          kind: "screenshot",
          fileName: "feedback.png",
          mediaType: "image/png",
          size: data.size,
          data,
        },
      ],
    }),
  );

  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].init.body).attachments.length, 0);
  assert.match(calls[1].url, /\/fb_api_123\/attachments$/);
  assert.ok(calls[1].init.body instanceof FormData);
  assert.equal(calls[1].init.headers.has("content-type"), false);
  assert.equal(
    calls[1].init.headers.get("idempotency-key"),
    "idem_attachment:attachment:0",
  );
  assert.equal(calls[1].init.headers.get("if-match"), '"1"');
  assert.equal(calls[1].init.body.get("kind"), "screenshot");
  assert.equal(calls[1].init.body.getAll("file").length, 1);
});

test("does not retry client errors and reports cancellation consistently", async () => {
  let attempts = 0;
  const transport = createHttpFeedbackTransport({
    endpoint: "https://feedback.example/v1/feedback",
    retry: { maxAttempts: 3, baseDelayMs: 0 },
    fetch: async () => {
      attempts += 1;
      return new Response(null, { status: 400 });
    },
  });

  await assert.rejects(
    transport.submit(createFeedbackSubmission({ payload: createPayload() })),
    (error) =>
      error instanceof FeedbackTransportError &&
      error.code === "http_error" &&
      error.status === 400 &&
      error.retryable === false,
  );
  assert.equal(attempts, 1);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    transport.submit(createFeedbackSubmission({ payload: createPayload() }), {
      signal: controller.signal,
    }),
    (error) =>
      error instanceof FeedbackTransportError && error.code === "aborted",
  );
  assert.equal(attempts, 1);
});

test("maps the v1 API create response to a transport receipt", async () => {
  const transport = createHttpFeedbackTransport({
    endpoint: "https://feedback.example/v1/feedback",
    fetch: async () => apiResponse(),
  });
  const receipt = await transport.submit(
    createFeedbackSubmission({ payload: createPayload() }),
  );
  assert.deepEqual(receipt, {
    id: "fb_api_123",
    status: "received",
    createdAt: "2026-08-02T10:00:00.000Z",
    version: 1,
  });
});
