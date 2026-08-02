import type { CreateFeedbackRequest, UpdateFeedbackRequest } from "./api.js";

export type ContractValidationIssue = { path: string; message: string };
export type ContractValidationResult<T> =
  | { success: true; data: T }
  | { success: false; issues: ContractValidationIssue[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const boundedText = (
  value: unknown,
  path: string,
  maximum: number,
  issues: ContractValidationIssue[],
  required = true,
): void => {
  if (value === undefined && !required) return;
  if (
    typeof value !== "string" ||
    (required && !value.trim()) ||
    value.length > maximum
  ) {
    issues.push({
      path,
      message: `must be ${required ? "a non-empty" : "a"} string of at most ${maximum} characters`,
    });
  }
};

export const validateCreateFeedbackRequest = (
  value: unknown,
): ContractValidationResult<CreateFeedbackRequest> => {
  if (!isRecord(value)) {
    return {
      success: false,
      issues: [{ path: "$", message: "must be an object" }],
    };
  }
  const issues: ContractValidationIssue[] = [];
  if (value.schemaVersion !== "1.0")
    issues.push({ path: "schemaVersion", message: 'must equal "1.0"' });
  boundedText(value.projectId, "projectId", 128, issues);
  if (!["bug", "feedback", "idea"].includes(String(value.category))) {
    issues.push({
      path: "category",
      message: "must be bug, feedback, or idea",
    });
  }
  boundedText(value.title, "title", 140, issues);
  boundedText(value.description, "description", 5_000, issues);
  boundedText(value.sourceApp, "sourceApp", 128, issues, false);
  boundedText(value.release, "release", 128, issues, false);
  boundedText(value.environment, "environment", 128, issues, false);
  boundedText(value.url, "url", 2_048, issues, false);
  if (
    value.reporterTokenRequested !== undefined &&
    typeof value.reporterTokenRequested !== "boolean"
  ) {
    issues.push({
      path: "reporterTokenRequested",
      message: "must be a boolean",
    });
  }
  return issues.length
    ? { success: false, issues }
    : { success: true, data: value as CreateFeedbackRequest };
};

export const normalizeLabels = (labels: readonly string[]): string[] =>
  [
    ...new Set(
      labels.map((label) => label.trim().toLowerCase()).filter(Boolean),
    ),
  ]
    .slice(0, 25)
    .map((label) => label.slice(0, 64));

export const validateUpdateFeedbackRequest = (
  value: unknown,
): ContractValidationResult<UpdateFeedbackRequest> => {
  if (!isRecord(value))
    return {
      success: false,
      issues: [{ path: "$", message: "must be an object" }],
    };
  const issues: ContractValidationIssue[] = [];
  if (!Number.isInteger(value.version) || Number(value.version) < 1) {
    issues.push({ path: "version", message: "must be a positive integer" });
  }
  if (
    value.labels !== undefined &&
    (!Array.isArray(value.labels) ||
      !value.labels.every((label) => typeof label === "string"))
  ) {
    issues.push({ path: "labels", message: "must be an array of strings" });
  }
  if (
    value.priority !== undefined &&
    !["unset", "low", "medium", "high", "urgent"].includes(
      String(value.priority),
    )
  ) {
    issues.push({ path: "priority", message: "must be a supported priority" });
  }
  if (
    value.category !== undefined &&
    !["bug", "feedback", "idea"].includes(String(value.category))
  ) {
    issues.push({ path: "category", message: "must be a supported category" });
  }
  boundedText(value.title, "title", 140, issues, false);
  return issues.length
    ? { success: false, issues }
    : { success: true, data: value as UpdateFeedbackRequest };
};
