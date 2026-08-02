import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import multipart from "@fastify/multipart";
import { createHash } from "node:crypto";
import {
  validateCreateFeedbackRequest,
  validateUpdateFeedbackRequest,
  type AddCommentRequest,
  type AddEvidenceRequest,
  type ClaimFeedbackRequest,
  type CloseFeedbackRequest,
  type FeedbackMutationResponse,
  type FeedbackScope,
  type ListFeedbackQuery,
  type MutationVersionRequest,
  type RejectFeedbackRequest,
  type RenewFeedbackClaimRequest,
  type ReopenFeedbackRequest,
  type ResolveFeedbackRequest,
} from "@ventus/feedback-contracts";
import { hasScope, resolveConfiguredAuth, type AuthContext } from "./auth.js";
import type { ApiConfiguration } from "./config.js";
import {
  processAttachment,
  type AttachmentScanner,
} from "./attachmentSecurity.js";
import type { ObjectStorage } from "./objectStorage.js";
import { RepositoryError, type FeedbackRepository } from "./repository.js";

export type BuildApiServerOptions = {
  configuration: ApiConfiguration;
  repository: FeedbackRepository;
  logger?: boolean;
  resolveAuth?: (
    request: FastifyRequest,
  ) => AuthContext | null | Promise<AuthContext | null>;
  objectStorage?: ObjectStorage;
  attachmentScanner?: AttachmentScanner;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const requireVersion = (request: FastifyRequest, body: unknown): number => {
  if (
    !body ||
    typeof body !== "object" ||
    !Number.isInteger((body as { version?: unknown }).version)
  ) {
    throw new HttpError(
      400,
      "validation_failed",
      "A positive integer version is required.",
    );
  }
  const version = Number((body as { version: number }).version);
  const ifMatch = request.headers["if-match"]?.replaceAll('"', "");
  if (!ifMatch || Number(ifMatch) !== version) {
    throw new HttpError(
      409,
      "conflict",
      "If-Match must equal the request version.",
    );
  }
  return version;
};

const requireIdempotencyKey = (request: FastifyRequest): string => {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string" || value.length < 8 || value.length > 200) {
    throw new HttpError(
      400,
      "validation_failed",
      "An Idempotency-Key header between 8 and 200 characters is required.",
    );
  }
  return value;
};

const routeId = (request: FastifyRequest): string =>
  (request.params as { feedbackId: string }).feedbackId;

const normalizeIngestionBody = (
  body: unknown,
  projectId: string | null,
): unknown => {
  if (!body || typeof body !== "object") return body;
  const record = body as Record<string, unknown>;
  const payload = record.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return record.projectId || !projectId ? body : { ...record, projectId };
  }
  const capture = payload as Record<string, unknown>;
  return {
    schemaVersion: capture.schemaVersion,
    projectId: projectId ?? record.projectId,
    category: ["bug", "feedback", "idea"].includes(String(capture.category))
      ? capture.category
      : "feedback",
    title: capture.title,
    description: capture.description,
    ...(typeof capture.sourceApp === "string"
      ? { sourceApp: capture.sourceApp }
      : {}),
    ...(typeof capture.release === "string"
      ? { release: capture.release }
      : {}),
    ...(typeof capture.environment === "string"
      ? { environment: capture.environment }
      : {}),
    ...(typeof capture.url === "string" ? { url: capture.url } : {}),
    ...(capture.context === undefined ? {} : { context: capture.context }),
    diagnostics: {
      browser: capture.browser ?? null,
      performance: capture.performance ?? null,
      consoleLogs: capture.consoleLogs ?? [],
      errors: capture.errors ?? [],
      networkErrors: capture.networkErrors ?? [],
      breadcrumbs: capture.breadcrumbs ?? [],
    },
  };
};

