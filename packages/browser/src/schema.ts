import type {
  FeedbackCapturePayload,
  FeedbackValidationIssue,
  FeedbackValidationResult,
} from "./types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isIsoTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  /^\d{4}-\d{2}-\d{2}T/.test(value);

const add = (
  issues: FeedbackValidationIssue[],
  path: string,
  condition: boolean,
  message: string,
): void => {
  if (!condition) issues.push({ path, message });
};

const validateTimestampedEntries = (
  value: unknown,
  path: string,
  issues: FeedbackValidationIssue[],
  validate: (
    item: Record<string, unknown>,
    itemPath: string,
    issues: FeedbackValidationIssue[],
  ) => void,
): void => {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "must be an array" });
    return;
  }

  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: "must be an object" });
      return;
    }
    add(
      issues,
      `${itemPath}.timestamp`,
      isIsoTimestamp(item.timestamp),
      "must be an ISO timestamp",
    );
    validate(item, itemPath, issues);
  });
};

const validateBrowser = (
  value: unknown,
  issues: FeedbackValidationIssue[],
): void => {
  if (value === null) return;
  if (!isRecord(value)) {
    issues.push({ path: "browser", message: "must be an object or null" });
    return;
  }

  for (const field of [
    "userAgent",
    "language",
    "timezone",
    "url",
    "referrer",
    "title",
  ] as const) {
    add(
      issues,
      `browser.${field}`,
      typeof value[field] === "string",
      "must be a string",
    );
  }
  add(
    issues,
    "browser.onLine",
    typeof value.onLine === "boolean",
    "must be a boolean",
  );

  if (!isRecord(value.viewport)) {
    issues.push({ path: "browser.viewport", message: "must be an object" });
  } else {
    for (const field of [
      "width",
      "height",
      "devicePixelRatio",
      "scrollX",
      "scrollY",
    ] as const) {
      add(
        issues,
        `browser.viewport.${field}`,
        isFiniteNumber(value.viewport[field]),
        "must be a finite number",
      );
    }
  }

  if (value.screen !== null && !isRecord(value.screen)) {
    issues.push({
      path: "browser.screen",
      message: "must be an object or null",
    });
  } else if (isRecord(value.screen)) {
    for (const field of ["width", "height", "colorDepth"] as const) {
      add(
        issues,
        `browser.screen.${field}`,
        isFiniteNumber(value.screen[field]),
        "must be a finite number",
      );
    }
  }
};

const validatePerformance = (
  value: unknown,
  issues: FeedbackValidationIssue[],
): void => {
  if (value === null) return;
  if (!isRecord(value)) {
    issues.push({ path: "performance", message: "must be an object or null" });
    return;
  }

  add(
    issues,
    "performance.timeOrigin",
    isFiniteNumber(value.timeOrigin),
    "must be a finite number",
  );
  add(
    issues,
    "performance.now",
    isFiniteNumber(value.now),
    "must be a finite number",
  );
  if (value.navigation !== null && !isRecord(value.navigation)) {
    issues.push({
      path: "performance.navigation",
      message: "must be an object or null",
    });
  } else if (isRecord(value.navigation)) {
    add(
      issues,
      "performance.navigation.type",
      typeof value.navigation.type === "string",
      "must be a string",
    );
    for (const field of [
      "startTime",
      "duration",
      "domContentLoadedEventEnd",
      "loadEventEnd",
      "responseStart",
      "responseEnd",
    ] as const) {
      add(
        issues,
        `performance.navigation.${field}`,
        isFiniteNumber(value.navigation[field]),
        "must be a finite number",
      );
    }
  }

  if (!Array.isArray(value.paint)) {
    issues.push({ path: "performance.paint", message: "must be an array" });
  } else {
    value.paint.forEach((entry, index) => {
      const path = `performance.paint[${index}]`;
      if (!isRecord(entry)) {
        issues.push({ path, message: "must be an object" });
        return;
      }
      add(
        issues,
        `${path}.name`,
        typeof entry.name === "string",
        "must be a string",
      );
      add(
        issues,
        `${path}.startTime`,
        isFiniteNumber(entry.startTime),
        "must be a finite number",
      );
      add(
        issues,
        `${path}.duration`,
        isFiniteNumber(entry.duration),
        "must be a finite number",
      );
    });
  }
};

const isJsonSafe = (value: unknown, seen = new WeakSet<object>()): boolean => {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  try {
    return Array.isArray(value)
      ? value.every((item) => isJsonSafe(item, seen))
      : Object.values(value as Record<string, unknown>).every((item) =>
          isJsonSafe(item, seen),
        );
  } catch {
    return false;
  } finally {
    seen.delete(value);
  }
};

