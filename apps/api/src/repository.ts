import type {
  AddCommentRequest,
  AddCommentResponse,
  AddEvidenceRequest,
  AddEvidenceResponse,
  ClaimFeedbackRequest,
  CloseFeedbackRequest,
  CreateFeedbackRequest,
  CreateFeedbackResponse,
  CursorPage,
  Feedback,
  FeedbackActor,
  FeedbackEvent,
  FeedbackAttachment,
  FeedbackMutationResponse,
  ListFeedbackQuery,
  MutationVersionRequest,
  RejectFeedbackRequest,
  RenewFeedbackClaimRequest,
  ReopenFeedbackRequest,
  ResolveFeedbackRequest,
  UpdateFeedbackRequest,
} from "@ventus-software-solutions/feedback-contracts";

export type RepositoryContext = {
  workspaceId: string;
  projectId: string | null;
  actor: FeedbackActor;
  scopes: string[];
};

export type StoreAttachmentInput = {
  version: number;
  idempotencyKey: string;
  kind: FeedbackAttachment["kind"];
  fileName: string;
  mediaType: string;
  size: number;
  objectKey: string;
};

export type StoredAttachment = FeedbackAttachment & { objectKey: string };

export class RepositoryError extends Error {
  constructor(
    readonly code: "not_found" | "conflict" | "forbidden" | "validation_failed",
    message: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export interface FeedbackRepository {
  ready(): Promise<boolean>;
  close(): Promise<void>;
  authenticateReporter(
    id: string,
    token: string,
  ): Promise<RepositoryContext | null>;
  create(
    context: RepositoryContext,
    input: CreateFeedbackRequest,
    idempotencyKey: string,
  ): Promise<CreateFeedbackResponse>;
  list(
    context: RepositoryContext,
    query: ListFeedbackQuery,
  ): Promise<CursorPage<Feedback>>;
  get(context: RepositoryContext, id: string): Promise<Feedback>;
  update(
    context: RepositoryContext,
    id: string,
    input: UpdateFeedbackRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse>;
  addComment(
    context: RepositoryContext,
    id: string,
    input: AddCommentRequest,
    idempotencyKey: string,
  ): Promise<AddCommentResponse>;
  claim(
    context: RepositoryContext,
    id: string,
    input: ClaimFeedbackRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse>;
  renewClaim(
    context: RepositoryContext,
    id: string,
    input: RenewFeedbackClaimRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse>;
  releaseClaim(
    context: RepositoryContext,
    id: string,
    input: MutationVersionRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse>;
  resolve(
    context: RepositoryContext,
    id: string,
    input: ResolveFeedbackRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse>;
  closeFeedback(
    context: RepositoryContext,
    id: string,
    input: CloseFeedbackRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse>;
  reopen(
    context: RepositoryContext,
    id: string,
    input: ReopenFeedbackRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse>;
  reject(
    context: RepositoryContext,
    id: string,
    input: RejectFeedbackRequest,
    idempotencyKey: string,
  ): Promise<FeedbackMutationResponse>;
  addEvidence(
    context: RepositoryContext,
    id: string,
    input: AddEvidenceRequest,
    idempotencyKey: string,
  ): Promise<AddEvidenceResponse>;
  events(
    context: RepositoryContext,
    id: string,
    cursor?: string,
    limit?: number,
  ): Promise<CursorPage<FeedbackEvent>>;
  addAttachment(
    context: RepositoryContext,
    id: string,
    input: StoreAttachmentInput,
  ): Promise<{ feedback: Feedback; attachment: FeedbackAttachment }>;
  getAttachment(
    context: RepositoryContext,
    id: string,
    attachmentId: string,
  ): Promise<StoredAttachment>;
}
