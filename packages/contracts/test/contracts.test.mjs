import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedFeedbackActions,
  evaluateFeedbackTransition,
  normalizeLabels,
  validateCreateFeedbackRequest,
} from "../dist/index.js";

test("keeps resolution and verification closure as separate transitions", () => {
  assert.deepEqual(
    evaluateFeedbackTransition({
      from: "in_progress",
      action: "resolve",
      scopes: ["feedback:resolve"],
      resolutionReason: "fixed",
      resolutionSummary: "Patched and covered by regression test.",
    }),
    { allowed: true, to: "resolved" },
  );
  assert.equal(
    evaluateFeedbackTransition({
      from: "resolved",
      action: "close",
      scopes: ["feedback:resolve"],
      note: "Verified",
    }).allowed,
    false,
  );
  assert.deepEqual(
    evaluateFeedbackTransition({
      from: "resolved",
      action: "close",
      scopes: ["feedback:close"],
      note: "Verified in release 2026.08.02",
    }),
    { allowed: true, to: "closed" },
  );
});

test("requires evidence-bearing fields for terminal dispositions", () => {
  const duplicate = evaluateFeedbackTransition({
    from: "in_progress",
    action: "resolve",
    scopes: ["feedback:resolve"],
    resolutionReason: "duplicate",
    resolutionSummary: "Same root cause.",
  });
  assert.equal(duplicate.allowed, false);
  if (!duplicate.allowed) assert.equal(duplicate.code, "missing_field");

  const reopened = evaluateFeedbackTransition({
    from: "closed",
    action: "reopen",
    scopes: ["feedback:triage"],
  });
  assert.equal(reopened.allowed, false);
});

test("filters available actions by status and scopes", () => {
  assert.deepEqual(
    allowedFeedbackActions("resolved", ["feedback:resolve"]),
    [],
  );
  assert.deepEqual(
    allowedFeedbackActions("resolved", ["feedback:close", "feedback:triage"]),
    ["close", "reopen"],
  );
});

test("validates ingestion input and normalizes bounded labels", () => {
  const valid = validateCreateFeedbackRequest({
    schemaVersion: "1.0",
    projectId: "project_demo",
    category: "bug",
    title: "Checkout failed",
    description: "The checkout action returned an error.",
  });
  assert.equal(valid.success, true);
  assert.equal(
    validateCreateFeedbackRequest({ schemaVersion: "2.0" }).success,
    false,
  );
  assert.deepEqual(normalizeLabels([" Bug ", "bug", "Checkout"]), [
    "bug",
    "checkout",
  ]);
});
