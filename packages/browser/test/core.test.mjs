import assert from "node:assert/strict";
import test from "node:test";
import { createFeedbackCaptureCore } from "../dist/index.js";

test("creates a server-safe payload without browser globals", () => {
  const capture = createFeedbackCaptureCore();
  capture.init();

  const payload = capture.getPayload({
    sourceApp: "demo",
    title: "Synthetic report",
    description: "Created by the package smoke test.",
  });

  assert.equal(payload.sourceApp, "demo");
  assert.equal(payload.schemaVersion, "1.0");
  assert.equal(payload.title, "Synthetic report");
  assert.equal(payload.url, null);
  assert.equal(payload.browser, null);
  assert.equal(payload.performance, null);
  assert.deepEqual(payload.consoleLogs, []);
  assert.deepEqual(payload.errors, []);
  assert.deepEqual(payload.networkErrors, []);
  assert.deepEqual(payload.breadcrumbs, []);
  assert.equal(payload.context, null);
});

test("returns null for browser-only capture methods outside a browser", async () => {
  const capture = createFeedbackCaptureCore();

  assert.equal(await capture.captureViewportScreenshotBlob(), null);
  assert.equal(await capture.captureDisplayMediaScreenshotBlob(), null);
});
