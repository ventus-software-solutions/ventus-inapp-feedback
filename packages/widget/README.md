# @ventus-software-solutions/feedback-widget

```bash
npm install @ventus-software-solutions/feedback-widget@beta
```

Framework-neutral in-app feedback UI implemented as a standards-based custom
element. The package is pre-1.0 and its API may change.

```ts
import { defineVentusFeedbackWidget } from "@ventus-software-solutions/feedback-widget";

defineVentusFeedbackWidget();
```

```html
<ventus-feedback
  endpoint="/v1/feedback"
  project-key="public-ingestion-key"
  source-app="storefront"
  release="2026.08.02"
  environment="production"
  theme="auto"
></ventus-feedback>
```

The element exposes `open()` and `close()`, accepts a custom `transport`,
`capture`, `captureOptions`, and `context` property, and emits composed events:
`ventus-feedback-open`, `ventus-feedback-close`, `ventus-feedback-submit`,
`ventus-feedback-success`, and `ventus-feedback-error`.

Captured diagnostics are visible as opt-out groups in the form. Reporters can
capture one masked screenshot or select a file; selecting a file replaces the
automatic screenshot. Temporary form data, captures, object URLs, and attachment
references are cleared after success or cancellation. Recoverable submission
errors retain the current form.

Image attachments include a built-in editor for freehand marks, lines,
rectangles, ellipses, arrows, and text. Reporters can undo or clear marks, move
text callouts, and zoom the image. Applying the edit flattens the annotations
into the PNG that is previewed and uploaded. Set `annotation-mode="none"` when a
host application needs to disable the editor.

The form footer includes the two-line "Made by Ventus" badge from the Ventus
branding system, with the subtitle `a software company from Cologne`,
self-contained canonical logo artwork, and UTM source attribution. It links to
[Ventus Software Solutions](https://ventus.works?utm_source=ventus-inapp-feedback&utm_medium=referral&utm_campaign=badge)
without collecting feedback content or runtime telemetry.

Use `capture-mode="display"` for browser display-media capture or
`capture-mode="none"` to hide the capture behavior in host code. Viewport capture
requires a consumer-provided `loadHtml2Canvas` function through `captureOptions`.
