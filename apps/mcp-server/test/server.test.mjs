import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createFeedbackMcpServer } from "../dist/index.js";

const connect = async (api) => {
  const server = createFeedbackMcpServer(api);
  const client = new Client({ name: "ventus-mcp-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { server, client };
};

const unused = async () => {
  throw new Error("unexpected API call");
};

test("publishes the complete read, lease, workflow, and audit tool surface", async (t) => {
  const api = new Proxy({}, { get: () => unused });
  const { server, client } = await connect(api);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
    "add_feedback_evidence",
    "claim_feedback",
    "close_feedback",
    "comment_feedback",
    "get_feedback",
    "list_feedback_events",
    "reject_feedback",
    "release_feedback_claim",
    "renew_feedback_claim",
    "reopen_feedback",
    "resolve_feedback",
    "search_feedback",
    "update_feedback",
  ]);
});

test("passes claim leases and optimistic versions through the HTTP client boundary", async (t) => {
  let call;
  const api = new Proxy(
    {
      claimFeedback: async (feedbackId, input, options) => {
        call = { feedbackId, input, options };
        return {
          feedback: {
            id: feedbackId,
            version: input.version + 1,
            status: "in_progress",
          },
        };
      },
    },
    { get: (target, property) => target[property] ?? unused },
  );
  const { server, client } = await connect(api);
  t.after(async () => {
    await client.close();
    await server.close();
  });

  const response = await client.callTool({
    name: "claim_feedback",
    arguments: {
      feedbackId: "fb_123",
      version: 4,
      leaseSeconds: 600,
      idempotencyKey: "claim-fb-123-run-1",
    },
  });
  assert.equal(response.isError, undefined);
  assert.deepEqual(call, {
    feedbackId: "fb_123",
    input: { version: 4, leaseSeconds: 600 },
    options: { idempotencyKey: "claim-fb-123-run-1" },
  });
  assert.equal(response.structuredContent.result.feedback.version, 5);
  assert.match(response.content[0].text, /"version": 5/);
});

test("omits absent optional fields at the strict API boundary", async (t) => {
  const calls = [];
  const api = new Proxy(
    {
      listFeedback: async (query) => {
        calls.push({ operation: "list", query });
        return { items: [], nextCursor: null };
      },
      resolveFeedback: async (feedbackId, input, options) => {
        calls.push({ operation: "resolve", feedbackId, input, options });
        return {
          feedback: {
            id: feedbackId,
            version: input.version + 1,
            status: "resolved",
          },
        };
      },
    },
    { get: (target, property) => target[property] ?? unused },
  );
  const { server, client } = await connect(api);
  t.after(async () => {
    await client.close();
    await server.close();
  });

  await client.callTool({ name: "search_feedback", arguments: { limit: 5 } });
  await client.callTool({
    name: "resolve_feedback",
    arguments: {
      feedbackId: "fb_optional",
      version: 2,
      idempotencyKey: "resolve-optional-1",
      reason: "fixed",
      summary: "Verified without optional values.",
      links: [{ type: "commit", url: "https://git.example/commit/123" }],
    },
  });

  assert.deepEqual(calls[0], { operation: "list", query: { limit: 5 } });
  assert.deepEqual(calls[1], {
    operation: "resolve",
    feedbackId: "fb_optional",
    input: {
      version: 2,
      reason: "fixed",
      summary: "Verified without optional values.",
      links: [{ type: "commit", url: "https://git.example/commit/123" }],
    },
    options: { idempotencyKey: "resolve-optional-1" },
  });
});

test("returns API failures as model-visible tool errors", async (t) => {
  const api = new Proxy(
    {
      getFeedback: async () => {
        throw new Error("service unavailable");
      },
    },
    { get: (target, property) => target[property] ?? unused },
  );
  const { server, client } = await connect(api);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const response = await client.callTool({
    name: "get_feedback",
    arguments: { feedbackId: "fb_123" },
  });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /service unavailable/);
});
