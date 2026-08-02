import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { FeedbackWidget } from "../dist/index.js";

test("server-renders the custom element without browser globals", () => {
  const html = renderToString(
    createElement(FeedbackWidget, {
      endpoint: "/v1/feedback",
      projectKey: "public-test-key",
      theme: "auto",
      sourceApp: "ssr-test",
    }),
  );

  assert.match(html, /<ventus-feedback/);
  assert.match(html, /endpoint="\/v1\/feedback"/);
  assert.match(html, /project-key="public-test-key"/);
  assert.match(html, /source-app="ssr-test"/);
});
