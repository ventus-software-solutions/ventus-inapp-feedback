import type {
  AddCommentRequest,
  AddCommentResponse,
  AddEvidenceRequest,
  AddEvidenceResponse,
  ApiErrorEnvelope,
  ClaimFeedbackRequest,
  CloseFeedbackRequest,
  CreateFeedbackRequest,
  CreateFeedbackResponse,
  CursorPage,
  Feedback,
  FeedbackAttachment,
  FeedbackEvent,
  FeedbackMutationResponse,
  ListFeedbackQuery,
  MutationVersionRequest,
  RejectFeedbackRequest,
  RenewFeedbackClaimRequest,
  ReopenFeedbackRequest,
  ResolveFeedbackRequest,
  ServiceVersionResponse,
  UpdateFeedbackRequest,
} from "@ventus-software-solutions/feedback-contracts";

export type FeedbackApiClientOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  token?: string | (() => string | Promise<string>);
  projectKey?: string;
  reporterToken?: string;
  headers?: HeadersInit;
};

export type FeedbackApiRequestOptions = {
  signal?: AbortSignal;
  idempotencyKey?: string;
};

export type UploadFeedbackAttachmentInput = {
  version: number;
  idempotencyKey: string;
  kind: FeedbackAttachment["kind"];
  fileName: string;
  data: Blob;
};

export class FeedbackApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: ApiErrorEnvelope["error"]["details"];

  constructor(status: number, envelope: ApiErrorEnvelope | null) {
    super(
      envelope?.error.message ??
        `Feedback API request failed with status ${status}.`,
    );
    this.name = "FeedbackApiError";
    this.status = status;
    this.code = envelope?.error.code ?? "unknown_error";
    this.requestId = envelope?.error.requestId ?? null;
    this.details = envelope?.error.details;
  }
}

const encodeQuery = (query: ListFeedbackQuery): string => {
  const parameters = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined) continue;
    if (Array.isArray(raw))
      raw.forEach((value) => parameters.append(key, String(value)));
    else parameters.set(key, String(raw));
  }
  const value = parameters.toString();
  return value ? `?${value}` : "";
};

