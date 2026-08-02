export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

export type ConsoleEntry = {
  timestamp: string;
  level: ConsoleLevel;
  args: string[];
};

export type ErrorEntry = {
  timestamp: string;
  type: "error" | "unhandledrejection";
  message?: string;
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  reason?: string;
};

export type NetworkFailureEntry = {
  timestamp: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  transport: "fetch" | "xhr" | "manual";
};

export type NetworkFailureInput = {
  method: string;
  url: string;
  status: number;
  durationMs?: number;
};

export type FeedbackBreadcrumb = {
  timestamp: string;
  type: "click" | "submit" | "navigation";
  url: string;
  target: string | null;
  tag?: string;
  destination?: string;
};

export type BrowserSnapshot = {
  userAgent: string;
  language: string;
  onLine: boolean;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
    scrollX: number;
    scrollY: number;
  };
  screen: {
    width: number;
    height: number;
    colorDepth: number;
  } | null;
  timezone: string;
  url: string;
  referrer: string;
  title: string;
};

export type PerformanceSnapshot = {
  timeOrigin: number;
  now: number;
  navigation: {
    type: string;
    startTime: number;
    duration: number;
    domContentLoadedEventEnd: number;
    loadEventEnd: number;
    responseStart: number;
    responseEnd: number;
  } | null;
  paint: Array<{
    name: string;
    startTime: number;
    duration: number;
  }>;
};

export type CaptureDiagnosticsOptions = {
  console?: boolean;
  errors?: boolean;
  network?: boolean;
  breadcrumbs?: boolean;
  browser?: boolean;
  performance?: boolean;
};

export type RedactionContext = {
  kind: "console" | "error" | "url" | "breadcrumb" | "context";
};

export type FeedbackRedactionOptions = {
  redactEmails?: boolean;
  redactPotentialCardNumbers?: boolean;
  sensitiveKeys?: string[];
  allowedQueryParameters?: string[];
  customPatterns?: Array<{
    pattern: RegExp;
    replacement?: string;
  }>;
  redactText?: (value: string, context: RedactionContext) => string;
};

export type ScreenshotCaptureOptions = {
  region?: "viewport" | "document";
  backgroundColor?: string;
  maskSelectors?: string[];
  imageType?: "image/png" | "image/jpeg" | "image/webp";
  imageQuality?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxBytes?: number;
  captureTimeoutMs?: number;
  onClone?: (documentClone: Document) => void;
};

export type Html2CanvasLoader = () => Promise<unknown>;

export type FeedbackCategory = "bug" | "feedback" | "idea";

export type FeedbackCapturePayloadInput<TContext = unknown> = {
  title?: string;
  description?: string;
  category?: FeedbackCategory;
  sourceApp?: string;
  release?: string;
  environment?: string;
  context?: TContext;
};

export type FeedbackCapturePayload<TContext = unknown> = {
  schemaVersion: "1.0";
  sourceApp: string | null;
  title: string;
  description: string;
  category: FeedbackCategory | null;
  release: string | null;
  environment: string | null;
  url: string | null;
  capturedAt: string;
  browser: BrowserSnapshot | null;
  performance: PerformanceSnapshot | null;
  consoleLogs: ConsoleEntry[];
  errors: ErrorEntry[];
  networkErrors: NetworkFailureEntry[];
  breadcrumbs: FeedbackBreadcrumb[];
  context: { application: TContext } | null;
};

export type FeedbackCaptureCoreOptions<TContext = unknown> = {
  storeKey?: string;
  maxConsoleEntries?: number;
  maxErrorEntries?: number;
  maxNetworkEntries?: number;
  maxBreadcrumbEntries?: number;
  maxSerializedLength?: number;
  consoleLevels?: ConsoleLevel[];
  diagnostics?: CaptureDiagnosticsOptions;
  redaction?: FeedbackRedactionOptions;
  screenshot?: ScreenshotCaptureOptions;
  loadHtml2Canvas?: Html2CanvasLoader;
  getContext?: () => TContext | undefined;
};

export type FeedbackCaptureCore<TContext = unknown> = {
  init: () => void;
  destroy: () => void;
  clear: () => void;
  isInitialized: () => boolean;
  recordNetworkFailure: (input: NetworkFailureInput) => void;
  getPayload: (
    input?: FeedbackCapturePayloadInput<TContext>,
  ) => FeedbackCapturePayload<TContext>;
  captureViewportScreenshotBlob: () => Promise<Blob | null>;
  captureDisplayMediaScreenshotBlob: () => Promise<Blob | null>;
};

export type FeedbackAttachmentKind =
  | "screenshot"
  | "image"
  | "text"
  | "video"
  | "other";

export type FeedbackAttachment = {
  kind: FeedbackAttachmentKind;
  fileName: string;
  mediaType: string;
  size: number;
  data: Blob;
};

export type FeedbackSubmission<TContext = unknown> = {
  schemaVersion: "1.0";
  idempotencyKey: string;
  payload: FeedbackCapturePayload<TContext>;
  attachments: FeedbackAttachment[];
};

export type FeedbackReceipt = {
  id: string;
  status: "received";
  createdAt: string;
  version?: number;
};

export type FeedbackUploadProgress = {
  phase: "preparing" | "uploading" | "complete";
  loaded: number;
  total: number;
};

export type FeedbackSubmitOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: FeedbackUploadProgress) => void;
};

export type FeedbackTransport<
  TContext = unknown,
  TReceipt = FeedbackReceipt,
> = {
  submit: (
    submission: FeedbackSubmission<TContext>,
    options?: FeedbackSubmitOptions,
  ) => Promise<TReceipt>;
};

export type FeedbackValidationIssue = {
  path: string;
  message: string;
};

export type FeedbackValidationResult =
  | { success: true; data: FeedbackCapturePayload<unknown> }
  | { success: false; issues: FeedbackValidationIssue[] };

export type FeedbackTransportErrorCode =
  | "aborted"
  | "invalid_submission"
  | "network_error"
  | "http_error"
  | "invalid_response"
  | "unsupported_environment";

export type FeedbackHttpRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
};

export type FeedbackHttpTransportOptions = {
  endpoint: string;
  fetch?: typeof globalThis.fetch;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  credentials?: RequestCredentials;
  maxPayloadBytes?: number;
  maxAttachmentBytes?: number;
  maxTotalAttachmentBytes?: number;
  retry?: FeedbackHttpRetryOptions;
};
