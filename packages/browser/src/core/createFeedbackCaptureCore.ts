import type {
  BrowserSnapshot,
  CaptureDiagnosticsOptions,
  ConsoleEntry,
  ConsoleLevel,
  ErrorEntry,
  FeedbackBreadcrumb,
  FeedbackCaptureCore,
  FeedbackCaptureCoreOptions,
  FeedbackCapturePayload,
  FeedbackCapturePayloadInput,
  FeedbackRedactionOptions,
  NetworkFailureEntry,
  NetworkFailureInput,
  PerformanceSnapshot,
  RedactionContext,
  ScreenshotCaptureOptions,
} from "../types.js";

const DEFAULT_STORE_KEY = "__ventusFeedbackCaptureStore";
const DEFAULT_MAX_CONSOLE_ENTRIES = 200;
const DEFAULT_MAX_ERROR_ENTRIES = 100;
const DEFAULT_MAX_NETWORK_ENTRIES = 50;
const DEFAULT_MAX_BREADCRUMB_ENTRIES = 50;
const DEFAULT_MAX_SERIALIZED_LENGTH = 4_000;

const DEFAULT_DIAGNOSTICS: Required<CaptureDiagnosticsOptions> = {
  console: false,
  errors: true,
  network: false,
  breadcrumbs: false,
  browser: false,
  performance: false,
};

const DEFAULT_SENSITIVE_KEYS = [
  "access_token",
  "api-key",
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "creditcard",
  "jwt",
  "password",
  "passwd",
  "refresh_token",
  "secret",
  "session",
  "token",
];

type CaptureStore = {
  initialized: boolean;
  subscribers: number;
  consoleEntries: ConsoleEntry[];
  errorEntries: ErrorEntry[];
  networkEntries: NetworkFailureEntry[];
  breadcrumbs: FeedbackBreadcrumb[];
  cleanup: Array<() => void>;
};

type Html2CanvasOptions = {
  useCORS: boolean;
  backgroundColor: string;
  logging: boolean;
  foreignObjectRendering?: boolean;
  ignoreElements: (element: Element) => boolean;
  onclone: (documentClone: Document) => void;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  windowWidth?: number;
  windowHeight?: number;
  scrollX?: number;
  scrollY?: number;
  scale?: number;
};

type Html2Canvas = (
  element: HTMLElement,
  options: Html2CanvasOptions,
) => Promise<HTMLCanvasElement>;

const allConsoleLevels: ConsoleLevel[] = [
  "log",
  "info",
  "warn",
  "error",
  "debug",
];

const pushRing = <T>(items: T[], item: T, maximum: number): void => {
  if (maximum <= 0) return;
  items.push(item);
  if (items.length > maximum) {
    items.splice(0, items.length - maximum);
  }
};

const cloneEntries = <T>(items: T[]): T[] => items.map((item) => ({ ...item }));

const cloneConsoleEntries = (items: ConsoleEntry[]): ConsoleEntry[] =>
  items.map((item) => ({ ...item, args: [...item.args] }));

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeMaximum = (
  value: number | undefined,
  fallback: number,
): number =>
  Number.isFinite(value)
    ? Math.max(0, Math.floor(value ?? fallback))
    : fallback;

const isError = (value: unknown): value is Error => value instanceof Error;

const getErrorMessage = (value: unknown): string =>
  isError(value) ? value.message : String(value);

const createTextRedactor = (options: FeedbackRedactionOptions = {}) => {
  const sensitiveKeys = [
    ...DEFAULT_SENSITIVE_KEYS,
    ...(options.sensitiveKeys ?? []),
  ]
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean);
  const sensitiveKeySet = new Set(sensitiveKeys);
  const sensitiveKeyPattern = sensitiveKeys.map(escapeRegex).join("|");
  const keyValuePattern = sensitiveKeyPattern
    ? new RegExp(
        `(["']?(?:${sensitiveKeyPattern})["']?\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s,}&]+)`,
        "gi",
      )
    : null;

  const redact = (value: string, context: RedactionContext): string => {
    let result = value;

    if (keyValuePattern) {
      result = result.replace(keyValuePattern, "$1[REDACTED]");
    }

    result = result.replace(
      /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/gi,
      "Bearer [REDACTED]",
    );
    result = result.replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{8,})?\b/g,
      "[REDACTED_JWT]",
    );

    if (options.redactEmails !== false) {
      result = result.replace(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        "[REDACTED_EMAIL]",
      );
    }

    if (options.redactPotentialCardNumbers !== false) {
      result = result.replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_NUMBER]");
    }

    for (const rule of options.customPatterns ?? []) {
      result = result.replace(rule.pattern, rule.replacement ?? "[REDACTED]");
    }

    return options.redactText?.(result, context) ?? result;
  };

  return { redact, sensitiveKeySet };
};

