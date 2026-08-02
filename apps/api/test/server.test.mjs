import assert from "node:assert/strict";
import test from "node:test";
import { loadApiConfiguration } from "../dist/config.js";
import { MemoryFeedbackRepository } from "../dist/memoryRepository.js";
import { buildApiServer } from "../dist/server.js";
import { MemoryObjectStorage } from "../dist/objectStorage.js";
import {
  createFeedbackCaptureCore,
  createFeedbackSubmission,
  createHttpFeedbackTransport,
} from "@ventus-software-solutions/feedback-browser";

const configuration = loadApiConfiguration({
  VENTUS_APPLICATION_VERSION: "test-build",
  VENTUS_PROJECT_KEYS_JSON: JSON.stringify({
    "browser-key": {
      workspaceId: "ws_test",
      projectId: "prj_test",
      allowedOrigins: ["https://app.example"],
    },
  }),
  VENTUS_SERVICE_TOKENS_JSON: JSON.stringify({
    "agent-token": {
      workspaceId: "ws_test",
      actorId: "agent_test",
      actorType: "agent",
      displayName: "Test agent",
      scopes: [
        "feedback:read",
        "feedback:triage",
        "feedback:comment",
        "feedback:resolve",
      ],
    },
    "verifier-token": {
      workspaceId: "ws_test",
      actorId: "user_verifier",
      actorType: "user",
      displayName: "Test verifier",
      scopes: ["feedback:read", "feedback:close"],
    },
  }),
});

const createServer = () =>
  buildApiServer({
    configuration,
    repository: new MemoryFeedbackRepository(),
    logger: false,
  });