const createIdempotencyKey = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `feedback-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class FeedbackApiClient {
  readonly #options: FeedbackApiClientOptions;

  constructor(options: FeedbackApiClientOptions) {
    if (!options.baseUrl.trim())
      throw new TypeError("Feedback API baseUrl is required.");
    this.#options = { ...options, baseUrl: options.baseUrl.replace(/\/$/, "") };
  }

  async getVersion(
    options?: FeedbackApiRequestOptions,
  ): Promise<ServiceVersionResponse> {
    return this.request("GET", "/version", undefined, options);
  }

  async createFeedback(
    input: CreateFeedbackRequest,
    idempotencyKey: string,
    options?: FeedbackApiRequestOptions,
  ): Promise<CreateFeedbackResponse> {
    return this.request("POST", "/feedback", input, options, {
      "idempotency-key": idempotencyKey,
    });
  }

  async listFeedback(
    query: ListFeedbackQuery = {},
    options?: FeedbackApiRequestOptions,
  ): Promise<CursorPage<Feedback>> {
    return this.request(
      "GET",
      `/feedback${encodeQuery(query)}`,
      undefined,
      options,
    );
  }

  async getFeedback(
    id: string,
    options?: FeedbackApiRequestOptions,
  ): Promise<Feedback> {
    return this.request(
      "GET",
      `/feedback/${encodeURIComponent(id)}`,
      undefined,
      options,
    );
  }

  async updateFeedback(
    id: string,
    input: UpdateFeedbackRequest,
    options?: FeedbackApiRequestOptions,
  ): Promise<FeedbackMutationResponse> {
    return this.versioned("PATCH", id, "", input, options);
  }

  async addComment(
    id: string,
    input: AddCommentRequest,
    options?: FeedbackApiRequestOptions,
  ): Promise<AddCommentResponse> {
    return this.versioned("POST", id, "/comments", input, options);
  }

  async claimFeedback(
    id: string,
    input: ClaimFeedbackRequest,
    options?: FeedbackApiRequestOptions,
  ): Promise<FeedbackMutationResponse> {
    return this.versioned("POST", id, "/claim", input, options);
  }

  async renewClaim(
    id: string,
    input: RenewFeedbackClaimRequest,
    options?: FeedbackApiRequestOptions,
  ): Promise<FeedbackMutationResponse> {
    return this.versioned("POST", id, "/claim/renew", input, options);
  }

  async releaseClaim(
    id: string,
    input: MutationVersionRequest,
    options?: FeedbackApiRequestOptions,
  ): Promise<FeedbackMutationResponse> {
    return this.versioned("DELETE", id, "/claim", input, options);
  }

  async resolveFeedback(
    id: string,
    input: ResolveFeedbackRequest,
    options?: FeedbackApiRequestOptions,
  ): Promise<FeedbackMutationResponse> {
    return this.versioned("POST", id, "/resolve", input, options);
  }

  async closeFeedback(
    id: string,
    input: CloseFeedbackRequest,
    options?: FeedbackApiRequestOptions,
  ): Promise<FeedbackMutationResponse> {
    return this.versioned("POST", id, "/close", input, options);
  }

  async reopenFeedback(
    id: string,
    input: ReopenFeedbackRequest,
    options?: FeedbackApiRequestOptions,
  ): Promise<FeedbackMutationResponse> {
    return this.versioned("POST", id, "/reopen", input, options);
  }

  async rejectFeedback(
    id: string,
    input: RejectFeedbackRequest,
    options?: FeedbackApiRequestOptions,
  ): Promise<FeedbackMutationResponse> {
    return this.versioned("POST", id, "/reject", input, options);
  }

  async addEvidence(
    id: string,
    input: AddEvidenceRequest,
    options?: FeedbackApiRequestOptions,
  ): Promise<AddEvidenceResponse> {
    return this.versioned("POST", id, "/evidence", input, options);
  }

  async listEvents(
    id: string,
    query: { cursor?: string; limit?: number } = {},
    options?: FeedbackApiRequestOptions,
  ): Promise<CursorPage<FeedbackEvent>> {
    return this.request(
      "GET",
      `/feedback/${encodeURIComponent(id)}/events${encodeQuery(query)}`,
      undefined,
      options,
    );
  }

  async uploadAttachment(
    id: string,
    input: UploadFeedbackAttachmentInput,
    options?: FeedbackApiRequestOptions,
  ): Promise<{ feedback: Feedback; attachment: FeedbackAttachment }> {
    const fetchImplementation =
      this.#options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImplementation || typeof FormData === "undefined") {
      throw new Error("Attachment upload requires fetch and FormData support.");
    }
    const headers = await this.createHeaders({
      "if-match": `"${input.version}"`,
      "idempotency-key": input.idempotencyKey,
    });
    const form = new FormData();
    form.append("kind", input.kind);
    form.append("file", input.data, input.fileName);
    const response = await fetchImplementation(
      `${this.#options.baseUrl}/feedback/${encodeURIComponent(id)}/attachments`,
      {
        method: "POST",
        headers,
        body: form,
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      },
    );
    if (!response.ok) throw await this.createApiError(response);
    return (await response.json()) as {
      feedback: Feedback;
      attachment: FeedbackAttachment;
    };
  }

  private versioned<T>(
    method: string,
    id: string,
    suffix: string,
    input: { version: number },
    options?: FeedbackApiRequestOptions,
  ): Promise<T> {
    return this.request(
      method,
      `/feedback/${encodeURIComponent(id)}${suffix}`,
      input,
      options,
      {
        "if-match": `"${input.version}"`,
        "idempotency-key": options?.idempotencyKey ?? createIdempotencyKey(),
      },
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: FeedbackApiRequestOptions,
    extraHeaders?: HeadersInit,
  ): Promise<T> {
    const fetchImplementation =
      this.#options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImplementation)
      throw new Error("No fetch implementation is available.");
    const headers = await this.createHeaders(extraHeaders);
    if (body !== undefined) headers.set("content-type", "application/json");

    const response = await fetchImplementation(
      `${this.#options.baseUrl}${path}`,
      {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      },
    );
    if (!response.ok) {
      throw await this.createApiError(response);
    }
    return (await response.json()) as T;
  }

  private async createHeaders(extraHeaders?: HeadersInit): Promise<Headers> {
    const headers = new Headers(this.#options.headers);
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
    const token =
      typeof this.#options.token === "function"
        ? await this.#options.token()
        : this.#options.token;
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (this.#options.projectKey) {
      headers.set("x-feedback-project-key", this.#options.projectKey);
    }
    if (this.#options.reporterToken) {
      headers.set("x-feedback-reporter-token", this.#options.reporterToken);
    }
    return headers;
  }

  private async createApiError(response: Response): Promise<FeedbackApiError> {
    let envelope: ApiErrorEnvelope | null = null;
    try {
      envelope = (await response.json()) as ApiErrorEnvelope;
    } catch {
      // Use a safe generic error without reflecting a response body.
    }
    return new FeedbackApiError(response.status, envelope);
  }
}

export type * from "@ventus-software-solutions/feedback-contracts";
