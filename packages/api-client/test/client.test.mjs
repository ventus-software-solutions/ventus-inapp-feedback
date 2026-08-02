import assert from "node:assert/strict";
import test from "node:test";
import { FeedbackApiClient, FeedbackApiError } from "../dist/index.js";

test("sends auth, idempotency, filters, and optimistic versions", async () => {
  const calls = [];
  const client = new FeedbackApiClient({
    baseUrl: "https://feedback.example/v1/",
    token: async () => "service-token",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return Response.json({
        items: [],
        nextCursor: null,
        feedback: { id: "fb_1" },
      });
    },
  });

  await client.listFeedback({ status: ["new", "reopened"], limit: 10 });
  await client.updateFeedback(
    "fb/a",
    { version: 4, priority: "high" },
    { idempotencyKey: "update-feedback-4" },
  );

  assert.match(calls[0].url, /status=new&status=reopened&limit=10/);
  assert.equal(
    calls[0].init.headers.get("authorization"),
    "Bearer service-token",
  );
  assert.match(calls[1].url, /feedback\/fb%2Fa$/);
  assert.equal(calls[1].init.headers.get("if-match"), '"4"');
  assert.equal(
    calls[1].init.headers.get("idempotency-key"),
    "update-feedback-4",
  );
});

test("throws structured API errors without exposing response internals", async () => {
  const client = new FeedbackApiClient({
    baseUrl: "https://feedback.example/v1",
    fetch: async () =>
      Response.json(
        {
          error: {
            code: "conflict",
            message: "Version mismatch.",
            requestId: "req_1",
          },
        },
        { status: 409 },
      ),
  });

  await assert.rejects(
    client.getFeedback("fb_1"),
    (error) =>
      error instanceof FeedbackApiError &&
      error.status === 409 &&
      error.code === "conflict" &&
      error.requestId === "req_1",
  );
});

test("uploads attachments with version and idempotency headers", async () => {
  let call;
  const client = new FeedbackApiClient({
    baseUrl: "https://feedback.example/v1",
    token: "agent-token",
    fetch: async (url, init) => {
      call = { url, init };
      return Response.json({
        feedback: { id: "fb_1", version: 3 },
        attachment: {
          id: "att_1",
          kind: "text",
          fileName: "notes.txt",
          mediaType: "text/plain",
          size: 5,
          createdAt: "2026-08-02T10:00:00.000Z",
        },
      });
    },
  });

  const result = await client.uploadAttachment("fb_1", {
    version: 2,
    idempotencyKey: "idem-upload-client",
    kind: "text",
    fileName: "notes.txt",
    data: new Blob(["notes"], { type: "text/plain" }),
  });

  assert.equal(result.attachment.id, "att_1");
  assert.match(call.url, /feedback\/fb_1\/attachments$/);
  assert.equal(call.init.headers.get("if-match"), '"2"');
  assert.equal(call.init.headers.get("idempotency-key"), "idem-upload-client");
  assert.equal(call.init.headers.has("content-type"), false);
  assert.ok(call.init.body instanceof FormData);
});
