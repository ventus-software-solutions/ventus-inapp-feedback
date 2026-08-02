import { createHash, timingSafeEqual } from "node:crypto";
import type {
  FeedbackActor,
  FeedbackScope,
} from "@ventus-software-solutions/feedback-contracts";
import type { ApiConfiguration } from "./config.js";

export type AuthContext = {
  workspaceId: string;
  projectId: string | null;
  actor: FeedbackActor;
  scopes: FeedbackScope[];
  kind: "project_key" | "service" | "reporter";
};

export const safeEqual = (left: string, right: string): boolean => {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
};

export const resolveConfiguredAuth = (
  headers: Record<string, string | string[] | undefined>,
  configuration: ApiConfiguration,
): AuthContext | null => {
  const projectKey =
    typeof headers["x-feedback-project-key"] === "string"
      ? headers["x-feedback-project-key"]
      : null;
  if (projectKey) {
    const match = Object.entries(configuration.projectKeys).find(([key]) =>
      safeEqual(key, projectKey),
    );
    if (match) {
      return {
        workspaceId: match[1].workspaceId,
        projectId: match[1].projectId,
        actor: {
          id: `project:${match[1].projectId}`,
          type: "reporter",
          displayName: "Anonymous reporter",
        },
        scopes: ["feedback:submit"],
        kind: "project_key",
      };
    }
  }
  const authorization =
    typeof headers.authorization === "string" ? headers.authorization : "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (token) {
    const match = Object.entries(configuration.serviceTokens).find(
      ([candidate]) => safeEqual(candidate, token),
    );
    if (match) {
      const value = match[1];
      return {
        workspaceId: value.workspaceId,
        projectId: value.projectId ?? null,
        actor: {
          id: value.actorId,
          type: value.actorType,
          displayName: value.displayName,
        },
        scopes: [...value.scopes],
        kind: "service",
      };
    }
  }
  return null;
};

export const hasScope = (auth: AuthContext, scope: FeedbackScope): boolean =>
  auth.scopes.includes(scope) || auth.scopes.includes("feedback:admin");
