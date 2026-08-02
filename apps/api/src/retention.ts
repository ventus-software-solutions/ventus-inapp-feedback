import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import type { Feedback } from "@ventus/feedback-contracts";
import { loadApiConfiguration } from "./config.js";
import { S3ObjectStorage, type ObjectStorage } from "./objectStorage.js";

const DAY_MILLISECONDS = 86_400_000;
const retentionActor = {
  id: "system:retention",
  type: "system" as const,
  displayName: "Retention cleanup",
};

type RetentionOptions = {
  databaseUrl: string;
  objectStorage?: ObjectStorage;
  retentionDays: number;
  purgeGraceDays: number;
  batchSize?: number;
  dryRun?: boolean;
  now?: Date;
};

export type RetentionResult = {
  dryRun: boolean;
  eligibleForSoftDelete: number;
  eligibleForPurge: number;
  softDeleted: number;
  purged: number;
  attachmentObjectsDeleted: number;
};

const assertOptions = (options: RetentionOptions): void => {
  if (!Number.isInteger(options.retentionDays) || options.retentionDays < 1) {
    throw new Error("retentionDays must be a positive integer.");
  }
  if (!Number.isInteger(options.purgeGraceDays) || options.purgeGraceDays < 0) {
    throw new Error("purgeGraceDays must be a non-negative integer.");
  }
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error("batchSize must be an integer between 1 and 1000.");
  }
  if (!Number.isFinite(options.now?.getTime() ?? Date.now())) {
    throw new Error("now must be a valid date.");
  }
};

