import type {
  Feedback,
  FeedbackActor,
  FeedbackCategory,
  FeedbackComment,
  FeedbackEvent,
  FeedbackEvidence,
  FeedbackExternalLinkType,
  FeedbackId,
  FeedbackPriority,
  FeedbackResolutionReason,
  FeedbackStatus,
  ProjectId,
  WorkspaceId,
} from "./domain.js";

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_failed"
  | "rate_limited"
  | "payload_too_large"
  | "internal_error";

export type ApiErrorEnvelope = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: Array<{ path: string; message: string }>;
  };
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type CreateFeedbackRequest = {
  schemaVersion: "1.0";
  projectId: ProjectId;
  category: FeedbackCategory;
  title: string;
  description: string;
  sourceApp?: string;
  release?: string;
  environment?: string;
  url?: string;
  context?: unknown;
  diagnostics?: unknown;
  reporterTokenRequested?: boolean;
};

export type CreateFeedbackResponse = {
  feedback: Feedback;
  reporterToken?: string;
};

export type ListFeedbackQuery = {
  workspaceId?: WorkspaceId;
  projectId?: ProjectId;
  status?: FeedbackStatus[];
  category?: FeedbackCategory[];
  priority?: FeedbackPriority[];
  labels?: string[];
  claimedBy?: string;
  release?: string;
  environment?: string;
  search?: string;
  cursor?: string;
  limit?: number;
  sort?: "created_at" | "updated_at" | "priority";
  order?: "asc" | "desc";
};

export type UpdateFeedbackRequest = {
  version: number;
  priority?: FeedbackPriority;
  labels?: string[];
  title?: string;
  category?: FeedbackCategory;
};

export type AddCommentRequest = { body: string; version: number };
export type AddCommentResponse = {
  feedback: Feedback;
  comment: FeedbackComment;
};

export type ClaimFeedbackRequest = { leaseSeconds?: number; version: number };
export type RenewFeedbackClaimRequest = {
  leaseSeconds?: number;
  version: number;
};
export type MutationVersionRequest = { version: number };

export type ResolveFeedbackRequest = {
  version: number;
  reason: FeedbackResolutionReason;
  summary: string;
  duplicateOfId?: FeedbackId;
  links?: Array<{
    type: FeedbackExternalLinkType;
    url: string;
    label?: string;
  }>;
};

export type CloseFeedbackRequest = { version: number; note: string };
export type ReopenFeedbackRequest = { version: number; note: string };
export type RejectFeedbackRequest = {
  version: number;
  note: string;
  reason: Exclude<FeedbackResolutionReason, "fixed">;
  duplicateOfId?: FeedbackId;
};
export type AddEvidenceRequest = { version: number; note: string };
export type AddEvidenceResponse = {
  feedback: Feedback;
  evidence: FeedbackEvidence;
};

export type FeedbackMutationResponse = { feedback: Feedback };
export type FeedbackEventsResponse = CursorPage<FeedbackEvent>;

export type RequestActor = FeedbackActor & { scopes: string[] };

export type ServiceVersionResponse = {
  service: "ventus-feedback-api";
  applicationVersion: string;
  apiVersion: "v1";
  schemaVersion: "1.0";
};
