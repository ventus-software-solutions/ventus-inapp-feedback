import {
  createFeedbackCaptureCore,
  createFeedbackSubmission,
  createHttpFeedbackTransport,
  type FeedbackCaptureCore,
  type FeedbackCaptureCoreOptions,
  type FeedbackCapturePayloadInput,
  type FeedbackTransport,
} from "../dist/index.js";

const options: FeedbackCaptureCoreOptions = {
  storeKey: "__ventusDemoCapture",
  maxConsoleEntries: 25,
  maxErrorEntries: 10,
  loadHtml2Canvas: async () => null,
};

const contextualOptions: FeedbackCaptureCoreOptions<{ route: string }> = {
  getContext: () => ({ route: "checkout" }),
};

const input: FeedbackCapturePayloadInput = {
  sourceApp: "demo",
  title: "Synthetic feedback",
  description: "Consumer-facing declarations compile.",
};

const capture: FeedbackCaptureCore = createFeedbackCaptureCore(options);
capture.init();
const payload = capture.getPayload(input);
payload.schemaVersion satisfies "1.0";
payload.networkErrors.length satisfies number;
payload.breadcrumbs.length satisfies number;
createFeedbackCaptureCore(contextualOptions).getPayload().context?.application
  .route satisfies string | undefined;
capture.isInitialized() satisfies boolean;
capture.recordNetworkFailure({
  method: "GET",
  url: "/synthetic-failure",
  status: 503,
});
capture.clear();
capture.destroy();

void capture.captureViewportScreenshotBlob();
void capture.captureDisplayMediaScreenshotBlob();

const submission = createFeedbackSubmission({
  payload,
  idempotencyKey: "type-test",
});
const transport: FeedbackTransport = createHttpFeedbackTransport({
  endpoint: "https://feedback.example/v1/feedback",
});
void transport.submit(submission);