export const buildApiServer = (
  options: BuildApiServerOptions,
): FastifyInstance => {
  const server = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: options.configuration.logLevel,
            redact: [
              "req.headers.authorization",
              "req.headers.x-feedback-project-key",
              "req.headers.x-feedback-reporter-token",
              "request.headers.authorization",
            ],
          },
    bodyLimit: 512 * 1024,
    trustProxy: options.configuration.trustProxy,
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });

  const authFor = async (
    request: FastifyRequest,
    scope: FeedbackScope,
  ): Promise<AuthContext> => {
    let auth = options.resolveAuth
      ? await options.resolveAuth(request)
      : resolveConfiguredAuth(request.headers, options.configuration);
    const reporterToken = request.headers["x-feedback-reporter-token"];
    const feedbackId = (request.params as { feedbackId?: string } | undefined)
      ?.feedbackId;
    if (!auth && typeof reporterToken === "string" && feedbackId) {
      const reporter = await options.repository.authenticateReporter(
        feedbackId,
        reporterToken,
      );
      if (reporter)
        auth = {
          ...reporter,
          scopes: reporter.scopes as FeedbackScope[],
          kind: "reporter",
        };
    }
    if (!auth)
      throw new HttpError(401, "unauthorized", "Authentication is required.");
    if (!hasScope(auth, scope))
      throw new HttpError(403, "forbidden", `The ${scope} scope is required.`);
    return auth;
  };

  const authForAny = async (
    request: FastifyRequest,
    scopes: FeedbackScope[],
  ): Promise<AuthContext> => {
    const auth = options.resolveAuth
      ? await options.resolveAuth(request)
      : resolveConfiguredAuth(request.headers, options.configuration);
    if (!auth)
      throw new HttpError(401, "unauthorized", "Authentication is required.");
    if (!scopes.some((scope) => hasScope(auth, scope))) {
      throw new HttpError(
        403,
        "forbidden",
        `One of these scopes is required: ${scopes.join(", ")}.`,
      );
    }
    return auth;
  };

  const contextFor = (auth: AuthContext) => ({
    workspaceId: auth.workspaceId,
    projectId: auth.projectId,
    actor: auth.actor,
    scopes: auth.scopes,
  });

  const setVersion = (reply: FastifyReply, version: number): void => {
    reply.header("etag", `"${version}"`);
  };

  server.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
  });
  void server.register(multipart, {
    limits: {
      files: 1,
      fields: 4,
      fileSize: options.configuration.attachments.maxFileBytes,
    },
  });
  const ingestionWindows = new Map<
    string,
    { count: number; resetAt: number }
  >();
  const enforceIngestionRateLimit = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const currentTime = Date.now();
    const projectKey = request.headers["x-feedback-project-key"];
    const key = createHash("sha256")
      .update(
        `${typeof projectKey === "string" ? projectKey : "anonymous"}:${request.ip}`,
      )
      .digest("hex");
    let window = ingestionWindows.get(key);
    if (!window || window.resetAt <= currentTime) {
      window = {
        count: 0,
        resetAt:
          currentTime +
          options.configuration.ingestionRateLimit.windowMilliseconds,
      };
      ingestionWindows.set(key, window);
    }
    window.count += 1;
    const retryAfter = Math.max(
      1,
      Math.ceil((window.resetAt - currentTime) / 1_000),
    );
    reply.header(
      "x-ratelimit-limit",
      options.configuration.ingestionRateLimit.max,
    );
    reply.header(
      "x-ratelimit-remaining",
      Math.max(0, options.configuration.ingestionRateLimit.max - window.count),
    );
    reply.header("x-ratelimit-reset", Math.ceil(window.resetAt / 1_000));
    if (window.count > options.configuration.ingestionRateLimit.max) {
      reply.header("retry-after", retryAfter);
      throw new HttpError(
        429,
        "rate_limited",
        "Too many feedback requests. Retry later.",
      );
    }
    if (ingestionWindows.size > 10_000) {
      for (const [candidate, value] of ingestionWindows) {
        if (value.resetAt <= currentTime) ingestionWindows.delete(candidate);
      }
    }
  };

  server.setErrorHandler((error, request, reply) => {
    const mapped =
      error instanceof HttpError
        ? error
        : error instanceof RepositoryError
          ? new HttpError(
              error.code === "not_found"
                ? 404
                : error.code === "conflict"
                  ? 409
                  : error.code === "forbidden"
                    ? 403
                    : 422,
              error.code,
              error.message,
            )
          : typeof error === "object" &&
              error !== null &&
              "statusCode" in error &&
              error.statusCode === 413
            ? new HttpError(
                413,
                "payload_too_large",
                "The request body exceeds the configured limit.",
              )
            : new HttpError(
                500,
                "internal_error",
                "The request could not be completed.",
              );
    if (mapped.status >= 500)
      request.log.error({ err: error }, "request failed");
    void reply.status(mapped.status).send({
      error: {
        code: mapped.code,
        message: mapped.message,
        requestId: request.id,
        ...(mapped.details ? { details: mapped.details } : {}),
      },
    });
  });

  server.get("/v1/health", async () => ({ status: "ok" }));
  server.get("/v1/ready", async (_request, reply) => {
    const ready =
      (await options.repository.ready()) &&
      (!options.objectStorage || (await options.objectStorage.ready()));
    return ready
      ? { status: "ready" }
      : reply.status(503).send({ status: "not_ready" });
  });
  server.get("/v1/version", async () => ({
    service: "ventus-feedback-api",
    applicationVersion: options.configuration.applicationVersion,
    apiVersion: "v1",
    schemaVersion: "1.0",
  }));

  server.options("/v1/*", async (request, reply) => {
    const origin = request.headers.origin;
    const auth = resolveConfiguredAuth(request.headers, options.configuration);
    const project =
      auth?.kind === "project_key"
        ? Object.values(options.configuration.projectKeys).find(
            (entry) =>
              entry.workspaceId === auth.workspaceId &&
              entry.projectId === auth.projectId,
          )
        : undefined;
    if (
      !auth ||
      !project ||
      !origin ||
      !project.allowedOrigins.includes(origin)
    ) {
      throw new HttpError(
        403,
        "forbidden",
        "The preflight origin is not allowed.",
      );
    }
    return reply
      .header("access-control-allow-origin", origin)
      .header("access-control-allow-methods", "POST,GET,PATCH,DELETE,OPTIONS")
      .header(
        "access-control-allow-headers",
        "authorization,content-type,idempotency-key,if-match,x-feedback-project-key,x-feedback-reporter-token,x-request-id",
      )
      .header("access-control-max-age", "600")
      .header("access-control-allow-credentials", "true")
      .status(204)
      .send();
  });

  server.post(
    "/v1/feedback",
    {
      preHandler: enforceIngestionRateLimit,
    },
    async (request, reply) => {
      const auth = await authFor(request, "feedback:submit");
      const idempotencyKey = requireIdempotencyKey(request);
      const validated = validateCreateFeedbackRequest(
        normalizeIngestionBody(request.body, auth.projectId),
      );
      if (!validated.success) {
        throw new HttpError(
          422,
          "validation_failed",
          "The feedback submission is invalid.",
          validated.issues,
        );
      }
      if (auth.projectId && validated.data.projectId !== auth.projectId) {
        throw new HttpError(
          403,
          "forbidden",
          "The project key cannot submit to this project.",
        );
      }
      if (auth.kind === "project_key") {
        const origin = request.headers.origin;
        const project = Object.values(options.configuration.projectKeys).find(
          (entry) =>
            entry.projectId === auth.projectId &&
            entry.workspaceId === auth.workspaceId,
        );
        if (origin && project && !project.allowedOrigins.includes(origin)) {
          throw new HttpError(
            403,
            "forbidden",
            "The request origin is not allowed for this project.",
          );
        }
        if (origin) {
          reply.header("access-control-allow-origin", origin);
          reply.header("access-control-allow-credentials", "true");
        }
      }
      const result = await options.repository.create(
        contextFor(auth),
        validated.data,
        idempotencyKey,
      );
      setVersion(reply, result.feedback.version);
      return reply.status(201).send(result);
    },
  );

  server.get("/v1/feedback", async (request) => {
    const auth = await authFor(request, "feedback:read");
    return options.repository.list(
      contextFor(auth),
      request.query as ListFeedbackQuery,
    );
  });

  server.get("/v1/feedback/:feedbackId", async (request, reply) => {
    const auth = await authFor(request, "feedback:read");
    const feedback = await options.repository.get(
      contextFor(auth),
      routeId(request),
    );
    setVersion(reply, feedback.version);
    return feedback;
  });

  server.patch("/v1/feedback/:feedbackId", async (request, reply) => {
    const auth = await authFor(request, "feedback:triage");
    requireVersion(request, request.body);
    const idempotencyKey = requireIdempotencyKey(request);
    const validated = validateUpdateFeedbackRequest(request.body);
    if (!validated.success)
      throw new HttpError(
        422,
        "validation_failed",
        "The update is invalid.",
        validated.issues,
      );
    const result = await options.repository.update(
      contextFor(auth),
      routeId(request),
      validated.data,
      idempotencyKey,
    );
    setVersion(reply, result.feedback.version);
    return result;
  });

  const mutation =
    <T extends { version: number }>(
      scope: FeedbackScope,
      operation: (
        context: ReturnType<typeof contextFor>,
        id: string,
        body: T,
        idempotencyKey: string,
      ) => Promise<FeedbackMutationResponse>,
    ) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await authFor(request, scope);
      requireVersion(request, request.body);
      const idempotencyKey = requireIdempotencyKey(request);
      const result = await operation(
        contextFor(auth),
        routeId(request),
        request.body as T,
        idempotencyKey,
      );
      setVersion(reply, result.feedback.version);
      return result;
    };

  server.post("/v1/feedback/:feedbackId/comments", async (request, reply) => {
    const auth = await authFor(request, "feedback:comment");
    requireVersion(request, request.body);
    const idempotencyKey = requireIdempotencyKey(request);
    const body = request.body as AddCommentRequest;
    if (!body.body?.trim())
      throw new HttpError(
        422,
        "validation_failed",
        "Comment body is required.",
      );
    const result = await options.repository.addComment(
      contextFor(auth),
      routeId(request),
      body,
      idempotencyKey,
    );
    setVersion(reply, result.feedback.version);
    return reply.status(201).send(result);
  });
  server.post(
    "/v1/feedback/:feedbackId/claim",
    mutation<ClaimFeedbackRequest>(
      "feedback:triage",
      (context, id, body, key) =>
        options.repository.claim(context, id, body, key),
    ),
  );
  server.post(
    "/v1/feedback/:feedbackId/claim/renew",
    mutation<RenewFeedbackClaimRequest>(
      "feedback:triage",
      (context, id, body, key) =>
        options.repository.renewClaim(context, id, body, key),
    ),
  );
  server.delete(
    "/v1/feedback/:feedbackId/claim",
    mutation<MutationVersionRequest>(
      "feedback:triage",
      (context, id, body, key) =>
        options.repository.releaseClaim(context, id, body, key),
    ),
  );
  server.post(
    "/v1/feedback/:feedbackId/resolve",
    mutation<ResolveFeedbackRequest>(
      "feedback:resolve",
      (context, id, body, key) =>
        options.repository.resolve(context, id, body, key),
    ),
  );
  server.post(
    "/v1/feedback/:feedbackId/close",
    mutation<CloseFeedbackRequest>("feedback:close", (context, id, body, key) =>
      options.repository.closeFeedback(context, id, body, key),
    ),
  );
  server.post(
    "/v1/feedback/:feedbackId/reopen",
    mutation<ReopenFeedbackRequest>(
      "feedback:triage",
      (context, id, body, key) =>
        options.repository.reopen(context, id, body, key),
    ),
  );
  server.post(
    "/v1/feedback/:feedbackId/reject",
    mutation<RejectFeedbackRequest>(
      "feedback:triage",
      (context, id, body, key) =>
        options.repository.reject(context, id, body, key),
    ),
  );
  server.post("/v1/feedback/:feedbackId/evidence", async (request, reply) => {
    const auth = await authFor(request, "feedback:comment");
    requireVersion(request, request.body);
    const idempotencyKey = requireIdempotencyKey(request);
    const body = request.body as AddEvidenceRequest;
    if (!body.note?.trim())
      throw new HttpError(
        422,
        "validation_failed",
        "Evidence note is required.",
      );
    const result = await options.repository.addEvidence(
      contextFor(auth),
      routeId(request),
      body,
      idempotencyKey,
    );
    setVersion(reply, result.feedback.version);
    return reply.status(201).send(result);
  });
  server.get("/v1/feedback/:feedbackId/events", async (request) => {
    const auth = await authFor(request, "feedback:read");
    const query = request.query as { cursor?: string; limit?: string | number };
    return options.repository.events(
      contextFor(auth),
      routeId(request),
      query.cursor,
      query.limit === undefined ? undefined : Number(query.limit),
    );
  });

  server.post(
    "/v1/feedback/:feedbackId/attachments",
    {
      preHandler: enforceIngestionRateLimit,
    },
    async (request, reply) => {
      const auth = await authForAny(request, [
        "feedback:submit",
        "feedback:comment",
      ]);
      if (!options.objectStorage) {
        throw new HttpError(
          503,
          "internal_error",
          "Attachment storage is not configured.",
        );
      }
      const ifMatch = request.headers["if-match"]?.replaceAll('"', "");
      const idempotencyKey = request.headers["idempotency-key"];
      const version = Number(ifMatch);
      if (!ifMatch || !Number.isInteger(version) || version < 1) {
        throw new HttpError(
          409,
          "conflict",
          "A valid If-Match version is required.",
        );
      }
      if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
        throw new HttpError(
          400,
          "validation_failed",
          "A valid Idempotency-Key header is required for attachment upload.",
        );
      }
      const part = await request.file();
      if (!part)
        throw new HttpError(
          422,
          "validation_failed",
          "One attachment file is required.",
        );
      const data = new Uint8Array(await part.toBuffer());
      if (part.file.truncated)
        throw new HttpError(
          413,
          "payload_too_large",
          "The attachment exceeds the file limit.",
        );
      const kindField = (part.fields as Record<string, { value?: unknown }>)
        .kind?.value;
      const kind = ["screenshot", "image", "text", "video", "other"].includes(
        String(kindField),
      )
        ? (kindField as "screenshot" | "image" | "text" | "video" | "other")
        : "other";
      let processed;
      try {
        processed = await processAttachment({
          data,
          claimedMediaType: part.mimetype,
          fileName: part.filename,
          allowedMediaTypes:
            options.configuration.attachments.allowedMediaTypes,
          allowUnscanned: options.configuration.attachments.allowUnscanned,
          ...(options.attachmentScanner
            ? { scanner: options.attachmentScanner }
            : {}),
        });
      } catch (error) {
        throw new HttpError(
          422,
          "validation_failed",
          error instanceof Error
            ? error.message
            : "Attachment validation failed.",
        );
      }
      const feedbackId = routeId(request);
      const projectSegment = auth.projectId ?? "workspace";
      const contentHash = createHash("sha256")
        .update(processed.data)
        .digest("hex");
      const keyHash = createHash("sha256").update(idempotencyKey).digest("hex");
      const objectKey = `${auth.workspaceId}/${projectSegment}/${feedbackId}/${keyHash}/${contentHash}`;
      await options.objectStorage.put(
        objectKey,
        processed.data,
        processed.mediaType,
      );
      try {
        const result = await options.repository.addAttachment(
          contextFor(auth),
          feedbackId,
          {
            version,
            idempotencyKey,
            kind,
            fileName: processed.fileName,
            mediaType: processed.mediaType,
            size: processed.data.byteLength,
            objectKey,
          },
        );
        setVersion(reply, result.feedback.version);
        return reply.status(201).send(result);
      } catch (error) {
        await options.objectStorage.delete(objectKey).catch(() => undefined);
        throw error;
      }
    },
  );

  server.get(
    "/v1/feedback/:feedbackId/attachments/:attachmentId",
    async (request, reply) => {
      const auth = await authFor(request, "feedback:read");
      if (!options.objectStorage) {
        throw new HttpError(
          503,
          "internal_error",
          "Attachment storage is not configured.",
        );
      }
      const params = request.params as {
        feedbackId: string;
        attachmentId: string;
      };
      const attachment = await options.repository.getAttachment(
        contextFor(auth),
        params.feedbackId,
        params.attachmentId,
      );
      const url = await options.objectStorage.createDownloadUrl(
        attachment.objectKey,
        attachment.fileName,
      );
      return reply.redirect(url, 302);
    },
  );

  server.addHook("onClose", async () => options.repository.close());
  return server;
};
