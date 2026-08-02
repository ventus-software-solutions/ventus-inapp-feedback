import {
  validateFeedbackCapturePayload,
  type FeedbackTransport,
} from "@ventus/feedback-browser";

export type MockSubmission = {
  id: string;
  createdAt: string;
  status: "received";
};

export const mockFeedbackTransport: FeedbackTransport<unknown, MockSubmission> =
  {
    async submit(submission, options) {
      options?.onProgress?.({ phase: "preparing", loaded: 0, total: 1 });
      await new Promise<void>((resolve, reject) => {
        if (options?.signal?.aborted) {
          reject(new DOMException("Submission cancelled", "AbortError"));
          return;
        }
        const handleAbort = () => {
          window.clearTimeout(timeout);
          reject(new DOMException("Submission cancelled", "AbortError"));
        };
        const timeout = window.setTimeout(() => {
          options?.signal?.removeEventListener("abort", handleAbort);
          resolve();
        }, 450);
        options?.signal?.addEventListener("abort", handleAbort, { once: true });
      });

      if (!validateFeedbackCapturePayload(submission.payload).success) {
        throw new Error("The mock transport rejected an invalid payload.");
      }

      options?.onProgress?.({ phase: "complete", loaded: 1, total: 1 });
      return {
        id: `demo_${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        status: "received",
      };
    },
  };