const createUrlSanitizer = (
  redact: (value: string, context: RedactionContext) => string,
  allowedQueryParameters: string[] = [],
) => {
  const allowed = new Set(
    allowedQueryParameters
      .map((key) => key.trim().toLowerCase())
      .filter(Boolean),
  );

  return (value: string): string => {
    try {
      const base =
        typeof window === "undefined"
          ? "https://feedback.invalid"
          : window.location.origin;
      const url = new URL(value, base);

      for (const key of [...url.searchParams.keys()]) {
        if (!allowed.has(key.toLowerCase())) {
          url.searchParams.delete(key);
        } else {
          const values = url.searchParams.getAll(key);
          url.searchParams.delete(key);
          values.forEach((item) =>
            url.searchParams.append(key, redact(item, { kind: "url" })),
          );
        }
      }

      url.hash = "";
      return redact(url.toString(), { kind: "url" });
    } catch {
      return redact(value.split(/[?#]/, 1)[0] ?? "", { kind: "url" });
    }
  };
};

const createValueSanitizer = (
  redact: (value: string, context: RedactionContext) => string,
  sensitiveKeySet: Set<string>,
  maxSerializedLength: number,
) => {
  const finalize = (value: string, context: RedactionContext): string => {
    const redacted = redact(value, context);
    if (redacted.length <= maxSerializedLength) return redacted;
    const suffix = "...[truncated]";
    return maxSerializedLength <= suffix.length
      ? suffix.slice(0, maxSerializedLength)
      : `${redacted.slice(0, maxSerializedLength - suffix.length)}${suffix}`;
  };

  const safeSerialize = (value: unknown, context: RedactionContext): string => {
    if (isError(value)) {
      return finalize(
        JSON.stringify(
          {
            name: value.name,
            message: value.message,
            stack: value.stack,
          },
          null,
          2,
        ),
        context,
      );
    }

    if (typeof value === "string") {
      return finalize(value, context);
    }

    const seen = new WeakSet<object>();
    try {
      const json = JSON.stringify(
        value,
        (key, inner: unknown) => {
          if (sensitiveKeySet.has(key.toLowerCase())) return "[REDACTED]";
          if (typeof inner === "object" && inner !== null) {
            if (seen.has(inner)) return "[Circular]";
            seen.add(inner);
          }
          if (typeof inner === "function") {
            return `[Function ${inner.name || "anonymous"}]`;
          }
          if (typeof inner === "bigint") return inner.toString();
          if (typeof inner === "string") return redact(inner, context);
          return inner;
        },
        2,
      );

      const normalized = json || String(value);
      return finalize(normalized, context);
    } catch {
      try {
        return finalize(String(value), context);
      } catch {
        return finalize("[Unserializable]", context);
      }
    }
  };

  const sanitizeContext = <T>(value: T): T | null => {
    if (value === undefined || value === null) return null;
    if (typeof value === "string") {
      return redact(value, { kind: "context" }) as T;
    }

    const serialized = safeSerialize(value, { kind: "context" });
    try {
      return JSON.parse(serialized) as T;
    } catch {
      return null;
    }
  };

  return { safeSerialize, sanitizeContext };
};

const createStoreAccessor = (storeKey: string) => (): CaptureStore | null => {
  if (typeof window === "undefined") return null;
  const storeWindow = window as unknown as Record<string, unknown>;
  const existing = storeWindow[storeKey];
  if (existing) return existing as CaptureStore;

  const store: CaptureStore = {
    initialized: false,
    subscribers: 0,
    consoleEntries: [],
    errorEntries: [],
    networkEntries: [],
    breadcrumbs: [],
    cleanup: [],
  };
  storeWindow[storeKey] = store;
  return store;
};

export const createFeedbackCaptureCore = <TContext = unknown>(
  options: FeedbackCaptureCoreOptions<TContext> = {},
): FeedbackCaptureCore<TContext> => {
  const storeKey = options.storeKey ?? DEFAULT_STORE_KEY;
  const maxConsoleEntries = normalizeMaximum(
    options.maxConsoleEntries,
    DEFAULT_MAX_CONSOLE_ENTRIES,
  );
  const maxErrorEntries = normalizeMaximum(
    options.maxErrorEntries,
    DEFAULT_MAX_ERROR_ENTRIES,
  );
  const maxNetworkEntries = normalizeMaximum(
    options.maxNetworkEntries,
    DEFAULT_MAX_NETWORK_ENTRIES,
  );
  const maxBreadcrumbEntries = normalizeMaximum(
    options.maxBreadcrumbEntries,
    DEFAULT_MAX_BREADCRUMB_ENTRIES,
  );
  const maxSerializedLength = normalizeMaximum(
    options.maxSerializedLength,
    DEFAULT_MAX_SERIALIZED_LENGTH,
  );
  const diagnostics: Required<CaptureDiagnosticsOptions> = {
    ...DEFAULT_DIAGNOSTICS,
    ...options.diagnostics,
  };
  const consoleLevels = new Set(options.consoleLevels ?? allConsoleLevels);
  const screenshot: Required<ScreenshotCaptureOptions> = {
    region: options.screenshot?.region ?? "viewport",
    backgroundColor: options.screenshot?.backgroundColor ?? "#ffffff",
    maskSelectors: options.screenshot?.maskSelectors ?? [
      "input[type='password']",
      "input[autocomplete^='cc-']",
      "[data-feedback-mask]",
    ],
    imageType: options.screenshot?.imageType ?? "image/png",
    imageQuality: options.screenshot?.imageQuality ?? 0.92,
    maxWidth: normalizeMaximum(options.screenshot?.maxWidth, 4_096),
    maxHeight: normalizeMaximum(options.screenshot?.maxHeight, 4_096),
    maxBytes: normalizeMaximum(options.screenshot?.maxBytes, 8 * 1024 * 1024),
    captureTimeoutMs: normalizeMaximum(
      options.screenshot?.captureTimeoutMs,
      10_000,
    ),
    onClone: options.screenshot?.onClone ?? (() => undefined),
  };
  const { redact, sensitiveKeySet } = createTextRedactor(options.redaction);
  const sanitizeUrl = createUrlSanitizer(
    redact,
    options.redaction?.allowedQueryParameters,
  );
  const { safeSerialize, sanitizeContext } = createValueSanitizer(
    redact,
    sensitiveKeySet,
    maxSerializedLength,
  );
  const getStore = createStoreAccessor(storeKey);
  let active = false;

  const appendNetworkFailure = (
    store: CaptureStore,
    input: NetworkFailureInput,
    transport: NetworkFailureEntry["transport"],
  ): void => {
    pushRing(
      store.networkEntries,
      {
        timestamp: new Date().toISOString(),
        method: input.method.toUpperCase(),
        url: sanitizeUrl(input.url).slice(0, 500),
        status: Number.isFinite(input.status) ? Math.round(input.status) : 0,
        durationMs: Math.max(0, Math.round(input.durationMs ?? 0)),
        transport,
      },
      maxNetworkEntries,
    );
  };

  const recordNetworkFailure = (input: NetworkFailureInput): void => {
    if (!active || !diagnostics.network) return;
    const store = getStore();
    if (store?.initialized) appendNetworkFailure(store, input, "manual");
  };

  const recordBreadcrumb = (
    store: CaptureStore,
    breadcrumb: Omit<FeedbackBreadcrumb, "timestamp" | "url">,
  ): void => {
    pushRing(
      store.breadcrumbs,
      {
        timestamp: new Date().toISOString(),
        url: sanitizeUrl(window.location.href),
        ...breadcrumb,
      },
      maxBreadcrumbEntries,
    );
  };

  const init = (): void => {
    const store = getStore();
    if (!store || active) return;
    active = true;
    store.subscribers += 1;
    if (store.initialized) return;

    store.initialized = true;

    if (diagnostics.console) {
      for (const level of allConsoleLevels) {
        if (!consoleLevels.has(level)) continue;
        const original = window.console[level];
        if (typeof original !== "function") continue;
        const patched = (...args: unknown[]): void => {
          try {
            pushRing(
              store.consoleEntries,
              {
                timestamp: new Date().toISOString(),
                level,
                args: args.map((value) =>
                  safeSerialize(value, { kind: "console" }),
                ),
              },
              maxConsoleEntries,
            );
          } catch {
            // Capture must never break the host console.
          }
          original.apply(window.console, args);
        };
        window.console[level] = patched;
        store.cleanup.push(() => {
          if (window.console[level] === patched)
            window.console[level] = original;
        });
      }
    }

    if (diagnostics.errors) {
      const onError = (event: ErrorEvent): void => {
        const entry: ErrorEntry = {
          timestamp: new Date().toISOString(),
          type: "error",
          message: redact(event.message, { kind: "error" }),
          lineno: event.lineno,
          colno: event.colno,
        };
        if (event.filename) entry.source = sanitizeUrl(event.filename);
        if (event.error?.stack) {
          entry.stack = redact(String(event.error.stack), { kind: "error" });
        }
        pushRing(store.errorEntries, entry, maxErrorEntries);
      };
      const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
        pushRing(
          store.errorEntries,
          {
            timestamp: new Date().toISOString(),
            type: "unhandledrejection",
            reason: safeSerialize(event.reason, { kind: "error" }),
          },
          maxErrorEntries,
        );
      };
      window.addEventListener("error", onError);
      window.addEventListener("unhandledrejection", onUnhandledRejection);
      store.cleanup.push(() => window.removeEventListener("error", onError));
      store.cleanup.push(() =>
        window.removeEventListener("unhandledrejection", onUnhandledRejection),
      );
    }

    if (diagnostics.network) {
      const recordPatchedNetworkFailure = (
        method: string,
        url: string,
        status: number,
        startedAt: number,
        transport: "fetch" | "xhr",
      ): void => {
        const now = window.performance?.now?.() ?? Date.now();
        appendNetworkFailure(
          store,
          { method, url, status, durationMs: now - startedAt },
          transport,
        );
      };

      const originalFetch = window.fetch;
      if (typeof originalFetch === "function") {
        const patchedFetch: typeof window.fetch = async (
          input,
          initOptions,
        ) => {
          const startedAt = window.performance?.now?.() ?? Date.now();
          const request =
            typeof Request !== "undefined" && input instanceof Request
              ? input
              : null;
          const url = request?.url ?? String(input);
          const method = initOptions?.method ?? request?.method ?? "GET";
          try {
            const response = await originalFetch.call(
              window,
              input,
              initOptions,
            );
            if (!response.ok) {
              recordPatchedNetworkFailure(
                method,
                url,
                response.status,
                startedAt,
                "fetch",
              );
            }
            return response;
          } catch (error) {
            recordPatchedNetworkFailure(method, url, 0, startedAt, "fetch");
            throw error;
          }
        };
        window.fetch = patchedFetch;
        store.cleanup.push(() => {
          if (window.fetch === patchedFetch) window.fetch = originalFetch;
        });
      }

      const xhrPrototype = window.XMLHttpRequest?.prototype;
      if (xhrPrototype) {
        const originalOpen = xhrPrototype.open;
        const originalSend = xhrPrototype.send;
        const requestMetadata = new WeakMap<
          XMLHttpRequest,
          { method: string; url: string }
        >();
        const patchedOpen = function (
          this: XMLHttpRequest,
          method: string,
          url: string | URL,
          async = true,
          username?: string | null,
          password?: string | null,
        ): void {
          requestMetadata.set(this, { method, url: String(url) });
          Reflect.apply(originalOpen, this, [
            method,
            String(url),
            Boolean(async),
            username ?? null,
            password ?? null,
          ]);
        } as typeof XMLHttpRequest.prototype.open;
        const patchedSend = function (
          this: XMLHttpRequest,
          body?: Document | XMLHttpRequestBodyInit | null,
        ): void {
          const startedAt = window.performance?.now?.() ?? Date.now();
          const metadata = requestMetadata.get(this) ?? {
            method: "GET",
            url: "",
          };
          this.addEventListener(
            "loadend",
            () => {
              if (this.status === 0 || this.status >= 400) {
                recordPatchedNetworkFailure(
                  metadata.method,
                  metadata.url,
                  this.status,
                  startedAt,
                  "xhr",
                );
              }
            },
            { once: true },
          );
          originalSend.call(this, body);
        } as typeof XMLHttpRequest.prototype.send;
        xhrPrototype.open = patchedOpen;
        xhrPrototype.send = patchedSend;
        store.cleanup.push(() => {
          if (xhrPrototype.open === patchedOpen)
            xhrPrototype.open = originalOpen;
          if (xhrPrototype.send === patchedSend)
            xhrPrototype.send = originalSend;
        });
      }
    }

    if (diagnostics.breadcrumbs) {
      const describeNode = (node: Element): string => {
        const label =
          node.getAttribute("aria-label") ??
          node.getAttribute("title") ??
          node.textContent?.trim().replace(/\s+/g, " ") ??
          node.getAttribute("href") ??
          `<${node.tagName.toLowerCase()}>`;
        return redact(label, { kind: "breadcrumb" }).slice(0, 160);
      };

      const onClick = (event: MouseEvent): void => {
        const eventTarget = event.target;
        if (!(eventTarget instanceof Element)) return;
        if (
          eventTarget.closest(".ventus-feedback-ignore,[data-feedback-ignore]")
        )
          return;
        const target = eventTarget.closest("button,a,[role='button']");
        if (!target) return;
        recordBreadcrumb(store, {
          type: "click",
          target: describeNode(target),
          tag: target.tagName.toLowerCase(),
        });
      };

      const onSubmit = (event: SubmitEvent): void => {
        const target = event.target;
        if (!(target instanceof HTMLFormElement)) return;
        if (target.closest(".ventus-feedback-ignore,[data-feedback-ignore]"))
          return;
        recordBreadcrumb(store, {
          type: "submit",
          target: redact(target.id || target.name || "<form>", {
            kind: "breadcrumb",
          }).slice(0, 160),
        });
      };

      document.addEventListener("click", onClick, true);
      document.addEventListener("submit", onSubmit, true);
      store.cleanup.push(() =>
        document.removeEventListener("click", onClick, true),
      );
      store.cleanup.push(() =>
        document.removeEventListener("submit", onSubmit, true),
      );

      const patchHistory = (method: "pushState" | "replaceState"): void => {
        const original = window.history[method];
        const patched: History[typeof method] = function (
          this: History,
          data: unknown,
          unused: string,
          url?: string | URL | null,
        ): void {
          original.call(this, data, unused, url);
          recordBreadcrumb(store, {
            type: "navigation",
            target: null,
            destination: sanitizeUrl(url ? String(url) : window.location.href),
          });
        };
        window.history[method] = patched;
        store.cleanup.push(() => {
          if (window.history[method] === patched)
            window.history[method] = original;
        });
      };
      patchHistory("pushState");
      patchHistory("replaceState");

      const onPopState = (): void => {
        recordBreadcrumb(store, {
          type: "navigation",
          target: null,
          destination: sanitizeUrl(window.location.href),
        });
      };
      window.addEventListener("popstate", onPopState);
      store.cleanup.push(() =>
        window.removeEventListener("popstate", onPopState),
      );
    }
  };

  const destroy = (): void => {
    const store = getStore();
    if (!store || !active) return;
    active = false;
    store.subscribers = Math.max(0, store.subscribers - 1);
    if (store.subscribers > 0) return;

    for (const cleanup of [...store.cleanup].reverse()) {
      try {
        cleanup();
      } catch {
        // Teardown is best-effort and must not break the host application.
      }
    }
    store.cleanup = [];
    store.initialized = false;
  };

  const clear = (): void => {
    const store = getStore();
    if (!store) return;
    store.consoleEntries.length = 0;
    store.errorEntries.length = 0;
    store.networkEntries.length = 0;
    store.breadcrumbs.length = 0;
  };

  const isInitialized = (): boolean =>
    Boolean(active && getStore()?.initialized);

  const getBrowserInfo = (): BrowserSnapshot | null => {
    if (typeof window === "undefined" || !diagnostics.browser) return null;
    return {
      userAgent: redact(window.navigator.userAgent, { kind: "context" }),
      language: window.navigator.language,
      onLine: window.navigator.onLine,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      },
      screen: window.screen
        ? {
            width: window.screen.width,
            height: window.screen.height,
            colorDepth: window.screen.colorDepth,
          }
        : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      url: sanitizeUrl(window.location.href),
      referrer: document.referrer ? sanitizeUrl(document.referrer) : "",
      title: redact(document.title, { kind: "context" }),
    };
  };

  const getPerformanceSnapshot = (): PerformanceSnapshot | null => {
    if (
      typeof window === "undefined" ||
      !diagnostics.performance ||
      !window.performance
    ) {
      return null;
    }
    const navigation = window.performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const paints = window.performance.getEntriesByType("paint").slice(0, 10);
    const rounded = (value: number): number => Math.round(value * 100) / 100;
    return {
      timeOrigin: Math.round(window.performance.timeOrigin),
      now: rounded(window.performance.now()),
      navigation: navigation
        ? {
            type: navigation.type,
            startTime: rounded(navigation.startTime),
            duration: rounded(navigation.duration),
            domContentLoadedEventEnd: rounded(
              navigation.domContentLoadedEventEnd,
            ),
            loadEventEnd: rounded(navigation.loadEventEnd),
            responseStart: rounded(navigation.responseStart),
            responseEnd: rounded(navigation.responseEnd),
          }
        : null,
      paint: paints.map((entry) => ({
        name: entry.name,
        startTime: rounded(entry.startTime),
        duration: rounded(entry.duration),
      })),
    };
  };

  const getPayload = (
    input: FeedbackCapturePayloadInput<TContext> = {},
  ): FeedbackCapturePayload<TContext> => {
    const store = getStore();
    const rawContext = input.context ?? options.getContext?.();
    const applicationContext =
      rawContext === undefined ? null : sanitizeContext(rawContext);
    return {
      schemaVersion: "1.0",
      sourceApp: input.sourceApp?.trim() || null,
      title: redact(input.title ?? "", { kind: "context" }),
      description: redact(input.description ?? "", { kind: "context" }),
      category: input.category ?? null,
      release: input.release?.trim() || null,
      environment: input.environment?.trim() || null,
      url:
        typeof window === "undefined"
          ? null
          : sanitizeUrl(window.location.href),
      capturedAt: new Date().toISOString(),
      browser: getBrowserInfo(),
      performance: getPerformanceSnapshot(),
      consoleLogs: cloneConsoleEntries(store?.consoleEntries ?? []),
      errors: cloneEntries(store?.errorEntries ?? []),
      networkErrors: cloneEntries(store?.networkEntries ?? []),
      breadcrumbs: cloneEntries(store?.breadcrumbs ?? []),
      context:
        applicationContext === null
          ? null
          : { application: applicationContext },
    };
  };

  const maskScreenshotElements = (documentClone: Document): void => {
    for (const selector of screenshot.maskSelectors) {
      try {
        for (const element of documentClone.querySelectorAll(selector)) {
          const tagName = element.tagName.toLowerCase();
          if (tagName === "input") {
            const input = element as HTMLInputElement;
            input.value = "[REDACTED]";
            input.setAttribute("value", "[REDACTED]");
          } else if (tagName === "textarea") {
            const textArea = element as HTMLTextAreaElement;
            textArea.value = "[REDACTED]";
            textArea.textContent = "[REDACTED]";
          } else {
            const htmlElement = element as HTMLElement;
            htmlElement.textContent = "[REDACTED]";
            htmlElement.style.background = "#202624";
            htmlElement.style.color = "#ffffff";
          }
        }
      } catch {
        // Ignore invalid host-provided selectors and continue masking others.
      }
    }
    screenshot.onClone(documentClone);
  };

  const assertScreenshotSize = (blob: Blob): Blob => {
    if (blob.size > screenshot.maxBytes) {
      throw new Error(
        `Screenshot exceeds the configured ${screenshot.maxBytes}-byte limit`,
      );
    }
    return blob;
  };

  const captureViewportScreenshotBlob = async (): Promise<Blob | null> => {
    if (typeof window === "undefined") return null;
    if (!options.loadHtml2Canvas) {
      throw new Error("html2canvas loader is not configured");
    }

    const loaded = await options.loadHtml2Canvas();
    const moduleWithDefault = loaded as { default?: unknown };
    const html2canvas = (moduleWithDefault?.default ?? loaded) as Html2Canvas;
    if (typeof html2canvas !== "function") {
      throw new Error("html2canvas loader did not return a function");
    }

    const target = document.body || document.documentElement;
    if (!target) return null;
    const sharedOptions: Html2CanvasOptions = {
      useCORS: true,
      backgroundColor: screenshot.backgroundColor,
      logging: false,
      ignoreElements: (element) =>
        element.matches(".ventus-feedback-ignore,[data-feedback-ignore]") ||
        Boolean(
          element.closest(".ventus-feedback-ignore,[data-feedback-ignore]"),
        ),
      onclone: maskScreenshotElements,
      scale: Math.min(
        1,
        screenshot.maxWidth /
          (screenshot.region === "viewport"
            ? Math.max(1, window.innerWidth)
            : Math.max(1, document.documentElement.scrollWidth)),
        screenshot.maxHeight /
          (screenshot.region === "viewport"
            ? Math.max(1, window.innerHeight)
            : Math.max(1, document.documentElement.scrollHeight)),
      ),
    };
    const regionOptions: Partial<Html2CanvasOptions> =
      screenshot.region === "viewport"
        ? {
            x: window.scrollX,
            y: window.scrollY,
            width: window.innerWidth,
            height: window.innerHeight,
            windowWidth: document.documentElement.scrollWidth,
            windowHeight: document.documentElement.scrollHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
          }
        : {};

    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(target, {
        ...sharedOptions,
        ...regionOptions,
        foreignObjectRendering: true,
      });
    } catch {
      canvas = await html2canvas(target, {
        ...sharedOptions,
        ...regionOptions,
        foreignObjectRendering: false,
      });
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            try {
              resolve(assertScreenshotSize(blob));
            } catch (error) {
              reject(error);
            }
          } else
            reject(new Error("Screenshot capture returned an empty image"));
        },
        screenshot.imageType,
        screenshot.imageQuality,
      );
    });
  };

  const captureDisplayMediaScreenshotBlob = async (): Promise<Blob | null> => {
    if (typeof window === "undefined") return null;
    const userActivation = (
      window.navigator as Navigator & {
        userActivation?: { isActive: boolean };
      }
    ).userActivation;
    if (userActivation && !userActivation.isActive) {
      throw new Error("Display capture must start from a user gesture");
    }
    if (!window.navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Display capture is not supported by this browser");
    }

    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;
    try {
      const displayOptions = {
        video: { frameRate: { ideal: 5, max: 10 } },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
      } as DisplayMediaStreamOptions;
      stream =
        await window.navigator.mediaDevices.getDisplayMedia(displayOptions);
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Display capture timed out")),
          screenshot.captureTimeoutMs,
        );
        video!.onloadedmetadata = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        video!.onerror = () => {
          window.clearTimeout(timeout);
          reject(
            new Error("Display capture could not load the selected stream"),
          );
        };
      });

      await video.play().catch(() => undefined);
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      const sourceWidth = video.videoWidth || window.innerWidth || 1;
      const sourceHeight = video.videoHeight || window.innerHeight || 1;
      const scale = Math.min(
        1,
        screenshot.maxWidth / sourceWidth,
        screenshot.maxHeight / sourceHeight,
      );
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context)
        throw new Error("Display capture could not create a canvas");
      context.drawImage(video, 0, 0, width, height);

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              try {
                resolve(assertScreenshotSize(blob));
              } catch (error) {
                reject(error);
              }
            } else reject(new Error("Display capture returned an empty image"));
          },
          screenshot.imageType,
          screenshot.imageQuality,
        );
      });
    } catch (error) {
      if (isError(error) && error.name === "NotAllowedError") {
        throw new Error("Display capture was cancelled or denied");
      }
      throw new Error(getErrorMessage(error));
    } finally {
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      stream?.getTracks().forEach((track) => track.stop());
    }
  };

  return {
    init,
    destroy,
    clear,
    isInitialized,
    recordNetworkFailure,
    getPayload,
    captureViewportScreenshotBlob,
    captureDisplayMediaScreenshotBlob,
  };
};

export const createFeedbackCaptureApi = createFeedbackCaptureCore;
