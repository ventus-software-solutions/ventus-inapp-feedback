import type {
  FeedbackActorType,
  FeedbackScope,
} from "@ventus-software-solutions/feedback-contracts";

export type ProjectKeyConfiguration = {
  workspaceId: string;
  projectId: string;
  allowedOrigins: string[];
};

export type ServiceTokenConfiguration = {
  workspaceId: string;
  projectId?: string;
  actorId: string;
  actorType: Exclude<FeedbackActorType, "reporter">;
  displayName: string;
  scopes: FeedbackScope[];
};

export type ApiConfiguration = {
  host: string;
  port: number;
  trustProxy: boolean | number | string | string[];
  databaseUrl: string | null;
  logLevel: string;
  applicationVersion: string;
  autoMigrate: boolean;
  autoSeedConfiguredProjects: boolean;
  databasePoolSize: number;
  ingestionRateLimit: {
    max: number;
    windowMilliseconds: number;
  };
  retention: {
    days: number | null;
    purgeGraceDays: number;
    batchSize: number;
    dryRun: boolean;
  };
  projectKeys: Record<string, ProjectKeyConfiguration>;
  serviceTokens: Record<string, ServiceTokenConfiguration>;
  attachments: {
    bucket: string | null;
    endpoint: string | null;
    publicEndpoint: string | null;
    region: string;
    accessKeyId: string | null;
    secretAccessKey: string | null;
    forcePathStyle: boolean;
    allowUnscanned: boolean;
    maxFileBytes: number;
    maxSubmissionBytes: number;
    allowedMediaTypes: string[];
    autoCreateBucket: boolean;
    serverSideEncryption: boolean;
  };
};

const parseObject = <T>(
  value: string | undefined,
  name: string,
): Record<string, T> => {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed as Record<string, T>;
  } catch {
    throw new Error(`${name} must be a JSON object.`);
  }
};

const parseTrustProxy = (
  value: string | undefined,
): ApiConfiguration["trustProxy"] => {
  const normalized = value?.trim();
  if (!normalized || normalized === "false") return false;
  if (normalized === "true") {
    throw new Error(
      "VENTUS_TRUST_PROXY=true is unsafe; configure a hop count or trusted proxy addresses.",
    );
  }
  if (/^[1-9]\d*$/.test(normalized)) return Number(normalized);
  const entries = normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length === 1 ? entries[0]! : entries;
};

