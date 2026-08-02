import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the capture lab", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Ventus Feedback Capture Lab<\/title>/i);
  assert.match(html, /Capture Lab/);
  assert.match(html, /Break things here before customers do\./);
  assert.match(html, /Synthetic scenarios/);
  assert.match(html, /Captured payload/);
  assert.match(html, /Mock mode · 0\.1/);
  assert.match(
    html,
    /real self-hosted API or the disposable\s+mock transport/i,
  );
  assert.match(html, /immediately available to agents/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});