const multipartBody = ({ boundary, kind, fileName, mediaType, content }) =>
  Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\n${kind}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${mediaType}\r\n\r\n${content}\r\n--${boundary}--\r\n`,
  );

const createBody = {
  schemaVersion: "1.0",
  projectId: "prj_test",
  category: "bug",
  title: "Checkout stalled",
  description: "The checkout confirmation did not become available.",
  reporterTokenRequested: true,
};

test("reports health, readiness, and version without authentication", async (t) => {
  const server = createServer();
  t.after(() => server.close());

  assert.equal((await server.inject({ url: "/v1/health" })).statusCode, 200);
  assert.equal((await server.inject({ url: "/v1/ready" })).statusCode, 200);
  const version = await server.inject({ url: "/v1/version" });
  assert.equal(version.json().applicationVersion, "test-build");
  assert.ok(version.headers["x-request-id"]);
});

test("requires an explicit bounded trust-proxy configuration", () => {
  assert.equal(loadApiConfiguration({ VENTUS_TRUST_PROXY: "2" }).trustProxy, 2);
  assert.deepEqual(
    loadApiConfiguration({ VENTUS_TRUST_PROXY: "loopback,10.0.0.0/8" })
      .trustProxy,
    ["loopback", "10.0.0.0/8"],
  );
  assert.throws(
    () => loadApiConfiguration({ VENTUS_TRUST_PROXY: "true" }),
    /unsafe/,
  );
});

test("keeps retention disabled and dry-run safe until an operator chooses a policy", () => {
  const defaults = loadApiConfiguration({});
  assert.deepEqual(defaults.retention, {
    days: null,
    purgeGraceDays: 7,
    batchSize: 100,
    dryRun: true,
  });
  const configured = loadApiConfiguration({
    VENTUS_RETENTION_DAYS: "365",
    VENTUS_RETENTION_PURGE_GRACE_DAYS: "14",
    VENTUS_RETENTION_BATCH_SIZE: "250",
    VENTUS_RETENTION_DRY_RUN: "false",
  });
  assert.deepEqual(configured.retention, {
    days: 365,
    purgeGraceDays: 14,
    batchSize: 250,
    dryRun: false,
  });
  assert.throws(
    () => loadApiConfiguration({ VENTUS_RETENTION_DAYS: "0" }),
    /positive integer/,
  );
  assert.throws(
    () => loadApiConfiguration({ VENTUS_RETENTION_BATCH_SIZE: "1001" }),
    /between 1 and 1000/,
  );
});

test("enforces origin, project, validation, and idempotency at ingestion", async (t) => {
  const server = createServer();
  t.after(() => server.close());
  const request = {
    method: "POST",
    url: "/v1/feedback",
    headers: {
      "x-feedback-project-key": "browser-key",
      "idempotency-key": "idem-create-1",
      origin: "https://app.example",
    },
    payload: createBody,
  };

  const created = await server.inject(request);
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().feedback.status, "new");
  assert.equal(created.json().reporterToken.length > 20, true);
  assert.equal(
    created.headers["access-control-allow-origin"],
    "https://app.example",
  );
  assert.equal(created.headers.etag, '"1"');

  const replay = await server.inject(request);
  assert.equal(replay.statusCode, 201);
  assert.equal(replay.json().feedback.id, created.json().feedback.id);

  const conflict = await server.inject({
    ...request,
    payload: { ...createBody, title: "Different input" },
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error.code, "conflict");

  const deniedOrigin = await server.inject({
    ...request,
    headers: {
      ...request.headers,
      "idempotency-key": "idem-create-2",
      origin: "https://evil.example",
    },
  });
  assert.equal(deniedOrigin.statusCode, 403);
});

test("scopes reporter follow-up tokens to the feedback that issued them", async (t) => {
  const server = createServer();
  t.after(() => server.close());
  const create = (key) =>
    server.inject({
      method: "POST",
      url: "/v1/feedback",
      headers: {
        "x-feedback-project-key": "browser-key",
        "idempotency-key": key,
        origin: "https://app.example",
      },
      payload: createBody,
    });
  const first = await create("idem-reporter-1");
  const second = await create("idem-reporter-2");
  const token = first.json().reporterToken;
  const firstId = first.json().feedback.id;

  const allowed = await server.inject({
    url: `/v1/feedback/${firstId}`,
    headers: { "x-feedback-reporter-token": token },
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().id, firstId);

  const crossReport = await server.inject({
    url: `/v1/feedback/${second.json().feedback.id}`,
    headers: { "x-feedback-reporter-token": token },
  });
  assert.equal(crossReport.statusCode, 401);
});

test("rate limits public ingestion by project credential and client address", async (t) => {
  const server = buildApiServer({
    configuration: {
      ...configuration,
      ingestionRateLimit: { max: 1, windowMilliseconds: 60_000 },
    },
    repository: new MemoryFeedbackRepository(),
    logger: false,
  });
  t.after(() => server.close());
  const request = (key) =>
    server.inject({
      method: "POST",
      url: "/v1/feedback",
      headers: {
        "x-feedback-project-key": "browser-key",
        "idempotency-key": key,
        origin: "https://app.example",
      },
      payload: createBody,
    });
  assert.equal((await request("idem-rate-1")).statusCode, 201);
  const limited = await request("idem-rate-2");
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error.code, "rate_limited");
});

test("supports the agent claim-resolve and independent verify-close workflow", async (t) => {
  const server = createServer();
  t.after(() => server.close());
  const created = await server.inject({
    method: "POST",
    url: "/v1/feedback",
    headers: {
      "x-feedback-project-key": "browser-key",
      "idempotency-key": "idem-workflow-1",
      origin: "https://app.example",
    },
    payload: createBody,
  });
  const feedbackId = created.json().feedback.id;
  const agentHeaders = { authorization: "Bearer agent-token" };

  const claimed = await server.inject({
    method: "POST",
    url: `/v1/feedback/${feedbackId}/claim`,
    headers: {
      ...agentHeaders,
      "if-match": '"1"',
      "idempotency-key": "idem-claim-workflow",
    },
    payload: { version: 1, leaseSeconds: 600 },
  });
  assert.equal(claimed.statusCode, 200);
  assert.equal(claimed.json().feedback.status, "in_progress");
  assert.equal(claimed.json().feedback.claim.owner.id, "agent_test");

  const stale = await server.inject({
    method: "PATCH",
    url: `/v1/feedback/${feedbackId}`,
    headers: {
      ...agentHeaders,
      "if-match": '"1"',
      "idempotency-key": "idem-stale-workflow",
    },
    payload: { version: 1, priority: "high" },
  });
  assert.equal(stale.statusCode, 409);

  const resolved = await server.inject({
    method: "POST",
    url: `/v1/feedback/${feedbackId}/resolve`,
    headers: {
      ...agentHeaders,
      "if-match": '"2"',
      "idempotency-key": "idem-resolve-workflow",
    },
    payload: {
      version: 2,
      reason: "fixed",
      summary:
        "Patched the checkout state transition and added a regression test.",
      links: [
        { type: "commit", url: "https://git.example/commit/abc", label: "abc" },
      ],
    },
  });
  assert.equal(resolved.statusCode, 200);
  assert.equal(resolved.json().feedback.status, "resolved");
  assert.equal(resolved.json().feedback.claim, null);

  const replayedResolution = await server.inject({
    method: "POST",
    url: `/v1/feedback/${feedbackId}/resolve`,
    headers: {
      ...agentHeaders,
      "if-match": '"2"',
      "idempotency-key": "idem-resolve-workflow",
    },
    payload: {
      version: 2,
      reason: "fixed",
      summary:
        "Patched the checkout state transition and added a regression test.",
      links: [
        { type: "commit", url: "https://git.example/commit/abc", label: "abc" },
      ],
    },
  });
  assert.equal(replayedResolution.statusCode, 200);
  assert.deepEqual(replayedResolution.json(), resolved.json());

  const changedReplay = await server.inject({
    method: "POST",
    url: `/v1/feedback/${feedbackId}/resolve`,
    headers: {
      ...agentHeaders,
      "if-match": '"2"',
      "idempotency-key": "idem-resolve-workflow",
    },
    payload: { version: 2, reason: "fixed", summary: "Different request" },
  });
  assert.equal(changedReplay.statusCode, 409);

  const agentClose = await server.inject({
    method: "POST",
    url: `/v1/feedback/${feedbackId}/close`,
    headers: {
      ...agentHeaders,
      "if-match": '"3"',
      "idempotency-key": "idem-agent-close",
    },
    payload: { version: 3, note: "Agent attempted closure." },
  });
  assert.equal(agentClose.statusCode, 403);

  const closed = await server.inject({
    method: "POST",
    url: `/v1/feedback/${feedbackId}/close`,
    headers: {
      authorization: "Bearer verifier-token",
      "if-match": '"3"',
      "idempotency-key": "idem-verified-close",
    },
    payload: { version: 3, note: "Verified in the deployed test build." },
  });
  assert.equal(closed.statusCode, 200);
  assert.equal(closed.json().feedback.status, "closed");

  const events = await server.inject({
    url: `/v1/feedback/${feedbackId}/events`,
    headers: agentHeaders,
  });
  assert.deepEqual(
    events.json().items.map((event) => event.type),
    ["created", "claim_acquired", "resolved", "closed"],
  );
});

test("never reveals tenant records across workspace credentials", async (t) => {
  const repository = new MemoryFeedbackRepository();
  const server = buildApiServer({ configuration, repository, logger: false });
  t.after(() => server.close());
  const created = await server.inject({
    method: "POST",
    url: "/v1/feedback",
    headers: {
      "x-feedback-project-key": "browser-key",
      "idempotency-key": "idem-tenant-1",
      origin: "https://app.example",
    },
    payload: createBody,
  });
  const feedbackId = created.json().feedback.id;
  const isolated = buildApiServer({
    configuration,
    repository,
    logger: false,
    resolveAuth: () => ({
      workspaceId: "ws_other",
      projectId: null,
      actor: { id: "other", type: "user", displayName: "Other" },
      scopes: ["feedback:read"],
      kind: "service",
    }),
  });
  t.after(() => isolated.close());
  const response = await isolated.inject({ url: `/v1/feedback/${feedbackId}` });
  assert.equal(response.statusCode, 404);
});

test("accepts the public browser transport envelope end to end", async (t) => {
  const storage = new MemoryObjectStorage();
  const server = buildApiServer({
    configuration: {
      ...configuration,
      attachments: {
        ...configuration.attachments,
        allowUnscanned: true,
      },
    },
    repository: new MemoryFeedbackRepository(),
    objectStorage: storage,
    logger: false,
  });
  t.after(() => server.close());
  const transport = createHttpFeedbackTransport({
    endpoint: "http://feedback.local/v1/feedback",
    headers: {
      "x-feedback-project-key": "browser-key",
      origin: "https://app.example",
    },
    fetch: async (url, init) => {
      const target = new URL(String(url));
      const forwarded = new Request(url, init);
      const rawBody = Buffer.from(await forwarded.arrayBuffer());
      const response = await server.inject({
        method: forwarded.method,
        url: `${target.pathname}${target.search}`,
        headers: Object.fromEntries(forwarded.headers.entries()),
        payload: rawBody,
      });
      return new Response(response.body, {
        status: response.statusCode,
        headers: response.headers,
      });
    },
  });
  const payload = createFeedbackCaptureCore().getPayload({
    category: "idea",
    sourceApp: "integration-test",
    title: "Add a compact mode",
    description: "The feedback trigger should offer a compact display option.",
    context: { route: "settings" },
  });

  const receipt = await transport.submit(
    createFeedbackSubmission({
      payload,
      idempotencyKey: "idem-browser-envelope",
      attachments: [
        {
          kind: "screenshot",
          fileName: "pixel.png",
          mediaType: "image/png",
          data: new Blob(
            [
              Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
                "base64",
              ),
            ],
            { type: "image/png" },
          ),
          size: 68,
        },
      ],
    }),
  );

  assert.equal(receipt.status, "received");
  assert.match(receipt.id, /^fb_/);
  assert.equal(receipt.version, 2);
  assert.equal(storage.objects.size, 1);
});

test("validates, stores, and authorizes attachment downloads", async (t) => {
  const storage = new MemoryObjectStorage();
  const server = buildApiServer({
    configuration: {
      ...configuration,
      attachments: {
        ...configuration.attachments,
        allowUnscanned: true,
      },
    },
    repository: new MemoryFeedbackRepository(),
    objectStorage: storage,
    logger: false,
  });
  t.after(() => server.close());
  const created = await server.inject({
    method: "POST",
    url: "/v1/feedback",
    headers: {
      "x-feedback-project-key": "browser-key",
      "idempotency-key": "idem-attachment-1",
      origin: "https://app.example",
    },
    payload: createBody,
  });
  const feedbackId = created.json().feedback.id;
  const boundary = "ventus-test-boundary";
  const uploaded = await server.inject({
    method: "POST",
    url: `/v1/feedback/${feedbackId}/attachments`,
    headers: {
      "x-feedback-project-key": "browser-key",
      "if-match": '"1"',
      "idempotency-key": "idem-upload-1",
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody({
      boundary,
      kind: "text",
      fileName: "../notes.txt",
      mediaType: "text/plain",
      content: "synthetic attachment",
    }),
  });
  assert.equal(uploaded.statusCode, 201);
  assert.equal(uploaded.json().attachment.fileName, "notes.txt");
  assert.equal(uploaded.json().attachment.mediaType, "text/plain");
  assert.equal(storage.objects.size, 1);

  const replayedUpload = await server.inject({
    method: "POST",
    url: `/v1/feedback/${feedbackId}/attachments`,
    headers: {
      "x-feedback-project-key": "browser-key",
      "if-match": '"1"',
      "idempotency-key": "idem-upload-1",
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody({
      boundary,
      kind: "text",
      fileName: "../notes.txt",
      mediaType: "text/plain",
      content: "synthetic attachment",
    }),
  });
  assert.equal(replayedUpload.statusCode, 201);
  assert.equal(
    replayedUpload.json().attachment.id,
    uploaded.json().attachment.id,
  );
  assert.equal(replayedUpload.json().feedback.version, 2);
  assert.equal(storage.objects.size, 1);

  const attachmentId = uploaded.json().attachment.id;
  const downloaded = await server.inject({
    url: `/v1/feedback/${feedbackId}/attachments/${attachmentId}`,
    headers: { authorization: "Bearer agent-token" },
  });
  assert.equal(downloaded.statusCode, 302);
  assert.match(downloaded.headers.location, /^memory:\/\/attachment\//);

  const reporterDownload = await server.inject({
    url: `/v1/feedback/${feedbackId}/attachments/${attachmentId}`,
    headers: { "x-feedback-reporter-token": created.json().reporterToken },
  });
  assert.equal(reporterDownload.statusCode, 302);

  const mismatch = await server.inject({
    method: "POST",
    url: `/v1/feedback/${feedbackId}/attachments`,
    headers: {
      "x-feedback-project-key": "browser-key",
      "if-match": '"2"',
      "idempotency-key": "idem-upload-2",
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody({
      boundary,
      kind: "image",
      fileName: "fake.png",
      mediaType: "image/png",
      content: "this is plain text",
    }),
  });
  assert.equal(mismatch.statusCode, 422);
  assert.equal(storage.objects.size, 1);
});