const inTransaction = async <T>(
  pool: Pool,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const tombstone = (feedback: Feedback): Feedback => ({
  id: feedback.id,
  workspaceId: feedback.workspaceId,
  projectId: feedback.projectId,
  environment: null,
  category: feedback.category,
  status: feedback.status,
  priority: "unset",
  title: "[deleted]",
  description: "",
  sourceApp: null,
  release: null,
  url: null,
  labels: [],
  context: null,
  diagnostics: null,
  attachments: [],
  claim: null,
  resolution: null,
  externalLinks: [],
  version: feedback.version,
  createdAt: feedback.createdAt,
  updatedAt: feedback.updatedAt,
  closedAt: feedback.closedAt,
  deletedAt: feedback.deletedAt,
  retainUntil: feedback.retainUntil,
});

export const runRetentionCleanup = async (
  options: RetentionOptions,
): Promise<RetentionResult> => {
  assertOptions(options);
  const pool = new Pool({ connectionString: options.databaseUrl, max: 1 });
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? 100;
  const dryRun = options.dryRun ?? true;
  const cutoff = new Date(
    now.getTime() - options.retentionDays * DAY_MILLISECONDS,
  );
  const purgeAt = new Date(
    now.getTime() + options.purgeGraceDays * DAY_MILLISECONDS,
  );
  try {
    const softDeleteCandidates = await pool.query<{ id: string }>(
      `SELECT id FROM feedback
       WHERE deleted_at IS NULL
         AND status = ANY($1::text[])
         AND updated_at <= $2
       ORDER BY updated_at, id
       LIMIT $3`,
      [["closed", "rejected"], cutoff, batchSize],
    );

    let softDeleted = 0;
    if (!dryRun && softDeleteCandidates.rows.length > 0) {
      softDeleted = await inTransaction(pool, async (client) => {
        const selected = await client.query<{
          id: string;
          version: number;
          record: Feedback;
        }>(
          `SELECT id,version,record FROM feedback
           WHERE id = ANY($1::text[])
             AND deleted_at IS NULL
             AND status = ANY($2::text[])
             AND updated_at <= $3
           ORDER BY updated_at,id
           FOR UPDATE`,
          [
            softDeleteCandidates.rows.map(({ id }) => id),
            ["closed", "rejected"],
            cutoff,
          ],
        );
        for (const row of selected.rows) {
          const deletedAt = now.toISOString();
          const retainUntil = purgeAt.toISOString();
          const record: Feedback = {
            ...row.record,
            version: row.version + 1,
            updatedAt: deletedAt,
            deletedAt,
            retainUntil,
          };
          await client.query(
            `UPDATE feedback
             SET version=$1,record=$2,updated_at=$3,deleted_at=$3,retain_until=$4,
                 claimed_by=NULL,claim_expires_at=NULL
             WHERE id=$5`,
            [record.version, record, now, purgeAt, row.id],
          );
          await client.query(
            `INSERT INTO feedback_events(
               id,workspace_id,feedback_id,event_type,actor,previous_version,version,data,occurred_at
             )
             VALUES($1,$2,$3,'deleted',$4,$5,$6,$7,$8)`,
            [
              `evt_${randomUUID().replaceAll("-", "")}`,
              record.workspaceId,
              record.id,
              retentionActor,
              row.version,
              record.version,
              {
                policyDays: options.retentionDays,
                purgeGraceDays: options.purgeGraceDays,
              },
              now,
            ],
          );
        }
        return selected.rows.length;
      });
    }

    const purgeCandidates = await pool.query<{ id: string; record: Feedback }>(
      `SELECT id,record FROM feedback
       WHERE deleted_at IS NOT NULL
         AND retain_until IS NOT NULL
         AND retain_until <= $1
         AND purged_at IS NULL
       ORDER BY retain_until,id
       LIMIT $2`,
      [now, batchSize],
    );
    const purgeIds = purgeCandidates.rows.map(({ id }) => id);
    const objectKeys =
      purgeIds.length === 0
        ? []
        : (
            await pool.query<{ object_key: string }>(
              "SELECT object_key FROM feedback_attachments WHERE feedback_id = ANY($1::text[]) ORDER BY object_key",
              [purgeIds],
            )
          ).rows.map(({ object_key }) => object_key);

    if (!dryRun && objectKeys.length > 0 && !options.objectStorage) {
      throw new Error(
        "Object storage configuration is required to purge retained attachments.",
      );
    }

    let attachmentObjectsDeleted = 0;
    let purged = 0;
    if (!dryRun && purgeIds.length > 0) {
      for (const objectKey of objectKeys) {
        await options.objectStorage!.delete(objectKey);
        attachmentObjectsDeleted += 1;
      }
      purged = await inTransaction(pool, async (client) => {
        const selected = await client.query<{ id: string; record: Feedback }>(
          `SELECT id,record FROM feedback
           WHERE id = ANY($1::text[])
             AND deleted_at IS NOT NULL
             AND retain_until <= $2
             AND purged_at IS NULL
           ORDER BY retain_until,id
           FOR UPDATE`,
          [purgeIds, now],
        );
        const lockedIds = selected.rows.map(({ id }) => id);
        if (lockedIds.length === 0) return 0;
        await client.query(
          "DELETE FROM feedback_attachment_idempotency WHERE feedback_id = ANY($1::text[])",
          [lockedIds],
        );
        await client.query(
          "DELETE FROM feedback_attachments WHERE feedback_id = ANY($1::text[])",
          [lockedIds],
        );
        await client.query(
          "DELETE FROM feedback_comments WHERE feedback_id = ANY($1::text[])",
          [lockedIds],
        );
        await client.query(
          "DELETE FROM feedback_evidence WHERE feedback_id = ANY($1::text[])",
          [lockedIds],
        );
        await client.query(
          "DELETE FROM feedback_external_links WHERE feedback_id = ANY($1::text[])",
          [lockedIds],
        );
        await client.query(
          "DELETE FROM feedback_mutation_idempotency WHERE feedback_id = ANY($1::text[])",
          [lockedIds],
        );
        await client.query(
          `DELETE FROM feedback_idempotency_keys
           WHERE response->'feedback'->>'id' = ANY($1::text[])`,
          [lockedIds],
        );
        await client.query(
          `UPDATE feedback_events
           SET actor=$1,data='{}'::jsonb,redacted_at=$2
           WHERE feedback_id = ANY($3::text[]) AND redacted_at IS NULL`,
          [retentionActor, now, lockedIds],
        );
        for (const row of selected.rows) {
          const scrubbed = tombstone(row.record);
          await client.query(
            `UPDATE feedback
             SET status=$1,priority='unset',release=NULL,environment=NULL,labels='{}'::text[],
                 claimed_by=NULL,claim_expires_at=NULL,record=$2,reporter_token_hash=NULL,purged_at=$3
             WHERE id=$4`,
            [scrubbed.status, scrubbed, now, row.id],
          );
        }
        return selected.rows.length;
      });
    }

    return {
      dryRun,
      eligibleForSoftDelete: softDeleteCandidates.rows.length,
      eligibleForPurge: purgeCandidates.rows.length,
      softDeleted,
      purged,
      attachmentObjectsDeleted,
    };
  } finally {
    await pool.end();
  }
};

const createConfiguredObjectStorage = (): S3ObjectStorage | undefined => {
  const configuration = loadApiConfiguration();
  const attachments = configuration.attachments;
  if (!attachments.bucket) return undefined;
  return new S3ObjectStorage(attachments.bucket, {
    region: attachments.region,
    ...(attachments.endpoint ? { endpoint: attachments.endpoint } : {}),
    ...(attachments.publicEndpoint
      ? { publicEndpoint: attachments.publicEndpoint }
      : {}),
    ...(attachments.accessKeyId
      ? { accessKeyId: attachments.accessKeyId }
      : {}),
    ...(attachments.secretAccessKey
      ? { secretAccessKey: attachments.secretAccessKey }
      : {}),
    forcePathStyle: attachments.forcePathStyle,
    serverSideEncryption: attachments.serverSideEncryption,
  });
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const configuration = loadApiConfiguration();
  if (!configuration.databaseUrl)
    throw new Error("VENTUS_DATABASE_URL is required for retention cleanup.");
  if (configuration.retention.days === null) {
    throw new Error(
      "VENTUS_RETENTION_DAYS must be configured before retention cleanup can run.",
    );
  }
  const objectStorage = createConfiguredObjectStorage();
  const result = await runRetentionCleanup({
    databaseUrl: configuration.databaseUrl,
    retentionDays: configuration.retention.days,
    purgeGraceDays: configuration.retention.purgeGraceDays,
    batchSize: configuration.retention.batchSize,
    dryRun: configuration.retention.dryRun,
    ...(objectStorage ? { objectStorage } : {}),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
