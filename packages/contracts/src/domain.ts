export type FeedbackId = string;
export type WorkspaceId = string;
export type ProjectId = string;
export type ActorId = string;

export type FeedbackCategory = "bug" | "feedback" | "idea";
export type FeedbackStatus =
  | "new"
  | "triaged"
  | "in_progress"
  | "resolved"
  | "closed"
  | "rejected"
  | "reopened";
export type FeedbackPriority = "unset" | "low" | "medium" | "high" | "urgent";
export type FeedbackResolutionReason =
  | "fixed"
  | "already_done"
  | "wont_do"
  | "duplicate"
  | "not_relevant";
export type FeedbackActorType =
  | "reporter"
  | "user"
  | "service_account"
  | "agent"
  | "system";

export type FeedbackActor = {
  id: ActorId;
  type: FeedbackActorType;
  displayName: string;
};

export type Workspace = {
  id: WorkspaceId;
  slug: string;
  name: string;
  createdAt: string;
};

export type Project = {
  id: ProjectId;
  workspaceId: WorkspaceId;
  slug: string;
  name: string;
  allowedOrigins: string[];
  createdAt: string;
};

export type FeedbackResolution = {
  reason: FeedbackResolutionReason;
  summary: string;
  resolvedAt: string;
  resolvedBy: FeedbackActor;
  duplicateOfId?: FeedbackId;
};

export type FeedbackClaim = {
  owner: FeedbackActor;
  claimedAt: string;
  leaseExpiresAt: string;
  renewedAt: string | null;
};

export type FeedbackExternalLinkType =
  | "commit"
  | "pull_request"
  | "issue"
  | "deployment"
  | "other";

export type FeedbackExternalLink = {
  id: string;
  type: FeedbackExternalLinkType;
  url: string;
  label: string;
  createdAt: string;
  createdBy: FeedbackActor;
};

export type FeedbackAttachment = {
  id: string;
  kind: "screenshot" | "image" | "text" | "video" | "other";
  fileName: string;
  mediaType: string;
  size: number;
  createdAt: string;
  downloadUrl?: string;
};

export type FeedbackComment = {
  id: string;
  feedbackId: FeedbackId;
  body: string;
  createdAt: string;
  actor: FeedbackActor;
};

export type FeedbackEvidence = {
  id: string;
  feedbackId: FeedbackId;
  note: string;
  attachments: FeedbackAttachment[];
  createdAt: string;
  actor: FeedbackActor;
};

export type Feedback = {
  id: FeedbackId;
  workspaceId: WorkspaceId;
  projectId: ProjectId;
  environment: string | null;
  category: FeedbackCategory;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  title: string;
  description: string;
  sourceApp: string | null;
  release: string | null;
  url: string | null;
  labels: string[];
  context: unknown | null;
  diagnostics: unknown | null;
  attachments: FeedbackAttachment[];
  claim: FeedbackClaim | null;
  resolution: FeedbackResolution | null;
  externalLinks: FeedbackExternalLink[];
  version: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  deletedAt: string | null;
  retainUntil: string | null;
};

export type FeedbackEventType =
  | "created"
  | "metadata_updated"
  | "comment_added"
  | "claim_acquired"
  | "claim_renewed"
  | "claim_released"
  | "claim_expired"
  | "status_changed"
  | "resolved"
  | "closed"
  | "reopened"
  | "rejected"
  | "evidence_added"
  | "attachment_added"
  | "external_link_added"
  | "deleted";

export type FeedbackEvent = {
  id: string;
  feedbackId: FeedbackId;
  type: FeedbackEventType;
  actor: FeedbackActor;
  occurredAt: string;
  previousVersion: number | null;
  version: number;
  data: Record<string, unknown>;
};

export type FeedbackScope =
  | "feedback:submit"
  | "feedback:read"
  | "feedback:triage"
  | "feedback:comment"
  | "feedback:resolve"
  | "feedback:close"
  | "feedback:admin";
