import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import {
  FeedbackApiClient,
  FeedbackApiError,
  type FeedbackCategory,
  type FeedbackPriority,
  type FeedbackResolutionReason,
  type FeedbackStatus,
} from "@ventus/feedback-api-client";
import * as z from "zod/v4";

export type FeedbackMcpApi = Pick<
  FeedbackApiClient,
  | "listFeedback"
  | "getFeedback"
  | "updateFeedback"
  | "addComment"
  | "claimFeedback"
  | "renewClaim"
  | "releaseClaim"
  | "resolveFeedback"
  | "closeFeedback"
  | "reopenFeedback"
  | "rejectFeedback"
  | "addEvidence"
  | "listEvents"
>;

export type FeedbackMcpConfiguration = {
  apiUrl: string;
  token: string;
};

const statuses = [
  "new",
  "triaged",
  "in_progress",
  "resolved",
  "closed",
  "rejected",
  "reopened",
] as const;
const categories = ["bug", "feedback", "idea"] as const;
const priorities = ["unset", "low", "medium", "high", "urgent"] as const;
const reasons = [
  "fixed",
  "already_done",
  "wont_do",
  "duplicate",
  "not_relevant",
] as const;
const linkTypes = [
  "commit",
  "pull_request",
  "issue",
  "deployment",
  "other",
] as const;
const toolOutputSchema = z.object({ result: z.unknown() });

const result = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  structuredContent: { result: value },
});

const failure = (error: unknown): CallToolResult => {
  const message =
    error instanceof FeedbackApiError
      ? `${error.code} (${error.status}): ${error.message}${error.requestId ? ` [request ${error.requestId}]` : ""}`
      : error instanceof Error
        ? error.message
        : "The feedback operation failed.";
  return { content: [{ type: "text", text: message }], isError: true };
};

const run = async (
  operation: () => Promise<unknown>,
): Promise<CallToolResult> => {
  try {
    return result(await operation());
  } catch (error) {
    return failure(error);
  }
};

type WithoutUndefined<T extends Record<string, unknown>> = {
  [Key in keyof T as undefined extends T[Key] ? never : Key]: T[Key];
} & {
  [Key in keyof T as undefined extends T[Key] ? Key : never]?: Exclude<
    T[Key],
    undefined
  >;
};

const omitUndefined = <T extends Record<string, unknown>>(
  value: T,
): WithoutUndefined<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as WithoutUndefined<T>;

const versioned = {
  feedbackId: z
    .string()
    .min(1)
    .describe("Feedback identifier returned by search_feedback."),
  version: z
    .number()
    .int()
    .positive()
    .describe("Current record version. Refresh after a conflict."),
  idempotencyKey: z
    .string()
    .min(8)
    .max(200)
    .describe(
      "Unique key for this intended write. Reuse it only when retrying the exact same request.",
    ),
};

