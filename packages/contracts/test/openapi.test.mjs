import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

test("parses the OpenAPI document and resolves every internal reference", async () => {
  const source = await readFile(
    new URL("../openapi/openapi.yaml", import.meta.url),
    "utf8",
  );
  const document = parse(source);
  assert.equal(document.openapi, "3.1.0");
  assert.ok(Object.keys(document.paths).length >= 10);

  const references = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.$ref === "string") references.push(value.$ref);
    Object.values(value).forEach(visit);
  };
  visit(document);

  for (const reference of references) {
    assert.match(reference, /^#\//);
    const target = reference
      .slice(2)
      .split("/")
      .reduce(
        (value, segment) =>
          value?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")],
        document,
      );
    assert.ok(target, `Missing OpenAPI reference: ${reference}`);
  }
});

test("requires optimistic versions and idempotency keys for every feedback mutation", async () => {
  const document = parse(
    await readFile(new URL("../openapi/openapi.yaml", import.meta.url), "utf8"),
  );
  const mutations = [
    ["/feedback/{feedbackId}", "patch"],
    ["/feedback/{feedbackId}/comments", "post"],
    ["/feedback/{feedbackId}/claim", "post"],
    ["/feedback/{feedbackId}/claim", "delete"],
    ["/feedback/{feedbackId}/claim/renew", "post"],
    ["/feedback/{feedbackId}/resolve", "post"],
    ["/feedback/{feedbackId}/close", "post"],
    ["/feedback/{feedbackId}/reopen", "post"],
    ["/feedback/{feedbackId}/reject", "post"],
    ["/feedback/{feedbackId}/evidence", "post"],
    ["/feedback/{feedbackId}/attachments", "post"],
  ];
  for (const [path, method] of mutations) {
    const references = document.paths[path][method].parameters.map(
      (item) => item.$ref,
    );
    assert.ok(
      references.includes("#/components/parameters/IfMatch"),
      `${method.toUpperCase()} ${path} lacks If-Match`,
    );
    assert.ok(
      references.includes("#/components/parameters/IdempotencyKey"),
      `${method.toUpperCase()} ${path} lacks Idempotency-Key`,
    );
  }
});
