import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const failures = [];
const readJson = async (path) =>
  JSON.parse(await readFile(resolve(root, path), "utf8"));
const normalizeLicense = (text) => text.replaceAll("\r\n", "\n").trimEnd();

const rootPackage = await readJson("package.json");
for (const field of ["repository", "homepage", "bugs"]) {
  if (!rootPackage[field])
    failures.push(`Root package.json is missing ${field}.`);
}

const rootMit = await readFile(resolve(root, "LICENSE-MIT.md"), "utf8");
const rootBsl = await readFile(resolve(root, "LICENSE-BSL.md"), "utf8");
const searchableBsl = rootBsl.replace(/\s+/g, " ");
if (!rootMit.startsWith("MIT License\n")) {
  failures.push("LICENSE-MIT.md does not contain the MIT License text.");
}
for (const requiredBslText of [
  "Business Source License 1.1",
  "Licensor: Ventus Software Solutions GmbH",
  "Aggregate Monthly Feedback Submissions",
  "1,000",
  "three consecutive calendar months",
  "Change License: Apache License, Version 2.0",
]) {
  if (!searchableBsl.includes(requiredBslText)) {
    failures.push(`LICENSE-BSL.md is missing: ${requiredBslText}`);
  }
}

const mitPackagePaths = [
  "packages/contracts/package.json",
  "packages/api-client/package.json",
  "packages/browser/package.json",
  "packages/widget/package.json",
  "packages/react/package.json",
  "apps/mcp-server/package.json",
];

for (const packagePath of mitPackagePaths) {
  const manifest = await readJson(packagePath);
  const license = await readFile(
    resolve(root, packagePath, "..", "LICENSE"),
    "utf8",
  );
  if (
    manifest.license !== "MIT" ||
    normalizeLicense(license) !== normalizeLicense(rootMit)
  ) {
    failures.push(`${packagePath} must ship the repository MIT license text.`);
  }
  if (!manifest.repository || !manifest.homepage || !manifest.bugs) {
    failures.push(`${packagePath} is missing public repository metadata.`);
  }
}

const apiManifest = await readJson("apps/api/package.json");
const apiLicense = await readFile(resolve(root, "apps/api/LICENSE"), "utf8");
if (
  apiManifest.license !== "BUSL-1.1" ||
  normalizeLicense(apiLicense) !== normalizeLicense(rootBsl)
) {
  failures.push(
    "apps/api must declare BUSL-1.1 and ship the repository BSL terms exactly.",
  );
}

if (failures.length) {
  console.error(
    "Release is intentionally blocked:\n- " + failures.join("\n- "),
  );
  process.exitCode = 1;
} else {
  console.log("Release metadata and license gates are satisfied.");
}