export const loadApiConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfiguration => {
  const port = Number(environment.VENTUS_API_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("VENTUS_API_PORT must be an integer between 1 and 65535.");
  }
  const databasePoolSize = Number(environment.VENTUS_DATABASE_POOL_SIZE ?? 10);
  if (
    !Number.isInteger(databasePoolSize) ||
    databasePoolSize < 1 ||
    databasePoolSize > 100
  ) {
    throw new Error(
      "VENTUS_DATABASE_POOL_SIZE must be an integer between 1 and 100.",
    );
  }
  const databaseUrl = environment.VENTUS_DATABASE_URL?.trim() || null;
  if (
    !databaseUrl &&
    environment.NODE_ENV === "production" &&
    environment.VENTUS_USE_IN_MEMORY !== "true"
  ) {
    throw new Error(
      "VENTUS_DATABASE_URL is required in production unless VENTUS_USE_IN_MEMORY=true is explicitly set.",
    );
  }
  const maxFileBytes = Number(
    environment.VENTUS_ATTACHMENT_MAX_FILE_BYTES ?? 10 * 1024 * 1024,
  );
  const maxSubmissionBytes = Number(
    environment.VENTUS_ATTACHMENT_MAX_SUBMISSION_BYTES ?? 25 * 1024 * 1024,
  );
  const ingestionRateLimitMax = Number(
    environment.VENTUS_INGESTION_RATE_LIMIT_MAX ?? 60,
  );
  const ingestionRateLimitWindow = Number(
    environment.VENTUS_INGESTION_RATE_LIMIT_WINDOW_MS ?? 60_000,
  );
  const retentionDays = environment.VENTUS_RETENTION_DAYS?.trim()
    ? Number(environment.VENTUS_RETENTION_DAYS)
    : null;
  const retentionPurgeGraceDays = Number(
    environment.VENTUS_RETENTION_PURGE_GRACE_DAYS ?? 7,
  );
  const retentionBatchSize = Number(
    environment.VENTUS_RETENTION_BATCH_SIZE ?? 100,
  );
  if (!Number.isInteger(maxFileBytes) || maxFileBytes < 1)
    throw new Error(
      "VENTUS_ATTACHMENT_MAX_FILE_BYTES must be a positive integer.",
    );
  if (
    !Number.isInteger(maxSubmissionBytes) ||
    maxSubmissionBytes < maxFileBytes
  )
    throw new Error(
      "VENTUS_ATTACHMENT_MAX_SUBMISSION_BYTES must be at least the per-file limit.",
    );
  if (!Number.isInteger(ingestionRateLimitMax) || ingestionRateLimitMax < 1)
    throw new Error(
      "VENTUS_INGESTION_RATE_LIMIT_MAX must be a positive integer.",
    );
  if (
    !Number.isInteger(ingestionRateLimitWindow) ||
    ingestionRateLimitWindow < 1_000
  )
    throw new Error(
      "VENTUS_INGESTION_RATE_LIMIT_WINDOW_MS must be at least 1000.",
    );
  if (
    retentionDays !== null &&
    (!Number.isInteger(retentionDays) || retentionDays < 1)
  ) {
    throw new Error(
      "VENTUS_RETENTION_DAYS must be a positive integer when configured.",
    );
  }
  if (
    !Number.isInteger(retentionPurgeGraceDays) ||
    retentionPurgeGraceDays < 0
  ) {
    throw new Error(
      "VENTUS_RETENTION_PURGE_GRACE_DAYS must be a non-negative integer.",
    );
  }
  if (
    !Number.isInteger(retentionBatchSize) ||
    retentionBatchSize < 1 ||
    retentionBatchSize > 1_000
  ) {
    throw new Error(
      "VENTUS_RETENTION_BATCH_SIZE must be an integer between 1 and 1000.",
    );
  }
  return {
    host: environment.VENTUS_API_HOST?.trim() || "0.0.0.0",
    port,
    trustProxy: parseTrustProxy(environment.VENTUS_TRUST_PROXY),
    databaseUrl,
    logLevel: environment.VENTUS_LOG_LEVEL?.trim() || "info",
    applicationVersion:
      environment.VENTUS_APPLICATION_VERSION?.trim() || "0.1.0-dev",
    autoMigrate: environment.VENTUS_AUTO_MIGRATE === "true",
    autoSeedConfiguredProjects:
      environment.VENTUS_AUTO_SEED_CONFIGURED_PROJECTS === "true",
    databasePoolSize,
    ingestionRateLimit: {
      max: ingestionRateLimitMax,
      windowMilliseconds: ingestionRateLimitWindow,
    },
    retention: {
      days: retentionDays,
      purgeGraceDays: retentionPurgeGraceDays,
      batchSize: retentionBatchSize,
      dryRun: environment.VENTUS_RETENTION_DRY_RUN !== "false",
    },
    projectKeys: parseObject<ProjectKeyConfiguration>(
      environment.VENTUS_PROJECT_KEYS_JSON,
      "VENTUS_PROJECT_KEYS_JSON",
    ),
    serviceTokens: parseObject<ServiceTokenConfiguration>(
      environment.VENTUS_SERVICE_TOKENS_JSON,
      "VENTUS_SERVICE_TOKENS_JSON",
    ),
    attachments: {
      bucket: environment.VENTUS_S3_BUCKET?.trim() || null,
      endpoint: environment.VENTUS_S3_ENDPOINT?.trim() || null,
      publicEndpoint: environment.VENTUS_S3_PUBLIC_ENDPOINT?.trim() || null,
      region: environment.VENTUS_S3_REGION?.trim() || "us-east-1",
      accessKeyId: environment.VENTUS_S3_ACCESS_KEY_ID?.trim() || null,
      secretAccessKey: environment.VENTUS_S3_SECRET_ACCESS_KEY?.trim() || null,
      forcePathStyle: environment.VENTUS_S3_FORCE_PATH_STYLE === "true",
      allowUnscanned: environment.VENTUS_ALLOW_UNSCANNED_ATTACHMENTS === "true",
      maxFileBytes,
      maxSubmissionBytes,
      allowedMediaTypes: (
        environment.VENTUS_ATTACHMENT_ALLOWED_MEDIA_TYPES ??
        "image/png,image/jpeg,image/webp,text/plain,application/pdf,video/mp4,video/webm"
      )
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
      autoCreateBucket: environment.VENTUS_S3_AUTO_CREATE_BUCKET === "true",
      serverSideEncryption:
        environment.VENTUS_S3_SERVER_SIDE_ENCRYPTION === "true",
    },
  };
};
