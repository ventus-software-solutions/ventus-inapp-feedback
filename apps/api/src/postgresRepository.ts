import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import {
  evaluateFeedbackTransition,
  normalizeLabels,
  type AddCommentRequest,
  type AddCommentResponse,
  type AddEvidenceRequest,
  type AddEvidenceResponse,
  type ClaimFeedbackRequest,
  type CloseFeedbackRequest,
  type CreateFeedbackRequest,
  type CreateFeedbackResponse,
  type CursorPage,
  type Feedback,
  type FeedbackComment,
  type FeedbackEvent,
  type FeedbackEventType,
  type FeedbackAttachment,
  type FeedbackMutationResponse,
  type FeedbackScope,
  type ListFeedbackQuery,
  type MutationVersionRequest,
  type RejectFeedbackRequest,
  type RenewFeedbackClaimRequest,
  type ReopenFeedbackRequest,
  type ResolveFeedbackRequest,
  type UpdateFeedbackRequest,
} from "@ventus-software-solutions/feedback-contracts";
import {
  RepositoryError,
  type FeedbackRepository,
  type RepositoryContext,
  type StoreAttachmentInput,
  type StoredAttachment,
} from "./repository.js";
import { safeEqual } from "./auth.js";

const id = (prefix: string): string =>
  `${prefix}_${randomUUID().replaceAll("-", "")}`;
const now = (): string => new Date().toISOString();
const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const clone = <T>(value: T): T => structuredClone(value);

export class PostgresFeedbackRepository implements FeedbackRepository {
  readonly #pool: Pool;

  constructor(databaseUrl: string, maximumConnections = 10) {
    this.#pool = new Pool({
      connectionString: databaseUrl,
      max: maximumConnections,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
  }

