import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { FeedbackApiClient } from "../packages/api-client/dist/index.js";
import { S3ObjectStorage } from "../apps/api/dist/objectStorage.js";
import { runRetentionCleanup } from "../apps/api/dist/retention.js";

const baseUrl = process.env.VENTUS_SMOKE_API_URL ?? "http://127.0.0.1:8080/v1";
const databaseUrl = process.env.VENTUS_SMOKE_DATABASE_URL;
const projectKey = process.env.VENTUS_SMOKE_PROJECT_KEY;
const agentToken = process.env.VENTUS_SMOKE_AGENT_TOKEN;
const verifierToken = process.env.VENTUS_SMOKE_VERIFIER_TOKEN ?? agentToken;
if (!databaseUrl || !projectKey || !agentToken || !verifierToken) {
  throw new Error(
    "Retention smoke test credentials and database URL are required.",
  );
}

const ingestion = new FeedbackApiClient({ baseUrl, projectKey });
const agent = new FeedbackApiClient({ baseUrl, token: agentToken });
const verifier = new FeedbackApiClient({ baseUrl, token: verifierToken });
const marker = `retention-secret-${randomUUID()}`;
const created = await ingestion.createFeedback(
  {
    schemaVersion: "1.0",
    projectId: "prj_demo",
    category: "bug",
    title: marker,
    description: `Sensitive reporter text ${marker}`,
    environment: "retention-smoke",
    context: { privateValue: marker },
  },
  `retention-${randomUUID()}`,
);
const uploaded = await ingestion.uploadAttachment(created.feedback.id, {
  version: created.feedback.version,
  idempotencyKey: `retention-attachment-${created.feedback.id}`,
  kind: "text",
  fileName: `${marker}.txt`,
  data: new Blob([marker], { type: "text/plain" }),
});
const claimed = await agent.claimFeedback(created.feedback.id, {
  version: uploaded.feedback.version,
  leaseSeconds: 300,
});
const resolved = await agent.resolveFeedback(created.feedback.id, {
  version: claimed.feedback.version,
  reason: "fixed",
  summary: `Resolution ${marker}`,
});
await verifier.closeFeedback(created.feedback.id, {
  version: resolved.feedback.version,
  note: `Verification ${marker}`,
});

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const now = new Date();
const oldTimestamp = new Date(now.getTime() - 2 * 86_400_000);
await pool.query(
  `UPDATE feedback
   SET updated_at=$1,record=jsonb_set(record,'{updatedAt}',to_jsonb($2::text))
   WHERE id=$3`,
  [oldTimestamp, oldTimestamp.toISOString(), created.feedback.id],
);

const objectStorage = new S3ObjectStorage(
  process.env.VENTUS_SMOKE_S3_BUCKET ?? "ventus-feedback",
  {
    endpoint: process.env.VENTUS_SMOKE_S3_ENDPOINT ?? "http://127.0.0.1:19000",
    region: process.env.VENTUS_SMOKE_S3_REGION ?? "us-east-1",
    accessKeyId: process.env.VENTUS_SMOKE_S3_ACCESS_KEY_ID ?? "ventus-local",
    secretAccessKey:
      process.env.VENTUS_SMOKE_S3_SECRET_ACCESS_KEY ?? "ventus-local-password",
    forcePathStyle: true,
  },
);

const cleanupOptions = {
  databaseUrl,
  objectStorage,
  retentionDays: 1,
  purgeGraceDays: 0,
  batchSize: 25,
  now,
};
const preview = await runRetentionCleanup({ ...cleanupOptions, dryRun: true });
assert.equal(preview.dryRun, true);
assert.ok(preview.eligibleForSoftDelete >= 1);
assert.equal(preview.softDeleted, 0);

const cleaned = await runRetentionCleanup({ ...cleanupOptions, dryRun: false });
assert.ok(cleaned.softDeleted >= 1);
assert.ok(cleaned.purged >= 1);
assert.ok(cleaned.attachmentObjectsDeleted >= 1);

const stored = await pool.query(
  `SELECT record,deleted_at,retain_until,purged_at,reporter_token_hash
   FROM feedback WHERE id=$1`,
  [created.feedback.id],
);
const row = stored.rows[0];
assert.ok(row.deleted_at);
assert.ok(row.retain_until);
assert.ok(row.purged_at);
assert.equal(row.reporter_token_hash, null);
assert.equal(row.record.title, "[deleted]");
assert.equal(row.record.description, "");
assert.equal(JSON.stringify(row.record).includes(marker), false);

const attachments = await pool.query(
  "SELECT count(*)::int AS count FROM feedback_attachments WHERE feedback_id=$1",
  [created.feedback.id],
);
assert.equal(attachments.rows[0].count, 0);
const events = await pool.query(
  "SELECT actor,data,redacted_at FROM feedback_events WHERE feedback_id=$1",
  [created.feedback.id],
);
assert.ok(events.rows.length >= 6);
for (const event of events.rows) {
  assert.equal(event.actor.id, "system:retention");
  assert.deepEqual(event.data, {});
  assert.ok(event.redacted_at);
}

const hidden = await fetch(`${baseUrl}/feedback/${created.feedback.id}`, {
  headers: { authorization: `Bearer ${agentToken}` },
});
assert.equal(hidden.status, 404);
await pool.end();
process.stdout.write(
  `${created.feedback.id} was soft-deleted and purged; ${cleaned.attachmentObjectsDeleted} attachment object removed\n`,
);
