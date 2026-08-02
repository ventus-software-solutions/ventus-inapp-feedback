import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { chromium } from "@playwright/test";

const demoUrl = process.env.VENTUS_DOGFOOD_DEMO_URL ?? "http://localhost:3100";
const apiUrl = process.env.VENTUS_DOGFOOD_API_URL ?? "http://127.0.0.1:8180/v1";
const agentToken =
  process.env.VENTUS_DOGFOOD_AGENT_TOKEN ?? "demo-agent-two-token";
const verifierToken =
  process.env.VENTUS_DOGFOOD_VERIFIER_TOKEN ?? "demo-service-token";
const mcpEntrypoint = fileURLToPath(
  new URL("../apps/mcp-server/dist/stdio.js", import.meta.url),
);
const marker = randomUUID();
const title = `Browser to MCP dogfood ${marker}`;

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry) => entry[1] !== undefined),
);

const connectMcp = async (name, token) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpEntrypoint],
    env: {
      ...environment,
      VENTUS_FEEDBACK_API_URL: apiUrl,
      VENTUS_FEEDBACK_API_TOKEN: token,
    },
    stderr: "pipe",
  });
  const client = new Client({ name, version: "1.0.0" });
  await client.connect(transport);
  return client;
};

const callTool = async (client, name, args) => {
  const response = await client.callTool({ name, arguments: args });
  assert.notEqual(
    response.isError,
    true,
    `${name} failed: ${response.content?.[0]?.text ?? "unknown MCP error"}`,
  );
  assert.ok(response.structuredContent?.result, `${name} returned no result`);
  return response.structuredContent.result;
};

const browser = await chromium.launch({ headless: true });
let agent;
let verifier;