  async ready(): Promise<boolean> {
    try {
      await this.#pool.query("SELECT 1 FROM schema_migrations LIMIT 1");
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async authenticateReporter(
    feedbackId: string,
    token: string,
  ): Promise<RepositoryContext | null> {
    const result = await this.#pool.query<{
      workspace_id: string;
      project_id: string;
      reporter_token_hash: string;
    }>(
      `SELECT workspace_id, project_id, reporter_token_hash
         FROM feedback
        WHERE id = $1 AND deleted_at IS NULL AND reporter_token_hash IS NOT NULL`,
      [feedbackId],
    );
    const row = result.rows[0];
    if (!row || !safeEqual(hash(token), row.reporter_token_hash)) return null;
    return {
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      actor: {
        id: `reporter:${feedbackId}`,
        type: "reporter",
        displayName: "Reporter",
      },
      scopes: ["feedback:read", "feedback:triage"],
    };
  }

  async create(
    context: RepositoryContext,
    input: CreateFeedbackRequest,
    idempotencyKey: string,
  ): Promise<CreateFeedbackResponse> {
    if (context.projectId && context.projectId !== input.projectId) {
      throw new RepositoryError(
        "forbidden",
        "The credential cannot submit to this project.",
      );
    }
    const client = await this.#pool.connect();
    const keyHash = hash(idempotencyKey);
    const requestHash = hash(JSON.stringify(input));
    try {
      await client.query("BEGIN");
      const replay = await client.query<{
        request_hash: string;
        response: CreateFeedbackResponse;
      }>(
        "SELECT request_hash, response FROM feedback_idempotency_keys WHERE workspace_id=$1 AND project_id=$2 AND idempotency_key_hash=$3 FOR UPDATE",
        [context.workspaceId, input.projectId, keyHash],
      );
      const previous = replay.rows[0];
      if (previous) {
        if (previous.request_hash !== requestHash)
          throw new RepositoryError(
            "conflict",
            "The idempotency key was already used with different input.",
          );
        await client.query("COMMIT");
        return clone(previous.response);
      }

      const timestamp = now();
      const feedback: Feedback = {
        id: id("fb"),
        workspaceId: context.workspaceId,
        projectId: input.projectId,
        environment: input.environment?.trim() || null,
        category: input.category,
        status: "new",
        priority: "unset",
        title: input.title.trim(),
        description: input.description.trim(),
        sourceApp: input.sourceApp?.trim() || null,
        release: input.release?.trim() || null,
        url: input.url?.trim() || null,
        labels: [],
        context: input.context ?? null,
        diagnostics: input.diagnostics ?? null,
        attachments: [],
        claim: null,
        resolution: null,
        externalLinks: [],
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        closedAt: null,
        deletedAt: null,
        retainUntil: null,
      };
      const reporterToken = input.reporterTokenRequested
        ? randomBytes(32).toString("base64url")
        : undefined;
      await client.query(
        `INSERT INTO feedback(id,workspace_id,project_id,status,category,priority,release,environment,labels,claimed_by,claim_expires_at,version,record,reporter_token_hash,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL,$10,$11,$12,$13,$13)`,
        [
          feedback.id,
          feedback.workspaceId,
          feedback.projectId,
          feedback.status,
          feedback.category,
          feedback.priority,
          feedback.release,
          feedback.environment,
          feedback.labels,
          feedback.version,
          feedback,
          reporterToken ? hash(reporterToken) : null,
          timestamp,
        ],
      );
      await this.insertEvent(client, feedback, "created", context, null, {
        category: feedback.category,
      });
      const storedResponse: CreateFeedbackResponse = { feedback };
      await client.query(
        `INSERT INTO feedback_idempotency_keys(workspace_id,project_id,idempotency_key_hash,request_hash,response,expires_at)
         VALUES($1,$2,$3,$4,$5,now()+interval '24 hours')`,
        [
          context.workspaceId,
          input.projectId,
          keyHash,
          requestHash,
          storedResponse,
        ],
      );
      await client.query("COMMIT");
      return {
        feedback: clone(feedback),
        ...(reporterToken ? { reporterToken } : {}),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(
    context: RepositoryContext,
    query: ListFeedbackQuery,
  ): Promise<CursorPage<Feedback>> {
    const values: unknown[] = [context.workspaceId];
    const where = ["workspace_id=$1", "deleted_at IS NULL"];
    const add = (sql: string, value: unknown): void => {
      values.push(value);
      where.push(sql.replace("?", `$${values.length}`));
    };
    if (context.projectId) add("project_id=?", context.projectId);
    if (query.projectId) add("project_id=?", query.projectId);
    if (query.status?.length) add("status=ANY(?::text[])", query.status);
    if (query.category?.length) add("category=ANY(?::text[])", query.category);
    if (query.priority?.length) add("priority=ANY(?::text[])", query.priority);
    if (query.labels?.length)
      add("labels @> ?::text[]", normalizeLabels(query.labels));
    if (query.claimedBy) add("claimed_by=?", query.claimedBy);
    if (query.release) add("release=?", query.release);
    if (query.environment) add("environment=?", query.environment);
    if (query.search)
      add(
        "to_tsvector('simple',coalesce(record->>'title','')||' '||coalesce(record->>'description','')) @@ plainto_tsquery('simple',?)",
        query.search,
      );
    const offset = query.cursor
      ? Number.parseInt(
          Buffer.from(query.cursor, "base64url").toString("utf8"),
          10,
        ) || 0
      : 0;
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const sort =
      query.sort === "updated_at"
        ? "updated_at"
        : query.sort === "priority"
          ? "priority"
          : "created_at";
    const order = query.order === "asc" ? "ASC" : "DESC";
    values.push(limit + 1, offset);
    const result = await this.#pool.query<{ record: Feedback }>(
      `SELECT record FROM feedback WHERE ${where.join(" AND ")} ORDER BY ${sort} ${order}, id ${order} LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > limit;
    return {
      items: result.rows.slice(0, limit).map((row) => row.record),
      nextCursor: hasMore
        ? Buffer.from(String(offset + limit)).toString("base64url")
        : null,
    };
  }

  async get(context: RepositoryContext, feedbackId: string): Promise<Feedback> {
    const result = await this.#pool.query<{ record: Feedback }>(
      `SELECT record FROM feedback WHERE id=$1 AND workspace_id=$2 AND ($3::text IS NULL OR project_id=$3) AND deleted_at IS NULL`,
      [feedbackId, context.workspaceId, context.projectId],
    );
    if (!result.rows[0])
      throw new RepositoryError("not_found", "Feedback was not found.");
    return result.rows[0].record;
  }

  async update(
    context: RepositoryContext,
    feedbackId: string,
    input: UpdateFeedbackRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse> {
    return this.mutate(
      context,
      feedbackId,
      input.version,
      "metadata_updated",
      async (feedback) => {
        if (input.priority) feedback.priority = input.priority;
        if (input.labels) feedback.labels = normalizeLabels(input.labels);
        if (input.title) feedback.title = input.title.trim();
        if (input.category) feedback.category = input.category;
        return { priority: feedback.priority, labels: feedback.labels };
      },
      { key: idempotencyKey, operation: "update", input },
    );
  }

  async addComment(
    context: RepositoryContext,
    feedbackId: string,
    input: AddCommentRequest,
    idempotencyKey: string,
  ): Promise<AddCommentResponse> {
    let comment!: FeedbackComment;
    const result = await this.mutate(
      context,
      feedbackId,
      input.version,
      "comment_added",
      async (_feedback, client) => {
        comment = {
          id: id("cmt"),
          feedbackId,
          body: input.body.trim(),
          createdAt: now(),
          actor: clone(context.actor),
        };
        await client.query(
          "INSERT INTO feedback_comments(id,workspace_id,feedback_id,actor,body,created_at) VALUES($1,$2,$3,$4,$5,$6)",
          [
            comment.id,
            context.workspaceId,
            feedbackId,
            comment.actor,
            comment.body,
            comment.createdAt,
          ],
        );
        return { commentId: comment.id };
      },
      { key: idempotencyKey, operation: "comment", input },
      (feedback) => ({ feedback, comment }),
    );
    return result;
  }

  async claim(
    context: RepositoryContext,
    feedbackId: string,
    input: ClaimFeedbackRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse> {
    return this.mutate(
      context,
      feedbackId,
      input.version,
      "claim_acquired",
      async (feedback) => {
        if (
          feedback.claim &&
          Date.parse(feedback.claim.leaseExpiresAt) > Date.now() &&
          feedback.claim.owner.id !== context.actor.id
        ) {
          throw new RepositoryError(
            "conflict",
            "Feedback is already claimed by another actor.",
          );
        }
        const lease = Math.min(86_400, Math.max(60, input.leaseSeconds ?? 900));
        const timestamp = now();
        feedback.claim = {
          owner: clone(context.actor),
          claimedAt: timestamp,
          leaseExpiresAt: new Date(Date.now() + lease * 1_000).toISOString(),
          renewedAt: null,
        };
        if (["new", "triaged", "reopened"].includes(feedback.status))
          feedback.status = "in_progress";
        return { leaseExpiresAt: feedback.claim.leaseExpiresAt };
      },
      { key: idempotencyKey, operation: "claim", input },
    );
  }

  async renewClaim(
    context: RepositoryContext,
    feedbackId: string,
    input: RenewFeedbackClaimRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse> {
    return this.mutate(
      context,
      feedbackId,
      input.version,
      "claim_renewed",
      async (feedback) => {
        if (!feedback.claim || feedback.claim.owner.id !== context.actor.id)
          throw new RepositoryError(
            "conflict",
            "Only the active claim owner can renew the claim.",
          );
        const lease = Math.min(86_400, Math.max(60, input.leaseSeconds ?? 900));
        feedback.claim.renewedAt = now();
        feedback.claim.leaseExpiresAt = new Date(
          Date.now() + lease * 1_000,
        ).toISOString();
        return { leaseExpiresAt: feedback.claim.leaseExpiresAt };
      },
      { key: idempotencyKey, operation: "claim_renew", input },
    );
  }

  async releaseClaim(
    context: RepositoryContext,
    feedbackId: string,
    input: MutationVersionRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse> {
    return this.mutate(
      context,
      feedbackId,
      input.version,
      "claim_released",
      async (feedback) => {
        if (
          feedback.claim &&
          feedback.claim.owner.id !== context.actor.id &&
          !context.scopes.includes("feedback:admin")
        )
          throw new RepositoryError(
            "forbidden",
            "Only the claim owner or an administrator can release the claim.",
          );
        feedback.claim = null;
        return {};
      },
      { key: idempotencyKey, operation: "claim_release", input },
    );
  }

  async resolve(
    context: RepositoryContext,
    feedbackId: string,
    input: ResolveFeedbackRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse> {
    return this.transition(
      context,
      feedbackId,
      input.version,
      "resolve",
      {
        resolutionReason: input.reason,
        resolutionSummary: input.summary,
        ...(input.duplicateOfId ? { duplicateOfId: input.duplicateOfId } : {}),
      },
      async (feedback, client) => {
        feedback.resolution = {
          reason: input.reason,
          summary: input.summary.trim(),
          resolvedAt: now(),
          resolvedBy: clone(context.actor),
          ...(input.duplicateOfId
            ? { duplicateOfId: input.duplicateOfId }
            : {}),
        };
        for (const link of input.links ?? []) {
          const value = {
            id: id("lnk"),
            type: link.type,
            url: link.url,
            label: link.label?.trim() || link.url,
            createdAt: now(),
            createdBy: clone(context.actor),
          };
          feedback.externalLinks.push(value);
          await client.query(
            "INSERT INTO feedback_external_links(id,workspace_id,feedback_id,link_type,url,label,actor,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              value.id,
              context.workspaceId,
              feedbackId,
              value.type,
              value.url,
              value.label,
              value.createdBy,
              value.createdAt,
            ],
          );
        }
        feedback.claim = null;
        return { reason: input.reason, summary: input.summary };
      },
      { key: idempotencyKey, operation: "resolve", input },
    );
  }

  async closeFeedback(
    context: RepositoryContext,
    feedbackId: string,
    input: CloseFeedbackRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse> {
    return this.transition(
      context,
      feedbackId,
      input.version,
      "close",
      { note: input.note },
      async (feedback) => {
        feedback.closedAt = now();
        return { note: input.note };
      },
      { key: idempotencyKey, operation: "close", input },
    );
  }

  async reopen(
    context: RepositoryContext,
    feedbackId: string,
    input: ReopenFeedbackRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse> {
    return this.transition(
      context,
      feedbackId,
      input.version,
      "reopen",
      { note: input.note },
      async (feedback) => {
        const previousResolution = feedback.resolution;
        feedback.closedAt = null;
        feedback.resolution = null;
        return { note: input.note, previousResolution };
      },
      { key: idempotencyKey, operation: "reopen", input },
    );
  }

  async reject(
    context: RepositoryContext,
    feedbackId: string,
    input: RejectFeedbackRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse> {
    return this.transition(
      context,
      feedbackId,
      input.version,
      "reject",
      { note: input.note },
      async (feedback) => {
        feedback.resolution = {
          reason: input.reason,
          summary: input.note.trim(),
          resolvedAt: now(),
          resolvedBy: clone(context.actor),
          ...(input.duplicateOfId
            ? { duplicateOfId: input.duplicateOfId }
            : {}),
        };
        feedback.claim = null;
        return { note: input.note, reason: input.reason };
      },
      { key: idempotencyKey, operation: "reject", input },
    );
  }

  async addEvidence(
    context: RepositoryContext,
    feedbackId: string,
    input: AddEvidenceRequest,
    idempotencyKey: string,
  ): Promise<AddEvidenceResponse> {
    const evidence = {
      id: id("evd"),
      feedbackId,
      note: input.note.trim(),
      attachments: [],
      createdAt: now(),
      actor: clone(context.actor),
    };
    const result = await this.mutate(
      context,
      feedbackId,
      input.version,
      "evidence_added",
      async (_feedback, client) => {
        await client.query(
          "INSERT INTO feedback_evidence(id,workspace_id,feedback_id,actor,note,created_at) VALUES($1,$2,$3,$4,$5,$6)",
          [
            evidence.id,
            context.workspaceId,
            feedbackId,
            evidence.actor,
            evidence.note,
            evidence.createdAt,
          ],
        );
        return { evidenceId: evidence.id, note: evidence.note };
      },
      { key: idempotencyKey, operation: "evidence", input },
      (feedback) => ({ feedback, evidence }),
    );
    return result;
  }

  async events(
    context: RepositoryContext,
    feedbackId: string,
    cursor?: string,
    limit = 25,
  ): Promise<CursorPage<FeedbackEvent>> {
    await this.get(context, feedbackId);
    const offset = cursor
      ? Number.parseInt(
          Buffer.from(cursor, "base64url").toString("utf8"),
          10,
        ) || 0
      : 0;
    const bounded = Math.min(100, Math.max(1, limit));
    const result = await this.#pool.query<{
      id: string;
      feedback_id: string;
      event_type: FeedbackEventType;
      actor: FeedbackEvent["actor"];
      occurred_at: Date;
      previous_version: number | null;
      version: number;
      data: Record<string, unknown>;
    }>(
      "SELECT id,feedback_id,event_type,actor,occurred_at,previous_version,version,data FROM feedback_events WHERE workspace_id=$1 AND feedback_id=$2 ORDER BY occurred_at,id LIMIT $3 OFFSET $4",
      [context.workspaceId, feedbackId, bounded + 1, offset],
    );
    const rows = result.rows.slice(0, bounded);
    return {
      items: rows.map((row) => ({
        id: row.id,
        feedbackId: row.feedback_id,
        type: row.event_type,
        actor: row.actor,
        occurredAt: row.occurred_at.toISOString(),
        previousVersion: row.previous_version,
        version: row.version,
        data: row.data,
      })),
      nextCursor:
        result.rows.length > bounded
          ? Buffer.from(String(offset + bounded)).toString("base64url")
          : null,
    };
  }

  async addAttachment(
    context: RepositoryContext,
    feedbackId: string,
    input: StoreAttachmentInput,
  ): Promise<{ feedback: Feedback; attachment: FeedbackAttachment }> {
    const requestHash = hash(
      JSON.stringify({
        kind: input.kind,
        fileName: input.fileName,
        mediaType: input.mediaType,
        size: input.size,
        objectKey: input.objectKey,
      }),
    );
    const idempotencyKeyHash = hash(input.idempotencyKey);
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<{ record: Feedback }>(
        "SELECT record FROM feedback WHERE id=$1 AND workspace_id=$2 AND ($3::text IS NULL OR project_id=$3) AND deleted_at IS NULL FOR UPDATE",
        [feedbackId, context.workspaceId, context.projectId],
      );
      const feedback = selected.rows[0]?.record;
      if (!feedback)
        throw new RepositoryError("not_found", "Feedback was not found.");
      const replay = await client.query<{
        request_hash: string;
        id: string;
        kind: FeedbackAttachment["kind"];
        file_name: string;
        media_type: string;
        size_bytes: string;
        created_at: Date;
      }>(
        `SELECT i.request_hash,a.id,a.kind,a.file_name,a.media_type,a.size_bytes,a.created_at
         FROM feedback_attachment_idempotency i
         JOIN feedback_attachments a ON a.id=i.attachment_id
         WHERE i.workspace_id=$1 AND i.feedback_id=$2 AND i.idempotency_key_hash=$3`,
        [context.workspaceId, feedbackId, idempotencyKeyHash],
      );
      const previous = replay.rows[0];
      if (previous) {
        if (previous.request_hash !== requestHash) {
          throw new RepositoryError(
            "conflict",
            "The attachment idempotency key was already used with different input.",
          );
        }
        await client.query("COMMIT");
        return {
          feedback,
          attachment: {
            id: previous.id,
            kind: previous.kind,
            fileName: previous.file_name,
            mediaType: previous.media_type,
            size: Number(previous.size_bytes),
            createdAt: previous.created_at.toISOString(),
          },
        };
      }
      if (feedback.version !== input.version) {
        throw new RepositoryError(
          "conflict",
          `Expected version ${feedback.version}.`,
        );
      }
      const attachment: FeedbackAttachment = {
        id: id("att"),
        kind: input.kind,
        fileName: input.fileName,
        mediaType: input.mediaType,
        size: input.size,
        createdAt: now(),
      };
      feedback.attachments.push(attachment);
      const previousVersion = feedback.version;
      feedback.version += 1;
      feedback.updatedAt = now();
      await client.query(
        `INSERT INTO feedback_attachments(id,workspace_id,feedback_id,kind,file_name,media_type,size_bytes,object_key,scan_status,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'clean',$9)`,
        [
          attachment.id,
          context.workspaceId,
          feedbackId,
          attachment.kind,
          attachment.fileName,
          attachment.mediaType,
          attachment.size,
          input.objectKey,
          attachment.createdAt,
        ],
      );
      await client.query(
        `INSERT INTO feedback_attachment_idempotency(workspace_id,feedback_id,idempotency_key_hash,request_hash,attachment_id,expires_at)
         VALUES($1,$2,$3,$4,$5,now()+interval '24 hours')`,
        [
          context.workspaceId,
          feedbackId,
          idempotencyKeyHash,
          requestHash,
          attachment.id,
        ],
      );
      await client.query(
        "UPDATE feedback SET version=$1,record=$2,updated_at=$3 WHERE id=$4",
        [feedback.version, feedback, feedback.updatedAt, feedback.id],
      );
      await this.insertEvent(
        client,
        feedback,
        "attachment_added",
        context,
        previousVersion,
        { attachmentId: attachment.id, kind: attachment.kind },
      );
      await client.query("COMMIT");
      return { feedback, attachment };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getAttachment(
    context: RepositoryContext,
    feedbackId: string,
    attachmentId: string,
  ): Promise<StoredAttachment> {
    await this.get(context, feedbackId);
    const result = await this.#pool.query<{
      id: string;
      kind: FeedbackAttachment["kind"];
      file_name: string;
      media_type: string;
      size_bytes: string;
      object_key: string;
      created_at: Date;
    }>(
      `SELECT id,kind,file_name,media_type,size_bytes,object_key,created_at
       FROM feedback_attachments WHERE workspace_id=$1 AND feedback_id=$2 AND id=$3 AND scan_status='clean'`,
      [context.workspaceId, feedbackId, attachmentId],
    );
    const row = result.rows[0];
    if (!row)
      throw new RepositoryError("not_found", "Attachment was not found.");
    return {
      id: row.id,
      kind: row.kind,
      fileName: row.file_name,
      mediaType: row.media_type,
      size: Number(row.size_bytes),
      objectKey: row.object_key,
      createdAt: row.created_at.toISOString(),
    };
  }

  private async transition(
    context: RepositoryContext,
    feedbackId: string,
    version: number,
    action: "resolve" | "close" | "reopen" | "reject",
    fields: Record<string, unknown>,
    change: (
      feedback: Feedback,
      client: PoolClient,
    ) => Promise<Record<string, unknown>>,
    idempotency: { key: string; operation: string; input: unknown },
  ): Promise<FeedbackMutationResponse> {
    return this.mutate(
      context,
      feedbackId,
      version,
      action === "resolve"
        ? "resolved"
        : action === "close"
          ? "closed"
          : action === "reopen"
            ? "reopened"
            : "rejected",
      async (feedback, client) => {
        const evaluated = evaluateFeedbackTransition({
          from: feedback.status,
          action,
          scopes: context.scopes as FeedbackScope[],
          ...(typeof fields.note === "string" ? { note: fields.note } : {}),
          ...(typeof fields.resolutionReason === "string"
            ? {
                resolutionReason:
                  fields.resolutionReason as ResolveFeedbackRequest["reason"],
              }
            : {}),
          ...(typeof fields.resolutionSummary === "string"
            ? { resolutionSummary: fields.resolutionSummary }
            : {}),
          ...(typeof fields.duplicateOfId === "string"
            ? { duplicateOfId: fields.duplicateOfId }
            : {}),
        });
        if (!evaluated.allowed)
          throw new RepositoryError(
            evaluated.code === "missing_scope"
              ? "forbidden"
              : "validation_failed",
            evaluated.message,
          );
        feedback.status = evaluated.to;
        return change(feedback, client);
      },
      idempotency,
    );
  }

  private async mutate<
    TResult extends FeedbackMutationResponse = FeedbackMutationResponse,
  >(
    context: RepositoryContext,
    feedbackId: string,
    version: number,
    eventType: FeedbackEventType,
    change: (
      feedback: Feedback,
      client: PoolClient,
    ) => Promise<Record<string, unknown>>,
    idempotency?: { key: string; operation: string; input: unknown },
    resultFactory: (feedback: Feedback) => TResult = (feedback) =>
      ({ feedback }) as TResult,
  ): Promise<TResult> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<{ record: Feedback }>(
        "SELECT record FROM feedback WHERE id=$1 AND workspace_id=$2 AND ($3::text IS NULL OR project_id=$3) AND deleted_at IS NULL FOR UPDATE",
        [feedbackId, context.workspaceId, context.projectId],
      );
      const feedback = selected.rows[0]?.record;
      if (!feedback)
        throw new RepositoryError("not_found", "Feedback was not found.");
      const keyHash = idempotency ? hash(idempotency.key) : null;
      const requestHash = idempotency
        ? hash(JSON.stringify(idempotency.input))
        : null;
      if (idempotency && keyHash && requestHash) {
        await client.query(
          `DELETE FROM feedback_mutation_idempotency
           WHERE workspace_id=$1 AND actor_id=$2 AND feedback_id=$3
             AND operation=$4 AND idempotency_key_hash=$5 AND expires_at <= now()`,
          [
            context.workspaceId,
            context.actor.id,
            feedbackId,
            idempotency.operation,
            keyHash,
          ],
        );
        const replay = await client.query<{
          request_hash: string;
          response: TResult;
        }>(
          `SELECT request_hash,response FROM feedback_mutation_idempotency
           WHERE workspace_id=$1 AND actor_id=$2 AND feedback_id=$3
             AND operation=$4 AND idempotency_key_hash=$5`,
          [
            context.workspaceId,
            context.actor.id,
            feedbackId,
            idempotency.operation,
            keyHash,
          ],
        );
        const previous = replay.rows[0];
        if (previous) {
          if (previous.request_hash !== requestHash) {
            throw new RepositoryError(
              "conflict",
              "The idempotency key was already used with different input.",
            );
          }
          await client.query("COMMIT");
          return clone(previous.response);
        }
      }
      if (feedback.version !== version)
        throw new RepositoryError(
          "conflict",
          `Expected version ${feedback.version}.`,
        );
      const previousVersion = feedback.version;
      const data = await change(feedback, client);
      feedback.version += 1;
      feedback.updatedAt = now();
      await client.query(
        `UPDATE feedback SET status=$1,category=$2,priority=$3,release=$4,environment=$5,labels=$6,claimed_by=$7,claim_expires_at=$8,version=$9,record=$10,updated_at=$11,deleted_at=$12 WHERE id=$13`,
        [
          feedback.status,
          feedback.category,
          feedback.priority,
          feedback.release,
          feedback.environment,
          feedback.labels,
          feedback.claim?.owner.id ?? null,
          feedback.claim?.leaseExpiresAt ?? null,
          feedback.version,
          feedback,
          feedback.updatedAt,
          feedback.deletedAt,
          feedback.id,
        ],
      );
      await this.insertEvent(
        client,
        feedback,
        eventType,
        context,
        previousVersion,
        data,
      );
      const result = resultFactory(feedback);
      if (idempotency && keyHash && requestHash) {
        await client.query(
          `INSERT INTO feedback_mutation_idempotency(
             workspace_id,actor_id,feedback_id,operation,idempotency_key_hash,request_hash,response,expires_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '24 hours')`,
          [
            context.workspaceId,
            context.actor.id,
            feedbackId,
            idempotency.operation,
            keyHash,
            requestHash,
            result,
          ],
        );
      }
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertEvent(
    client: PoolClient,
    feedback: Feedback,
    eventType: FeedbackEventType,
    context: RepositoryContext,
    previousVersion: number | null,
    data: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      "INSERT INTO feedback_events(id,workspace_id,feedback_id,event_type,actor,previous_version,version,data,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id("evt"),
        context.workspaceId,
        feedback.id,
        eventType,
        context.actor,
        previousVersion,
        feedback.version,
        data,
        now(),
      ],
    );
  }
}
