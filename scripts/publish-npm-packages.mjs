import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const publishOrder = [
  "@ventus/feedback-contracts",
  "@ventus/feedback-api-client",
  "@ventus/feedback-browser",
  "@ventus/feedback-widget",
  "@ventus/feedback-react",
  "@ventus/feedback-mcp",
];

const workspaceByPackage = {
  "@ventus/feedback-contracts": "packages/contracts",
  "@ventus/feedback-api-client": "packages/api-client",
  "@ventus/feedback-browser": "packages/browser",
  "@ventus/feedback-widget": "packages/widget",
  "@ventus/feedback-react": "packages/react",
  "@ventus/feedback-mcp": "apps/mcp-server",
};

const argumentsByName = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsByName.set(process.argv[index], process.argv[index + 1]);
}

const tagName = argumentsByName.get("--tag-name");
const prereleaseArgument = argumentsByName.get("--prerelease");
const dryRun = process.argv.includes("--dry-run");

if (!tagName || !["true", "false"].includes(prereleaseArgument ?? "")) {
  throw new Error(
    "Usage: node scripts/publish-npm-packages.mjs --tag-name vX.Y.Z --prerelease true|false [--dry-run]",
  );
}

const manifests = await Promise.all(
  publishOrder.map(async (name) => {
    const manifest = await import(
      `../${workspaceByPackage[name]}/package.json`,
      { with: { type: "json" } }
    );
    return manifest.default;
  }),
);

const versions = new Set(manifests.map(({ version }) => version));
if (versions.size !== 1) {
  throw new Error(
    `All public packages must use one release version. Found: ${[...versions].join(", ")}`,
  );
}

const [version] = versions;
if (tagName !== `v${version}`) {
  throw new Error(
    `GitHub release tag ${tagName} must match package version v${version}.`,
  );
}

const prerelease = prereleaseArgument === "true";
const versionIsPrerelease = version.includes("-");
if (prerelease !== versionIsPrerelease) {
  throw new Error(
    prerelease
      ? `GitHub prereleases require a SemVer prerelease version; found ${version}.`
      : `Stable GitHub releases cannot publish prerelease version ${version}.`,
  );
}

for (const manifest of manifests) {
  for (const dependencyGroup of ["dependencies", "optionalDependencies"]) {
    for (const [dependency, dependencyVersion] of Object.entries(
      manifest[dependencyGroup] ?? {},
    )) {
      if (publishOrder.includes(dependency) && dependencyVersion !== version) {
        throw new Error(
          `${manifest.name} must depend on ${dependency} at the release version ${version}; found ${dependencyVersion}.`,
        );
      }
    }
  }
}

const distTag = prerelease ? "beta" : "latest";

const npmCliCandidates = [
  process.env.npm_execpath,
  resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
  resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
].filter(Boolean);
const npmCli = npmCliCandidates.find((candidate) => existsSync(candidate));
if (!npmCli) {
  throw new Error("Could not locate npm's CLI entry point.");
}

function runNpm(args, allowFailure = false) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: allowFailure ? "pipe" : "inherit",
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`npm ${args[0]} failed with exit code ${result.status}.`);
  }
  return result;
}

for (const manifest of manifests) {
  const existing = runNpm(
    ["view", `${manifest.name}@${version}`, "version", "--json"],
    true,
  );
  if (existing.status === 0) {
    console.log(
      `Skipping ${manifest.name}@${version}; it is already published.`,
    );
    continue;
  }

  const publishArguments = [
    "publish",
    "--workspace",
    manifest.name,
    "--access",
    "public",
    "--tag",
    distTag,
  ];
  if (dryRun) publishArguments.push("--dry-run");

  console.log(
    `${dryRun ? "Checking" : "Publishing"} ${manifest.name}@${version} with dist-tag ${distTag}.`,
  );
  runNpm(publishArguments);
}