export const createFeedbackMcpServer = (api: FeedbackMcpApi): McpServer => {
  const server = new McpServer(
    { name: "ventus-feedback", version: "0.1.0" },
    {
      instructions:
        "Search before claiming work. Use the latest record version and a new idempotency key for every intended mutation; reuse that key only when retrying the exact same request. Claims are expiring leases: renew active work and release abandoned work. Resolve only with evidence and a concise summary. Closing is a separate verifier-authorized action and may be rejected by the HTTP API for agent credentials.",
    },
  );

  server.registerTool(
    "search_feedback",
    {
      title: "Search feedback",
      description:
        "List and filter feedback. Use the returned cursor to pull the next page.",
      inputSchema: z.object({
        projectId: z.string().optional(),
        status: z.array(z.enum(statuses)).optional(),
        category: z.array(z.enum(categories)).optional(),
        priority: z.array(z.enum(priorities)).optional(),
        labels: z.array(z.string()).optional(),
        claimedBy: z.string().optional(),
        release: z.string().optional(),
        environment: z.string().optional(),
        search: z.string().max(256).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        sort: z.enum(["created_at", "updated_at", "priority"]).optional(),
        order: z.enum(["asc", "desc"]).optional(),
      }),
      outputSchema: toolOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (query) =>
      run(() =>
        api.listFeedback(
          omitUndefined({
            ...query,
            status: query.status as FeedbackStatus[] | undefined,
            category: query.category as FeedbackCategory[] | undefined,
            priority: query.priority as FeedbackPriority[] | undefined,
          }),
        ),
      ),
  );

  server.registerTool(
    "get_feedback",
    {
      title: "Get feedback",
      description:
        "Fetch the current feedback record and version before changing it.",
      inputSchema: z.object({ feedbackId: versioned.feedbackId }),
      outputSchema: toolOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    ({ feedbackId }) => run(() => api.getFeedback(feedbackId)),
  );

  server.registerTool(
    "update_feedback",
    {
      title: "Triage feedback",
      description:
        "Update triage metadata such as priority, labels, title, or category.",
      inputSchema: z.object({
        ...versioned,
        priority: z.enum(priorities).optional(),
        labels: z.array(z.string()).max(50).optional(),
        title: z.string().min(1).max(240).optional(),
        category: z.enum(categories).optional(),
      }),
      outputSchema: toolOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    ({ feedbackId, idempotencyKey, ...input }) =>
      run(() =>
        api.updateFeedback(feedbackId, omitUndefined(input), {
          idempotencyKey,
        }),
      ),
  );

  server.registerTool(
    "claim_feedback",
    {
      title: "Claim feedback",
      description:
        "Acquire an expiring lease before starting work on a feedback item.",
      inputSchema: z.object({
        ...versioned,
        leaseSeconds: z.number().int().min(60).max(86400).optional(),
      }),
      outputSchema: toolOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    ({ feedbackId, idempotencyKey, ...input }) =>
      run(() =>
        api.claimFeedback(feedbackId, omitUndefined(input), { idempotencyKey }),
      ),
  );

  server.registerTool(
    "renew_feedback_claim",
    {
      title: "Renew feedback claim",
      description: "Extend the current agent's active lease.",
      inputSchema: z.object({
        ...versioned,
        leaseSeconds: z.number().int().min(60).max(86400).optional(),
      }),
      outputSchema: toolOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    ({ feedbackId, idempotencyKey, ...input }) =>
      run(() =>
        api.renewClaim(feedbackId, omitUndefined(input), { idempotencyKey }),
      ),
  );

  server.registerTool(
    "release_feedback_claim",
    {
      title: "Release feedback claim",
      description:
        "Release the current agent's lease when work is stopped or handed off.",
      inputSchema: z.object(versioned),
      outputSchema: toolOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    ({ feedbackId, version, idempotencyKey }) =>
      run(() => api.releaseClaim(feedbackId, { version }, { idempotencyKey })),
  );

  server.registerTool(
    "comment_feedback",
    {
      title: "Comment on feedback",
      description: "Append a concise progress, question, or handoff comment.",
      inputSchema: z.object({
        ...versioned,
        body: z.string().min(1).max(10000),
      }),
      outputSchema: toolOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    ({ feedbackId, idempotencyKey, ...input }) =>
      run(() => api.addComment(feedbackId, input, { idempotencyKey })),
  );

  server.registerTool(
    "add_feedback_evidence",
    {
      title: "Add verification evidence",
      description:
        "Append test or deployment evidence without changing status.",
      inputSchema: z.object({
        ...versioned,
        note: z.string().min(1).max(10000),
      }),
      outputSchema: toolOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    ({ feedbackId, idempotencyKey, ...input }) =>
      run(() => api.addEvidence(feedbackId, input, { idempotencyKey })),
  );

  server.registerTool(
    "resolve_feedback",
    {
      title: "Resolve feedback",
      description:
        "Mark work resolved with a reason, summary, and optional external links. Resolution is not final closure.",
      inputSchema: z.object({
        ...versioned,
        reason: z.enum(reasons),
        summary: z.string().min(1).max(10000),
        duplicateOfId: z.string().optional(),
        links: z
          .array(
            z.object({
              type: z.enum(linkTypes),
              url: z.url(),
              label: z.string().optional(),
            }),
          )
          .max(20)
          .optional(),
      }),
      outputSchema: toolOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    ({ feedbackId, idempotencyKey, links, ...input }) =>
      run(() =>
        api.resolveFeedback(
          feedbackId,
          omitUndefined({
            ...input,
            reason: input.reason as FeedbackResolutionReason,
            ...(links
              ? {
                  links: links.map(({ type, url, label }) => ({
                    type,
                    url,
                    ...(label === undefined ? {} : { label }),
                  })),
                }
              : {}),
          }),
          { idempotencyKey },
        ),
      ),
  );

  server.registerTool(
    "close_feedback",
    {
      title: "Close verified feedback",
      description:
        "Finalize a resolved item after independent verification. Most agent tokens intentionally lack this permission.",
      inputSchema: z.object({
        ...versioned,
        note: z.string().min(1).max(10000),
      }),
      outputSchema: toolOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    ({ feedbackId, idempotencyKey, ...input }) =>
      run(() => api.closeFeedback(feedbackId, input, { idempotencyKey })),
  );

  server.registerTool(
    "reopen_feedback",
    {
      title: "Reopen feedback",
      description:
        "Reopen closed, rejected, or resolved feedback with new evidence or a clear reason.",
      inputSchema: z.object({
        ...versioned,
        note: z.string().min(1).max(10000),
      }),
      outputSchema: toolOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    ({ feedbackId, idempotencyKey, ...input }) =>
      run(() => api.reopenFeedback(feedbackId, input, { idempotencyKey })),
  );

  server.registerTool(
    "reject_feedback",
    {
      title: "Reject feedback",
      description:
        "Reject feedback with an explicit non-fixed disposition and explanation.",
      inputSchema: z.object({
        ...versioned,
        reason: z.enum([
          "duplicate",
          "already_done",
          "wont_do",
          "not_relevant",
        ]),
        note: z.string().min(1).max(10000),
        duplicateOfId: z.string().optional(),
      }),
      outputSchema: toolOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    ({ feedbackId, idempotencyKey, ...input }) =>
      run(() =>
        api.rejectFeedback(feedbackId, omitUndefined(input), {
          idempotencyKey,
        }),
      ),
  );

  server.registerTool(
    "list_feedback_events",
    {
      title: "List feedback events",
      description: "Read the append-only audit trail for a feedback item.",
      inputSchema: z.object({
        feedbackId: versioned.feedbackId,
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      outputSchema: toolOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    ({ feedbackId, ...query }) =>
      run(() => api.listEvents(feedbackId, omitUndefined(query))),
  );

  return server;
};

export const loadFeedbackMcpConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
): FeedbackMcpConfiguration => {
  const apiUrl = environment.VENTUS_FEEDBACK_API_URL?.trim();
  const token = environment.VENTUS_FEEDBACK_API_TOKEN?.trim();
  if (!apiUrl) throw new Error("VENTUS_FEEDBACK_API_URL is required.");
  if (!token) throw new Error("VENTUS_FEEDBACK_API_TOKEN is required.");
  return { apiUrl: apiUrl.replace(/\/$/, ""), token };
};

export const createConfiguredFeedbackMcpServer = (
  configuration = loadFeedbackMcpConfiguration(),
): McpServer =>
  createFeedbackMcpServer(
    new FeedbackApiClient({
      baseUrl: configuration.apiUrl,
      token: configuration.token,
    }),
  );