try {
  const page = await browser.newPage();
  await page.goto(demoUrl, { waitUntil: "networkidle" });
  await assert.doesNotReject(() =>
    page.getByText("Live API · 0.1", { exact: true }).waitFor(),
  );

  await page.evaluate(() => {
    const widget = document.querySelector("ventus-feedback");
    if (!widget) throw new Error("The dogfooding widget was not rendered.");
    window.__ventusDogfoodReceipt = null;
    window.__ventusDogfoodError = null;
    widget.addEventListener(
      "ventus-feedback-success",
      (event) => {
        window.__ventusDogfoodReceipt = event.detail.receipt;
      },
      { once: true },
    );
    widget.addEventListener(
      "ventus-feedback-error",
      (event) => {
        window.__ventusDogfoodError =
          event.detail.error instanceof Error
            ? event.detail.error.message
            : String(event.detail.error);
      },
      { once: true },
    );
  });

  const widget = page.locator("ventus-feedback");
  await widget.locator("button[data-action='open']").click();
  await widget.locator("select[name='category']").selectOption("bug");
  await widget.locator("input[name='title']").fill(title);
  await widget
    .locator("textarea[name='description']")
    .fill(
      "A synthetic end-to-end report submitted through the real Web Component and completed through the real MCP stdio server.",
    );
  await widget.locator("input[name='attachment']").setInputFiles({
    name: "dogfood-evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(`Synthetic browser evidence for ${marker}.`),
  });
  await widget.locator("button[type='submit']").click();
  await page.waitForFunction(
    () =>
      window.__ventusDogfoodReceipt !== null ||
      window.__ventusDogfoodError !== null,
  );
  const submissionError = await page.evaluate(
    () => window.__ventusDogfoodError,
  );
  assert.equal(
    submissionError,
    null,
    `Widget submission failed: ${submissionError}`,
  );
  const receipt = await page.evaluate(() => window.__ventusDogfoodReceipt);
  assert.match(receipt.id, /^fb_/);

  agent = await connectMcp("ventus-dogfood-agent", agentToken);
  verifier = await connectMcp("ventus-dogfood-verifier", verifierToken);

  const search = await callTool(agent, "search_feedback", {
    projectId: "prj_demo",
    search: title,
    limit: 10,
  });
  const found = search.items.find((item) => item.id === receipt.id);
  assert.ok(found, `MCP search did not return widget report ${receipt.id}`);

  let feedback = await callTool(agent, "get_feedback", {
    feedbackId: receipt.id,
  });
  assert.equal(feedback.title, title);
  assert.equal(feedback.sourceApp, "demo-widget");
  assert.equal(feedback.environment, "development");
  assert.equal(feedback.attachments.length, 1);
  const serializedReport = JSON.stringify(feedback);
  assert.doesNotMatch(serializedReport, /synthetic-password/);
  assert.doesNotMatch(serializedReport, /demo\.user@example\.com/);

  let mutation = await callTool(agent, "update_feedback", {
    feedbackId: receipt.id,
    version: feedback.version,
    priority: "high",
    labels: ["dogfood", "browser-to-mcp"],
    idempotencyKey: `triage-${marker}`,
  });
  feedback = mutation.feedback;

  mutation = await callTool(agent, "claim_feedback", {
    feedbackId: receipt.id,
    version: feedback.version,
    leaseSeconds: 600,
    idempotencyKey: `claim-${marker}`,
  });
  feedback = mutation.feedback;

  mutation = await callTool(agent, "comment_feedback", {
    feedbackId: receipt.id,
    version: feedback.version,
    body: "Claimed through MCP and reproduced in the dogfooding acceptance run.",
    idempotencyKey: `comment-${marker}`,
  });
  feedback = mutation.feedback;

  mutation = await callTool(agent, "add_feedback_evidence", {
    feedbackId: receipt.id,
    version: feedback.version,
    note: "Browser submission, structured retrieval, redaction, and attachment persistence passed.",
    idempotencyKey: `evidence-${marker}`,
  });
  feedback = mutation.feedback;

  mutation = await callTool(agent, "resolve_feedback", {
    feedbackId: receipt.id,
    version: feedback.version,
    reason: "fixed",
    summary: "The browser-to-agent path completed successfully.",
    idempotencyKey: `resolve-${marker}`,
  });
  feedback = mutation.feedback;

  mutation = await callTool(verifier, "close_feedback", {
    feedbackId: receipt.id,
    version: feedback.version,
    note: "Independently verified through the verifier MCP credential.",
    idempotencyKey: `close-${marker}`,
  });
  feedback = mutation.feedback;

  mutation = await callTool(agent, "reopen_feedback", {
    feedbackId: receipt.id,
    version: feedback.version,
    note: "Synthetic new evidence exercises the reopen path.",
    idempotencyKey: `reopen-${marker}`,
  });
  feedback = mutation.feedback;

  mutation = await callTool(agent, "claim_feedback", {
    feedbackId: receipt.id,
    version: feedback.version,
    leaseSeconds: 600,
    idempotencyKey: `reclaim-${marker}`,
  });
  feedback = mutation.feedback;

  mutation = await callTool(agent, "comment_feedback", {
    feedbackId: receipt.id,
    version: feedback.version,
    body: "Reopened evidence was reviewed and the fix was reverified.",
    idempotencyKey: `reopen-comment-${marker}`,
  });
  feedback = mutation.feedback;

  mutation = await callTool(agent, "resolve_feedback", {
    feedbackId: receipt.id,
    version: feedback.version,
    reason: "fixed",
    summary: "Reopened report passed verification again.",
    idempotencyKey: `reresolve-${marker}`,
  });
  feedback = mutation.feedback;

  mutation = await callTool(verifier, "close_feedback", {
    feedbackId: receipt.id,
    version: feedback.version,
    note: "Final independent verification passed.",
    idempotencyKey: `reclose-${marker}`,
  });
  feedback = mutation.feedback;
  assert.equal(feedback.status, "closed");

  const events = await callTool(agent, "list_feedback_events", {
    feedbackId: receipt.id,
    limit: 100,
  });
  const eventTypes = events.items.map((event) => event.type);
  for (const expected of [
    "created",
    "attachment_added",
    "metadata_updated",
    "claim_acquired",
    "comment_added",
    "evidence_added",
    "resolved",
    "closed",
    "reopened",
  ]) {
    assert.ok(eventTypes.includes(expected), `Missing ${expected} audit event`);
  }
  assert.equal(eventTypes.filter((type) => type === "closed").length, 2);

  process.stdout.write(
    `${receipt.id} submitted through the widget, completed through MCP, reopened, and independently reclosed at version ${feedback.version}.\n`,
  );
} finally {
  await Promise.allSettled([agent?.close(), verifier?.close()]);
  await browser.close();
}
