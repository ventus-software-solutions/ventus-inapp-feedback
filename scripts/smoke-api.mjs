import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  FeedbackApiClient,
  FeedbackApiError,
} from "../packages/api-client/dist/index.js";

const baseUrl = process.env.VENTUS_SMOKE_API_URL ?? "http://127.0.0.1:8080/v1";
const projectKey = process.env.VENTUS_SMOKE_PROJECT_KEY;
const agentToken = process.env.VENTUS_SMOKE_AGENT_TOKEN;
const verifierToken = process.env.VENTUS_SMOKE_VERIFIER_TOKEN ?? agentToken;
const contenderToken = process.env.VENTUS_SMOKE_CONTENDER_TOKEN;
if (!projectKey || !agentToken || !verifierToken || !contenderToken) {
  throw new Error("Smoke test credentials are required.");
}

const ingestion = new FeedbackApiClient({ baseUrl, projectKey });
const agent = new FeedbackApiClient({ baseUrl, token: agentToken });
const verifier = new FeedbackApiClient({ baseUrl, token: verifierToken });
const contender = new FeedbackApiClient({ baseUrl, token: contenderToken });

const contested = await ingestion.createFeedback(
  {
    schemaVersion: "1.0",
    projectId: "prj_demo",
    category: "bug",
    title: "Concurrent claim smoke test",
    description: "Verify that PostgreSQL serializes competing agent claims.",
    environment: "smoke",
  },
  `smoke-contested-${randomUUID()}`,
);
const competingClaims = await Promise.allSettled([
  agent.claimFeedback(contested.feedback.id, {
    version: contested.feedback.version,
    leaseSeconds: 300,
  }),
  contender.claimFeedback(contested.feedback.id, {
    version: contested.feedback.version,
    leaseSeconds: 300,
  }),
]);
assert.equal(
  competingClaims.filter((claim) => claim.status === "fulfilled").length,
  1,
);
const rejectedClaim = competingClaims.find(
  (claim) => claim.status === "rejected",
);
assert.ok(rejectedClaim && rejectedClaim.reason instanceof FeedbackApiError);
assert.equal(rejectedClaim.reason.status, 409);

const created = await ingestion.createFeedback(
  {
    schemaVersion: "1.0",
    projectId: "prj_demo",
    category: "bug",
    title: "Container smoke test",
    description:
      "Exercise the PostgreSQL workflow through the published API client.",
    environment: "smoke",
  },
  `smoke-${randomUUID()}`,
);
const feedbackId = created.feedback.id;
const uploaded = await ingestion.uploadAttachment(feedbackId, {
  version: created.feedback.version,
  idempotencyKey: `smoke-attachment-${feedbackId}`,
  kind: "text",
  fileName: "smoke.txt",
  data: new Blob(["Ventus attachment smoke test"], { type: "text/plain" }),
});
const downloadRedirect = await fetch(
  `${baseUrl}/feedback/${feedbackId}/attachments/${uploaded.attachment.id}`,
  {
    headers: { authorization: `Bearer ${agentToken}` },
    redirect: "manual",
  },
);
assert.equal(downloadRedirect.status, 302);
const downloadUrl = downloadRedirect.headers.get("location");
assert.ok(downloadUrl);
const downloaded = await fetch(downloadUrl);
assert.equal(downloaded.status, 200);
assert.equal(await downloaded.text(), "Ventus attachment smoke test");
const claimed = await agent.claimFeedback(
  feedbackId,
  {
    version: uploaded.feedback.version,
    leaseSeconds: 300,
  },
  { idempotencyKey: `smoke-claim-${feedbackId}` },
);
const replayedClaim = await agent.claimFeedback(
  feedbackId,
  {
    version: uploaded.feedback.version,
    leaseSeconds: 300,
  },
  { idempotencyKey: `smoke-claim-${feedbackId}` },
);
assert.deepEqual(replayedClaim, claimed);
await assert.rejects(
  agent.claimFeedback(
    feedbackId,
    {
      version: uploaded.feedback.version,
      leaseSeconds: 301,
    },
    { idempotencyKey: `smoke-claim-${feedbackId}` },
  ),
  (error) => error instanceof FeedbackApiError && error.status === 409,
);
const resolved = await agent.resolveFeedback(
  feedbackId,
  {
    version: claimed.feedback.version,
    reason: "fixed",
    summary: "Container workflow completed successfully.",
  },
  { idempotencyKey: `smoke-resolve-${feedbackId}` },
);
const closed = await verifier.closeFeedback(
  feedbackId,
  {
    version: resolved.feedback.version,
    note: "Verified by the container smoke test.",
  },
  { idempotencyKey: `smoke-close-${feedbackId}` },
);
const events = await agent.listEvents(feedbackId);

assert.equal(closed.feedback.status, "closed");
assert.deepEqual(
  events.items.map((event) => event.type),
  ["created", "attachment_added", "claim_acquired", "resolved", "closed"],
);
process.stdout.write(
  `${feedbackId} closed at version ${closed.feedback.version} with ${uploaded.attachment.id}; claim replayed idempotently and concurrent claim serialized for ${contested.feedback.id}\n`,
);
