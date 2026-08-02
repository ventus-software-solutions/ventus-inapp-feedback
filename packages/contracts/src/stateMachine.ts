import type {
  FeedbackResolutionReason,
  FeedbackScope,
  FeedbackStatus,
} from "./domain.js";

export type FeedbackTransitionAction =
  | "triage"
  | "start"
  | "resolve"
  | "close"
  | "reject"
  | "reopen";

export type FeedbackTransitionInput = {
  from: FeedbackStatus;
  action: FeedbackTransitionAction;
  scopes: readonly FeedbackScope[];
  note?: string;
  resolutionReason?: FeedbackResolutionReason;
  resolutionSummary?: string;
  duplicateOfId?: string;
};

export type FeedbackTransitionResult =
  | { allowed: true; to: FeedbackStatus }
  | {
      allowed: false;
      code: "invalid_transition" | "missing_scope" | "missing_field";
      message: string;
    };

const transitions: Record<
  FeedbackStatus,
  Partial<Record<FeedbackTransitionAction, FeedbackStatus>>
> = {
  new: { triage: "triaged", start: "in_progress", reject: "rejected" },
  triaged: { start: "in_progress", reject: "rejected" },
  in_progress: { resolve: "resolved", reject: "rejected" },
  resolved: { close: "closed", reopen: "reopened" },
  closed: { reopen: "reopened" },
  rejected: { reopen: "reopened" },
  reopened: {
    triage: "triaged",
    start: "in_progress",
    resolve: "resolved",
    reject: "rejected",
  },
};

const requiredScope: Record<FeedbackTransitionAction, FeedbackScope> = {
  triage: "feedback:triage",
  start: "feedback:triage",
  resolve: "feedback:resolve",
  close: "feedback:close",
  reject: "feedback:triage",
  reopen: "feedback:triage",
};

export const evaluateFeedbackTransition = (
  input: FeedbackTransitionInput,
): FeedbackTransitionResult => {
  const to = transitions[input.from][input.action];
  if (!to) {
    return {
      allowed: false,
      code: "invalid_transition",
      message: `Cannot ${input.action} feedback in status ${input.from}.`,
    };
  }
  const scope = requiredScope[input.action];
  if (
    !input.scopes.includes(scope) &&
    !input.scopes.includes("feedback:admin")
  ) {
    return {
      allowed: false,
      code: "missing_scope",
      message: `The ${scope} scope is required.`,
    };
  }
  if (input.action === "resolve") {
    if (!input.resolutionReason || !input.resolutionSummary?.trim()) {
      return {
        allowed: false,
        code: "missing_field",
        message: "Resolution reason and summary are required.",
      };
    }
    if (
      input.resolutionReason === "duplicate" &&
      !input.duplicateOfId?.trim()
    ) {
      return {
        allowed: false,
        code: "missing_field",
        message: "duplicateOfId is required for duplicate resolutions.",
      };
    }
  }
  if (
    ["close", "reject", "reopen"].includes(input.action) &&
    !input.note?.trim()
  ) {
    return {
      allowed: false,
      code: "missing_field",
      message: `${input.action} requires a note.`,
    };
  }
  return { allowed: true, to };
};

export const allowedFeedbackActions = (
  status: FeedbackStatus,
  scopes: readonly FeedbackScope[],
): FeedbackTransitionAction[] =>
  (Object.keys(transitions[status]) as FeedbackTransitionAction[]).filter(
    (action) =>
      scopes.includes(requiredScope[action]) ||
      scopes.includes("feedback:admin"),
  );
