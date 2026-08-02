import { createHash, randomBytes, randomUUID } from "node:crypto";
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
const clone = <T>(value: T): T => structuredClone(value);
const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

type IdempotencyRecord = {
  requestHash: string;
  response: CreateFeedbackResponse;
};

export class MemoryFeedbackRepository implements FeedbackRepository {
  readonly #feedback = new Map<string, Feedback>();
  readonly #events = new Map<string, FeedbackEvent[]>();
  readonly #comments = new Map<string, FeedbackComment[]>();
  readonly #idempotency = new Map<string, IdempotencyRecord>();
  readonly #reporterTokenHashes = new Map<string, string>();
  readonly #storedAttachments = new Map<string, StoredAttachment>();
  readonly #attachmentIdempotency = new Map<
    string,
    { requestHash: string; attachmentId: string }
  >();
  readonly #mutationIdempotency = new Map<
    string,
    {
      requestHash: string;
      response:
        | FeedbackMutationResponse
        | AddCommentResponse
        | AddEvidenceResponse;
      expiresAt: number;
    }
  >();

  async ready(): Promise<boolean> {
    return true;
  }
  async close(): Promise<void> {}

  async authenticateReporter(
    feedbackId: string,
    token: string,
  ): Promise<RepositoryContext | null> {
    const feedback = this.#feedback.get(feedbackId);
    const expected = this.#reporterTokenHashes.get(feedbackId);
    if (!feedback || !expected || !safeEqual(hash(token), expected))
      return null;
    return {
      workspaceId: feedback.workspaceId,
      projectId: feedback.projectId,
      actor: {
        id: `reporter:${feedback.id}`,
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
    const dedupeKey = `${context.workspaceId}:${input.projectId}:${idempotencyKey}`;
    const requestHash = hash(JSON.stringify(input));
    const existing = this.#idempotency.get(dedupeKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new RepositoryError(
          "conflict",
          "The idempotency key was already used with different input.",
        );
      }
      return clone(existing.response);
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
    this.#feedback.set(feedback.id, feedback);
    this.appendEvent(feedback, "created", context, null, {
      category: feedback.category,
    });
    const reporterToken = input.reporterTokenRequested
      ? randomBytes(32).toString("base64url")
      : undefined;
    if (reporterToken)
      this.#reporterTokenHashes.set(feedback.id, hash(reporterToken));
    const response: CreateFeedbackResponse = {
      feedback: clone(feedback),
      ...(reporterToken ? { reporterToken } : {}),
    };
    this.#idempotency.set(dedupeKey, {
      requestHash,
      response: { feedback: clone(feedback) },
    });
    return response;
  }

  async list(
    context: RepositoryContext,
    query: ListFeedbackQuery,
  ): Promise<CursorPage<Feedback>> {
    const offset = query.cursor
      ? Number.parseInt(
          Buffer.from(query.cursor, "base64url").toString("utf8"),
          10,
        ) || 0
      : 0;
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    let values = [...this.#feedback.values()].filter(
      (item) =>
        item.workspaceId === context.workspaceId &&
        (!context.projectId || item.projectId === context.projectId) &&
        !item.deletedAt,
    );
    if (query.projectId)
      values = values.filter((item) => item.projectId === query.projectId);
    if (query.status?.length)
      values = values.filter((item) => query.status!.includes(item.status));
    if (query.category?.length)
      values = values.filter((item) => query.category!.includes(item.category));
    if (query.priority?.length)
      values = values.filter((item) => query.priority!.includes(item.priority));
    if (query.labels?.length)
      values = values.filter((item) =>
        query.labels!.every((label) =>
          item.labels.includes(label.toLowerCase()),
        ),
      );
    if (query.claimedBy)
      values = values.filter(
        (item) => item.claim?.owner.id === query.claimedBy,
      );
    if (query.release)
      values = values.filter((item) => item.release === query.release);
    if (query.environment)
      values = values.filter((item) => item.environment === query.environment);
    if (query.search) {
      const search = query.search.toLowerCase();
      values = values.filter((item) =>
        `${item.title}\n${item.description}`.toLowerCase().includes(search),
      );
    }
    const direction = query.order === "asc" ? 1 : -1;
    values.sort((left, right) => {
      const field = query.sort === "updated_at" ? "updatedAt" : "createdAt";
      return left[field].localeCompare(right[field]) * direction;
    });
    const items = values.slice(offset, offset + limit).map(clone);
    const nextOffset = offset + items.length;
    return {
      items,
      nextCursor:
        nextOffset < values.length
          ? Buffer.from(String(nextOffset)).toString("base64url")
          : null,
    };
  }

  async get(context: RepositoryContext, feedbackId: string): Promise<Feedback> {
    return clone(this.requireFeedback(context, feedbackId));
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
      (feedback) => {
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
      () => {
        comment = {
          id: id("cmt"),
          feedbackId,
          body: input.body.trim(),
          createdAt: now(),
          actor: clone(context.actor),
        };
        const comments = this.#comments.get(feedbackId) ?? [];
        comments.push(comment);
        this.#comments.set(feedbackId, comments);
        return { commentId: comment.id };
      },
      { key: idempotencyKey, operation: "comment", input },
      (feedback) => ({ feedback, comment: clone(comment) }),
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
      (feedback) => {
        const timestamp = now();
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
        const leaseSeconds = Math.min(
          86_400,
          Math.max(60, input.leaseSeconds ?? 900),
        );
        feedback.claim = {
          owner: clone(context.actor),
          claimedAt: timestamp,
          leaseExpiresAt: new Date(
            Date.now() + leaseSeconds * 1_000,
          ).toISOString(),
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
      (feedback) => {
        if (!feedback.claim || feedback.claim.owner.id !== context.actor.id) {
          throw new RepositoryError(
            "conflict",
            "Only the active claim owner can renew the claim.",
          );
        }
        const leaseSeconds = Math.min(
          86_400,
          Math.max(60, input.leaseSeconds ?? 900),
        );
        feedback.claim.renewedAt = now();
        feedback.claim.leaseExpiresAt = new Date(
          Date.now() + leaseSeconds * 1_000,
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
      (feedback) => {
        if (
          feedback.claim &&
          feedback.claim.owner.id !== context.actor.id &&
          !context.scopes.includes("feedback:admin")
        ) {
          throw new RepositoryError(
            "forbidden",
            "Only the claim owner or an administrator can release the claim.",
          );
        }
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
      (feedback) => {
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
          feedback.externalLinks.push({
            id: id("lnk"),
            type: link.type,
            url: link.url,
            label: link.label?.trim() || link.url,
            createdAt: now(),
            createdBy: clone(context.actor),
          });
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
      (feedback) => {
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
      (feedback) => {
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
      (feedback) => {
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
    return this.mutate(
      context,
      feedbackId,
      input.version,
      "evidence_added",
      () => ({ evidenceId: evidence.id, note: evidence.note }),
      { key: idempotencyKey, operation: "evidence", input },
      (feedback) => ({ feedback, evidence: clone(evidence) }),
    );
  }

  async events(
    context: RepositoryContext,
    feedbackId: string,
    cursor?: string,
    limit = 25,
  ): Promise<CursorPage<FeedbackEvent>> {
    this.requireFeedback(context, feedbackId);
    const values = this.#events.get(feedbackId) ?? [];
    const offset = cursor
      ? Number.parseInt(
          Buffer.from(cursor, "base64url").toString("utf8"),
          10,
        ) || 0
      : 0;
    const bounded = Math.min(100, Math.max(1, limit));
    const items = values.slice(offset, offset + bounded).map(clone);
    const next = offset + items.length;
    return {
      items,
      nextCursor:
        next < values.length
          ? Buffer.from(String(next)).toString("base64url")
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
    const idempotencyKey = `${context.workspaceId}:${feedbackId}:${input.idempotencyKey}`;
    const replay = this.#attachmentIdempotency.get(idempotencyKey);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new RepositoryError(
          "conflict",
          "The attachment idempotency key was already used with different input.",
        );
      }
      const stored = this.#storedAttachments.get(
        `${context.workspaceId}:${feedbackId}:${replay.attachmentId}`,
      );
      if (!stored)
        throw new RepositoryError("not_found", "Attachment was not found.");
      const attachment: FeedbackAttachment = {
        id: stored.id,
        kind: stored.kind,
        fileName: stored.fileName,
        mediaType: stored.mediaType,
        size: stored.size,
        createdAt: stored.createdAt,
      };
      return {
        feedback: clone(this.requireFeedback(context, feedbackId)),
        attachment,
      };
    }
    const attachment: FeedbackAttachment = {
      id: id("att"),
      kind: input.kind,
      fileName: input.fileName,
      mediaType: input.mediaType,
      size: input.size,
      createdAt: now(),
    };
    const result = await this.mutate(
      context,
      feedbackId,
      input.version,
      "attachment_added",
      (feedback) => {
        feedback.attachments.push(attachment);
        this.#storedAttachments.set(
          `${context.workspaceId}:${feedbackId}:${attachment.id}`,
          {
            ...attachment,
            objectKey: input.objectKey,
          },
        );
        this.#attachmentIdempotency.set(idempotencyKey, {
          requestHash,
          attachmentId: attachment.id,
        });
        return { attachmentId: attachment.id, kind: attachment.kind };
      },
    );
    return { feedback: result.feedback, attachment: clone(attachment) };
  }

  async getAttachment(
    context: RepositoryContext,
    feedbackId: string,
    attachmentId: string,
  ): Promise<StoredAttachment> {
    this.requireFeedback(context, feedbackId);
    const attachment = this.#storedAttachments.get(
      `${context.workspaceId}:${feedbackId}:${attachmentId}`,
    );
    if (!attachment)
      throw new RepositoryError("not_found", "Attachment was not found.");
    return clone(attachment);
  }

  private requireFeedback(
    context: RepositoryContext,
    feedbackId: string,
  ): Feedback {
    const feedback = this.#feedback.get(feedbackId);
    if (
      !feedback ||
      feedback.workspaceId !== context.workspaceId ||
      (context.projectId && feedback.projectId !== context.projectId) ||
      feedback.deletedAt
    ) {
      throw new RepositoryError("not_found", "Feedback was not found.");
    }
    return feedback;
  }

  private async transition(
    context: RepositoryContext,
    feedbackId: string,
    version: number,
    action: "resolve" | "close" | "reopen" | "reject",
    fields: Record<string, unknown>,
    change: (feedback: Feedback) => Record<string, unknown>,
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
      (current) => {
        const evaluated = evaluateFeedbackTransition({
          from: current.status,
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
        if (!evaluated.allowed) {
          throw new RepositoryError(
            evaluated.code === "missing_scope"
              ? "forbidden"
              : "validation_failed",
            evaluated.message,
          );
        }
        current.status = evaluated.to;
        return change(current);
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
    change: (feedback: Feedback) => Record<string, unknown>,
    idempotency?: { key: string; operation: string; input: unknown },
    resultFactory: (feedback: Feedback) => TResult = (feedback) =>
      ({ feedback }) as TResult,
  ): Promise<TResult> {
    const feedback = this.requireFeedback(context, feedbackId);
    const idempotencyMapKey = idempotency
      ? `${context.workspaceId}:${context.actor.id}:${feedbackId}:${idempotency.operation}:${hash(idempotency.key)}`
      : null;
    const requestHash = idempotency
      ? hash(JSON.stringify(idempotency.input))
      : null;
    let replay = idempotencyMapKey
      ? this.#mutationIdempotency.get(idempotencyMapKey)
      : undefined;
    if (replay && replay.expiresAt <= Date.now()) {
      this.#mutationIdempotency.delete(idempotencyMapKey!);
      replay = undefined;
    }
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new RepositoryError(
          "conflict",
          "The idempotency key was already used with different input.",
        );
      }
      return clone(replay.response) as TResult;
    }
    if (feedback.version !== version)
      throw new RepositoryError(
        "conflict",
        `Expected version ${feedback.version}.`,
      );
    const previousVersion = feedback.version;
    const data = change(feedback);
    feedback.version += 1;
    feedback.updatedAt = now();
    this.appendEvent(feedback, eventType, context, previousVersion, data);
    const result = resultFactory(clone(feedback));
    if (idempotencyMapKey && requestHash) {
      this.#mutationIdempotency.set(idempotencyMapKey, {
        requestHash,
        response: clone(result),
        expiresAt: Date.now() + 86_400_000,
      });
    }
    return result;
  }

  private appendEvent(
    feedback: Feedback,
    type: FeedbackEventType,
    context: RepositoryContext,
    previousVersion: number | null,
    data: Record<string, unknown>,
  ): void {
    const events = this.#events.get(feedback.id) ?? [];
    events.push({
      id: id("evt"),
      feedbackId: feedback.id,
      type,
      actor: clone(context.actor),
      occurredAt: now(),
      previousVersion,
      version: feedback.version,
      data: clone(data),
    });
    this.#events.set(feedback.id, events);
  }
}
