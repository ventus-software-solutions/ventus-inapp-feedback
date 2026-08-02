# @ventus/feedback-browser

Framework-neutral, SSR-safe browser diagnostics for Ventus In-App Feedback.

This package is under active development. Its public API is not stable before `1.0.0`.

## Privacy-first defaults

Only browser errors and unhandled rejections are enabled by default. Console entries, failed requests, breadcrumbs, browser metadata, and performance data require an explicit opt-in.

Captured text is redacted for common sensitive keys, bearer tokens, JWT-like values, email addresses, and card-like numbers. URL fragments and non-allowed query parameters are removed. Applications must still review their own data flows and configure additional rules where necessary.

## Usage

```ts
import { createFeedbackCaptureCore } from "@ventus/feedback-browser";

const capture = createFeedbackCaptureCore({
  diagnostics: {
    console: true,
    errors: true,
    network: true,
    breadcrumbs: true,
  },
  consoleLevels: ["warn", "error"],
  redaction: {
    allowedQueryParameters: ["page"],
    sensitiveKeys: ["customerReference"],
  },
});

capture.init();

const payload = capture.getPayload({
  sourceApp: "shop",
  release: "2026.08.02",
  environment: "production",
  description: "Checkout did not continue.",
  context: { cartId: "synthetic-cart" }, // stored under context.application
});

capture.clear(); // clear buffered diagnostics
capture.destroy(); // restore patched host functions and listeners
```

Hosts that already have a request interceptor can report a failure without an
additional request patch:

```ts
capture.recordNetworkFailure({
  method: "POST",
  url: "/api/checkout?token=private",
  status: 503,
  durationMs: 240,
});
```

Multiple consumers using the same `storeKey` share one instrumentation layer. Host functions are restored after the final consumer calls `destroy()`. The first active initializer for a key controls capture and redaction settings until that final teardown; use the same configuration for every consumer sharing a key, or assign separate keys when their policies differ.

The package is headless: call it from your own UI or from the Ventus widget once
that package is available. If your product requires consent, do not call `init()`
until consent is active, show the optional diagnostic groups before submission,
and call `destroy()` when consent is withdrawn. A custom transport is any object
that implements the exported `FeedbackTransport` interface.

## Screenshots

DOM screenshot capture uses a consumer-provided loader so the host controls the rendering dependency:

```ts
const capture = createFeedbackCaptureCore({
  loadHtml2Canvas: () => import("html2canvas-pro"),
  screenshot: {
    region: "viewport",
    maskSelectors: ["input[type='password']", "[data-feedback-mask]"],
    maxWidth: 4096,
    maxHeight: 4096,
    maxBytes: 8 * 1024 * 1024,
    onClone: (documentClone) => maskAccountBalances(documentClone),
  },
});
```

Configured elements are masked in the cloned document before rendering. Password,
payment-autocomplete, and `[data-feedback-mask]` fields are masked by default when
the selector list is not overridden. Display-media capture must be called directly
from a user gesture and remains an explicit browser permission flow.

## Validate and submit

The package validates captured payloads at the transport boundary. The default
HTTP transport creates the feedback record as JSON and then uploads attachments
sequentially as multipart form data
when attachments are present.

```ts
import {
  createFeedbackSubmission,
  createHttpFeedbackTransport,
} from "@ventus/feedback-browser";

const transport = createHttpFeedbackTransport({
  endpoint: "/v1/feedback",
  headers: () => ({ authorization: `Bearer ${getShortLivedToken()}` }),
  retry: { maxAttempts: 2 },
});

const submission = createFeedbackSubmission({ payload });
const receipt = await transport.submit(submission, {
  signal: abortController.signal,
  onProgress: ({ phase }) => updateStatus(phase),
});
```

Submissions always carry an idempotency key. Automatic retries are disabled by
default; when enabled, only network failures, `408`, `429`, and `5xx` responses
are retried with the same key. Authentication headers are supplied by the host
and are never inspected or persisted by the package.

`validateFeedbackCapturePayload()` returns structured validation issues;
`parseFeedbackCapturePayload()` throws when an untrusted value does not match
schema version `1.0`.

## Collected fields

Every payload contains the schema version, capture timestamp, reporter-entered
title and description, and optional `sourceApp`, `release`, `environment`, URL,
and host context. Diagnostic arrays contain console entries, browser errors,
failed-request metadata, and breadcrumbs. Browser and performance snapshots are
nullable. All diagnostic groups except browser errors are disabled by default.

Host context may contain personal or commercially sensitive data. Keep it small,
omit it when it is not needed, and extend the redaction policy for domain-specific
values before enabling capture in production.