export const validateFeedbackCapturePayload = (
  value: unknown,
): FeedbackValidationResult => {
  const issues: FeedbackValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      success: false,
      issues: [{ path: "$", message: "must be an object" }],
    };
  }

  add(
    issues,
    "schemaVersion",
    value.schemaVersion === "1.0",
    'must equal "1.0"',
  );
  add(
    issues,
    "sourceApp",
    isNullableString(value.sourceApp),
    "must be a string or null",
  );
  add(issues, "title", typeof value.title === "string", "must be a string");
  add(
    issues,
    "description",
    typeof value.description === "string",
    "must be a string",
  );
  add(
    issues,
    "category",
    value.category === null ||
      ["bug", "feedback", "idea"].includes(String(value.category)),
    "must be bug, feedback, idea, or null",
  );
  add(
    issues,
    "release",
    isNullableString(value.release),
    "must be a string or null",
  );
  add(
    issues,
    "environment",
    isNullableString(value.environment),
    "must be a string or null",
  );
  add(issues, "url", isNullableString(value.url), "must be a string or null");
  add(
    issues,
    "capturedAt",
    isIsoTimestamp(value.capturedAt),
    "must be an ISO timestamp",
  );
  validateBrowser(value.browser, issues);
  validatePerformance(value.performance, issues);

  validateTimestampedEntries(
    value.consoleLogs,
    "consoleLogs",
    issues,
    (item, path, target) => {
      add(
        target,
        `${path}.level`,
        ["log", "info", "warn", "error", "debug"].includes(String(item.level)),
        "must be a supported console level",
      );
      add(
        target,
        `${path}.args`,
        Array.isArray(item.args) &&
          item.args.every((arg) => typeof arg === "string"),
        "must be an array of strings",
      );
    },
  );
  validateTimestampedEntries(
    value.errors,
    "errors",
    issues,
    (item, path, target) => {
      add(
        target,
        `${path}.type`,
        item.type === "error" || item.type === "unhandledrejection",
        "must be a supported error type",
      );
      for (const field of ["message", "source", "stack", "reason"] as const) {
        add(
          target,
          `${path}.${field}`,
          item[field] === undefined || typeof item[field] === "string",
          "must be a string when present",
        );
      }
      for (const field of ["lineno", "colno"] as const) {
        add(
          target,
          `${path}.${field}`,
          item[field] === undefined || isFiniteNumber(item[field]),
          "must be a finite number when present",
        );
      }
    },
  );
  validateTimestampedEntries(
    value.networkErrors,
    "networkErrors",
    issues,
    (item, path, target) => {
      add(
        target,
        `${path}.method`,
        typeof item.method === "string",
        "must be a string",
      );
      add(
        target,
        `${path}.url`,
        typeof item.url === "string",
        "must be a string",
      );
      add(
        target,
        `${path}.status`,
        isFiniteNumber(item.status),
        "must be a finite number",
      );
      add(
        target,
        `${path}.durationMs`,
        isFiniteNumber(item.durationMs),
        "must be a finite number",
      );
      add(
        target,
        `${path}.transport`,
        item.transport === "fetch" ||
          item.transport === "xhr" ||
          item.transport === "manual",
        "must be fetch, xhr, or manual",
      );
    },
  );
  validateTimestampedEntries(
    value.breadcrumbs,
    "breadcrumbs",
    issues,
    (item, path, target) => {
      add(
        target,
        `${path}.type`,
        ["click", "submit", "navigation"].includes(String(item.type)),
        "must be a supported breadcrumb type",
      );
      add(
        target,
        `${path}.url`,
        typeof item.url === "string",
        "must be a string",
      );
      add(
        target,
        `${path}.target`,
        isNullableString(item.target),
        "must be a string or null",
      );
      for (const field of ["tag", "destination"] as const) {
        add(
          target,
          `${path}.${field}`,
          item[field] === undefined || typeof item[field] === "string",
          "must be a string when present",
        );
      }
    },
  );

  add(
    issues,
    "context",
    isJsonSafe(value.context),
    "must contain only JSON-safe values",
  );

  return issues.length > 0
    ? { success: false, issues }
    : { success: true, data: value as FeedbackCapturePayload<unknown> };
};

export const parseFeedbackCapturePayload = (
  value: unknown,
): FeedbackCapturePayload<unknown> => {
  const result = validateFeedbackCapturePayload(value);
  if (result.success) return result.data;
  const summary = result.issues
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("; ");
  throw new TypeError(`Invalid feedback capture payload: ${summary}`);
};
