# Ventus In-App Feedback

Developer-friendly in-app feedback capture, UI, backend, and agent workflow
tooling. The integration packages are open source; the self-hosted backend is
source-available. The project is currently in its pre-release foundation phase.

## Workspace

- `packages/browser` — framework-neutral browser capture core.
- `packages/widget` — framework-neutral Web Component feedback UI.
- `packages/react` — thin React wrapper around the Web Component.
- `packages/contracts` — domain model, state machine, and OpenAPI 3.1 contract.
- `packages/api-client` — typed framework-neutral client for the `/v1` API.
- `apps/api` — self-hosted Fastify/PostgreSQL API with an in-memory test adapter.
- `apps/mcp-server` — stdio MCP adapter backed exclusively by the typed HTTP client.
- `apps/demo` — local dogfooding playground using the browser package through its public export.
- `PLANNING.md` — comprehensive productization and release plan.

## Local development

Requirements: Node.js 22.13 or newer for the complete workspace.

```bash
npm install
npm run demo
```

Run the complete foundation checks with:

```bash
npm run verify
```

`verify` runs strict type-checking, all tests, repository-wide ESLint, a
non-mutating Prettier check, package-tarball inspection, and the dependency
audit. Use `npm run format` to apply the repository style before rerunning it.

## Current capture behavior

The browser package provides opt-in console, error, failed-request, breadcrumb, browser, performance, and screenshot capture. Its payload is schema-versioned and supports release, environment, and sanitized host context.

Default redaction, screenshot masking, bounded buffers, shared instrumentation,
lifecycle cleanup, breadcrumbs, failed-request capture, runtime payload
validation, HTTP transport, the Web Component, and its thin React wrapper are
implemented. The self-hosted API includes PostgreSQL persistence, S3-compatible
attachments, project/service/reporter authentication, ingestion rate limiting,
audit events, leases, and independently authorized closure. The MCP adapter uses
the same HTTP API for agent workflows.

Start the complete local backend on ports 8080, 15432, 19000, and 9001:

```bash
docker compose up --build
```

Then run `node scripts/smoke-api.mjs` with the environment values documented in
`apps/api/README.md` to exercise create, upload/download, claim, resolve, close,
audit events, competing claims, and transactional mutation replay. CI also runs
`scripts/smoke-retention.mjs` against PostgreSQL and MinIO to prove dry-run,
soft-delete, object removal, content scrubbing, and audit pseudonymization.

Production requirements, upgrades, backups, scaling, and key rotation are covered
in `docs/deployment.md`; `docs/security-threat-model.md` records the current threat
model and known pre-stable gaps.

## Licensing

The browser SDK, widget, React wrapper, contracts, API client, and MCP adapter
are licensed under MIT. The self-hosted API in `apps/api` is licensed under the
Business Source License 1.1 (BUSL-1.1).

The API's Additional Use Grant permits development and non-production use, plus
production use until the API processes more than 1,000 aggregate feedback
submissions per calendar month for three consecutive months. A 30-day transition
window follows the third month. Production use outside that grant requires a
commercial license from Ventus Software Solutions GmbH. Each API version changes
to Apache-2.0 on the fourth anniversary of its first public distribution.

See [`LICENSE`](LICENSE) for the component map and the controlling license
files. The BSL-licensed API is source-available, not open source before its
Change Date. The licensing parameters and commercial agreement should receive
legal review before the first public release.
