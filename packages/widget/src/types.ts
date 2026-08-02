import type {
  FeedbackCaptureCore,
  FeedbackCaptureCoreOptions,
  FeedbackCapturePayload,
  FeedbackReceipt,
  FeedbackSubmission,
  FeedbackTransport,
} from "@ventus-software-solutions/feedback-browser";

export type VentusFeedbackWidgetTheme = "light" | "dark" | "auto";
export type VentusFeedbackCaptureMode = "viewport" | "display" | "none";

export type VentusFeedbackOpenDetail = { source: "trigger" | "programmatic" };
export type VentusFeedbackCloseDetail = {
  reason: "cancel" | "success" | "programmatic";
};
export type VentusFeedbackSubmitDetail<TContext = unknown> = {
  submission: FeedbackSubmission<TContext>;
};
export type VentusFeedbackSuccessDetail<TReceipt = FeedbackReceipt> = {
  receipt: TReceipt;
};
export type VentusFeedbackErrorDetail = { error: unknown };

export type VentusFeedbackWidgetConfiguration<TContext = unknown> = {
  transport?: FeedbackTransport<TContext>;
  capture?: FeedbackCaptureCore<TContext>;
  captureOptions?: FeedbackCaptureCoreOptions<TContext>;
  context?: TContext | (() => TContext | undefined);
};

export type VentusFeedbackPayloadPreview<TContext = unknown> =
  FeedbackCapturePayload<TContext>;

declare global {
  interface HTMLElementTagNameMap {
    "ventus-feedback": import("./VentusFeedbackWidget.js").VentusFeedbackWidget;
  }

  interface HTMLElementEventMap {
    "ventus-feedback-open": CustomEvent<VentusFeedbackOpenDetail>;
    "ventus-feedback-close": CustomEvent<VentusFeedbackCloseDetail>;
    "ventus-feedback-submit": CustomEvent<VentusFeedbackSubmitDetail>;
    "ventus-feedback-success": CustomEvent<VentusFeedbackSuccessDetail>;
    "ventus-feedback-error": CustomEvent<VentusFeedbackErrorDetail>;
  }
}
