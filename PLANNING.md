# Ventus In-App Feedback: Public Release Plan

This document is the working implementation plan for turning the current
capture-core prototype into a production-ready feedback platform with
open-source integration packages and a source-available backend.

The plan is intentionally sequenced. Complete each phase's exit criteria before starting work that depends on it. Checkboxes should be updated as work is completed, and material architectural decisions should be recorded in the decision log at the end of this document.

## Current implementation status (2026-08-02)

The vertical pre-release slice is operational: typed browser capture, universal
widget, React wrapper, in-repo dogfooding demo, contracts/OpenAPI, typed API
client, Fastify/PostgreSQL API, S3-compatible attachments, reporter follow-up
authentication, Docker Compose, and a stdio MCP adapter. The real Compose smoke
flow passes create, attachment upload and signed download, claim, resolve,
independent close, and audit-event verification.

The repository is not ready for public publication. The hard release gates are
the legal/license and npm/repository identity decisions in Phase 0, deeper browser
and accessibility coverage, production malware-scanner wiring, retention/data
rights, remote MCP authentication/transport if offered, operational telemetry,
and release signing/provenance. External integrations remain out of scope until
an actual prerelease survives the in-repo demo acceptance period.

## Product goals

- Provide a framework-neutral browser SDK for collecting structured in-app feedback.
- Provide a reusable, themeable feedback widget that works in any modern web application.
- Offer a small React wrapper without maintaining separate UI implementations for every framework.
- Provide a self-hostable backend with a straightforward local installation.
- Provide a stable HTTP API for applications, integrations, and automation.
- Provide an MCP server through which coding agents can safely search, claim, update, resolve, and close feedback.
- Make privacy, consent, redaction, authorization, and auditability first-class features.
- Support a useful, production-ready self-hosted deployment.

## Non-goals for the first stable release

- Native iOS or Android SDKs.
- Independent Vue, Angular, Svelte, or other framework-specific widget implementations.
- A microservice architecture.
- Kubernetes as the primary installation path.
- AI-based automatic triage in the core backend.
- Permanent deletion by autonomous agents.
- A full replacement for project-management systems such as GitHub Issues, Linear, or Jira.

## Target architecture

```text
Application
  -> @ventus-software-solutions/feedback-browser
  -> @ventus-software-solutions/feedback-widget
       -> @ventus-software-solutions/feedback-browser
  -> @ventus-software-solutions/feedback-react (optional wrapper)

Browser packages
  -> Ventus HTTP API
       -> PostgreSQL
       -> S3-compatible object storage
       -> background jobs/webhooks

Codex and other MCP clients
  -> Ventus MCP server
       -> Ventus HTTP API
```

The HTTP API is the canonical business interface. The widget, SDK, administrative UI, integrations, and MCP tools must use the same domain rules and authorization checks.

## Proposed repository structure

```text
apps/
  demo/                   # in-repo dogfooding playground and acceptance app
  server/                 # HTTP API and background-worker entry points
  mcp-server/             # MCP adapter backed by the HTTP API
  admin/                  # optional operator UI; not required initially
packages/
  browser/                # diagnostics, screenshots, redaction, submission client
  widget/                 # framework-neutral Web Component
  react/                  # thin React wrapper around the Web Component
  api-client/             # generated or schema-derived typed HTTP client
  shared/                 # domain schemas, event types, and shared utilities
examples/
  vanilla/
  react/
  vue/
  svelte/
deploy/
  docker/
  compose/
  helm/                   # later, only when demanded
docs/
```

The confirmed public npm package names are:

- `@ventus-software-solutions/feedback-contracts`
- `@ventus-software-solutions/feedback-browser`
- `@ventus-software-solutions/feedback-widget`
- `@ventus-software-solutions/feedback-react`
- `@ventus-software-solutions/feedback-api-client`
- `@ventus-software-solutions/feedback-mcp`

# Phase 0: Product, legal, and repository decisions

These decisions block a responsible public release.

## 0.1 Product decisions

- [ ] Confirm the public product name: `Ventus In-App Feedback` or a shorter standalone name.
- [x] Confirm the `@ventus-software-solutions` npm organization scope.
- [x] Confirm the public source repository organization and final repository URL.
- [ ] Decide whether the first release includes only the SDK or SDK plus backend.
- [ ] Define supported browsers and the minimum browser versions.
- [ ] Define supported Node.js versions for build tooling and backend services.
- [ ] Decide whether Internet Explorer and legacy browsers are explicitly unsupported.

## 0.2 Licensing and contribution model

- [ ] Obtain legal review of the proposed licensing model.
- [x] License the browser, UI, contract, API-client, and MCP integration packages under MIT.
- [x] License the self-hosted API under BSL 1.1 with a limited-production Additional Use Grant.
- [x] Require a commercial API license above the Additional Use Grant threshold.
- [ ] If dual licensing is retained, choose a contributor agreement that permits commercial relicensing.
- [x] Replace the legacy placeholder license path with the complete BSL 1.1 terms and project parameters.
- [x] Replace the current license summary with an unambiguous per-package licensing statement.
- [x] Add copyright notices for Ventus Software Solutions GmbH and 2026.
- [x] Add `CONTRIBUTING.md`.
- [ ] Add `CODE_OF_CONDUCT.md`.
- [x] Add `SECURITY.md` with a private vulnerability-reporting channel.
- [ ] Add a contributor license agreement or documented inbound contribution policy if required.
- [ ] Document which functionality, if any, belongs only to the managed/commercial offering.

## 0.3 Privacy decisions

- [ ] Define the default data-minimization policy.
- [ ] Decide which diagnostics are enabled by default.
- [ ] Decide which diagnostics require explicit reporter consent.
- [ ] Define the default retention period for feedback and attachments.
- [ ] Define how reporters can request export or deletion.
- [ ] Define treatment of IP addresses and request metadata.
- [ ] Document controller/processor responsibilities for self-hosted deployments.
- [x] Draft a privacy and security threat model for screenshots, logs, URLs, and browser metadata.

## Phase 0 exit criteria

- [ ] Package names, repository location, license model, supported runtimes, and privacy defaults are written down and approved.
- [x] No component license file remains a placeholder.
- [ ] The contribution model is compatible with the chosen commercial strategy.

---

# Phase 1: Establish the monorepo and engineering baseline

## 1.1 Workspace setup

- [x] Select a workspace/package manager (npm workspaces selected for the initial foundation).
- [x] Convert the repository into the agreed monorepo structure.
- [x] Move the existing capture core into `packages/browser` without changing behavior initially.
- [x] Add a root workspace configuration.
- [x] Add shared strict TypeScript configuration inherited by every workspace.
- [x] Add a consistent build tool for packages.
- [x] Add repository-wide ESLint and Prettier configuration.
- [x] Add root commands for build, test, type-check, lint, formatting, and the combined verification gate.
- [x] Add `.editorconfig` and appropriate ignore files.
- [x] Add a Node.js version declaration.
- [x] Add a workspace lockfile.
- [x] Require frozen-lockfile installs in CI.

## 1.2 Package metadata

- [x] Remove `private: true` only from packages intended for publication.
- [x] Keep applications and internal packages private.
- [ ] Add correct `repository`, `homepage`, `bugs`, `author`, and `funding` metadata.
- [x] Add explicit `publishConfig.access = "public"` to public scoped packages.
- [x] Export compiled `dist` files instead of raw source files.
- [x] Add explicit `types` and `import` export conditions; decide on `require` support later.
- [x] Add source maps to published artifacts.
- [x] Confirm the browser package's `files` allowlist with `npm pack --dry-run`.
- [ ] Ensure no credentials, local files, fixtures containing private data, or unnecessary artifacts are published.

## 1.3 Continuous integration

- [x] Add CI for clean install, formatting, linting, type-checking, unit tests, build, and package-content checks.
- [ ] Test on every supported Node.js version.
- [x] Add dependency update automation.
- [ ] Add dependency and secret scanning.
- [x] Add a pull-request template.
- [x] Add issue templates for bugs and feature/integration requests with a security redirect.
- [ ] Protect the default branch and require CI before merging.

## Phase 1 exit criteria

- [ ] A clean checkout installs and passes all root validation commands.
- [x] Every intended package builds independently.
- [x] `npm pack --dry-run` contains only the expected public artifacts.

---

# Phase 2: Harden the browser capture SDK

## 2.1 Type-safe public API

- [x] Convert the implementation to TypeScript or generate declarations from the same typed source.
- [x] Replace every public `any` with a stable type or `unknown` plus validation.
- [x] Define a versioned `FeedbackSubmission` schema.
- [x] Define versioned schemas for browser information, performance data, console entries, errors, and attachments.
- [x] Add a `schemaVersion` field to every submission.
- [x] Export public types from the package entry point.
- [x] Document which APIs are stable and which are experimental.
- [x] Add runtime schema validation at trust boundaries.

## 2.2 Capture lifecycle

- [x] Make repeated initialization idempotent.
- [x] Add `destroy()` or `dispose()`.
- [x] Restore original console methods during disposal.
- [x] Store stable references to error and rejection listeners so they can be removed.
- [x] Prevent multiple SDK instances from accidentally wrapping the console repeatedly.
- [x] Define behavior when multiple applications or widgets use different configuration.
- [ ] Add optional automatic initialization.
- [x] Keep all browser-global access SSR-safe.
- [ ] Test initialization and disposal across client-side navigation.

## 2.3 Console and error safety

- [x] Make console collection opt-in or explicitly document the chosen default.
- [x] Add allow/deny rules for console levels.
- [x] Add configurable per-entry and total payload limits.
- [x] Redact secrets from strings and serialized objects.
- [x] Include standard patterns for bearer tokens, API keys, authorization headers, cookies, and passwords.
- [x] Allow applications to supply additional redaction functions.
- [x] Prevent getters, proxies, and hostile objects from breaking serialization.
- [x] Avoid recording values from explicitly sensitive DOM elements.
- [x] Add tests for circular objects, errors, functions, BigInts, proxies, and very large inputs.

## 2.4 Action breadcrumbs and failed-request capture

These diagnostics materially improve reproduction and must remain configurable,
bounded, and privacy-safe.

- [x] Define a typed, versioned breadcrumb schema.
- [x] Capture bounded click breadcrumbs for buttons, links, and elements with button roles.
- [x] Capture bounded form-submit breadcrumbs without recording field values or keystrokes.
- [x] Capture SPA navigation through history changes and `popstate`.
- [x] Exclude the feedback widget and configured sensitive areas from breadcrumbs.
- [x] Sanitize breadcrumb labels and cap their length.
- [x] Normalize and redact breadcrumb URLs.
- [x] Define a typed, versioned failed-request schema.
- [x] Capture failed `fetch` requests without reading request or response bodies by default.
- [x] Capture failed `XMLHttpRequest` requests for Axios and legacy clients.
- [x] Store only method, sanitized URL/path, status, duration, and timestamp by default.
- [x] Strip query strings and fragments unless an explicit safe-query allowlist is configured.
- [x] Avoid recording authorization headers, request bodies, response bodies, and cookies.
- [x] Add an explicit hook/interceptor integration so hosts can report failures without global monkey-patching.
- [x] If global patches are supported, restore `fetch`, XHR methods, and history methods during disposal.
- [x] Prevent multiple SDK instances from stacking request/history patches.
- [x] Add ring-buffer limits and payload-size tests.
- [x] Test navigation, clicks, submits, fetch 4xx/5xx, XHR failure, network failure, and teardown.

## 2.5 Screenshot safety and reliability

- [x] Move screenshot functionality behind a separate import or lazy optional dependency.
- [x] Decide whether `html2canvas` is bundled, optional, or provided by the consumer.
- [x] Add selector-based screenshot exclusion.
- [x] Add automatic masking for password, payment, and explicitly sensitive fields.
- [x] Add a hook that lets applications mask domain-specific content before capture.
- [x] Ensure the feedback widget itself is excluded from screenshots.
- [ ] Handle cross-origin images and canvas restrictions predictably.
- [x] Add maximum dimensions and compressed-size limits.
- [x] Support configurable PNG/JPEG/WebP output where browsers permit it.
- [x] Require a clear user gesture for display-media capture.
- [ ] Normalize and localize user-facing permission errors.
- [ ] Test cancellation, permission denial, timeout, unsupported browsers, and empty blobs.
- [x] Evaluate `html2canvas-pro` for modern CSS color support against maintenance, license, bundle size, and compatibility requirements.
- [ ] Test viewport capture versus full-document capture on window-scrolling and nested-scroll-container layouts.
- [x] Make the capture region configurable rather than assuming one behavior works for every host application.

## 2.6 Browser metadata and performance

- [x] Review every collected browser field for necessity and privacy impact.
- [x] Avoid collecting high-entropy fingerprinting data unless explicitly enabled.
- [x] Normalize URLs and redact sensitive query parameters and fragments.
- [x] Make URL redaction configurable.
- [ ] Confirm deprecated browser APIs are handled safely.
- [x] Put performance capture behind explicit configuration.
- [x] Limit the size and precision of performance data.
- [x] Accept a host-provided build/release identifier so reports can be tied to the exact deployed revision.
- [x] Define generic `release`, `environment`, and `sourceApp` fields instead of assuming a monorepo build SHA.

## 2.7 Host-provided application context

The generic SDK should support host-provided application context without knowing
about any specific business domain.

- [x] Add a typed-safe `beforeSubmit` or `getContext` hook for host-provided context.
- [x] Put host context under a namespaced field such as `context.application`.
- [x] Apply runtime size limits and schema-safe serialization to host context.
- [x] Allow the host to redact or omit context per submission.
- [x] Document that domain data may contain personal or commercially sensitive information.
- [ ] Document a host adapter example without adding domain-specific concepts to the package.

## 2.8 Transport interface

- [x] Define a framework-neutral `FeedbackTransport` interface.
- [x] Implement the default HTTP transport.
- [x] Allow consumers to provide a custom transport.
- [x] Support cancellation through `AbortSignal`.
- [x] Define retry behavior and never retry non-idempotent requests blindly.
- [x] Add idempotency keys to submissions.
- [x] Define upload-progress events.
- [x] Define structured, actionable error types.
- [x] Ensure authentication configuration cannot accidentally leak into captured logs.
- [x] Support authenticated cookie/JWT submission without the SDK inspecting or persisting the credential.
- [ ] Document how a host transport can target an existing backend during migration.

## 2.9 SDK tests and documentation

- [x] Add unit tests for serialization, ring buffers, redaction, payload construction, and lifecycle behavior.
- [ ] Add browser tests in Chromium, Firefox, and WebKit where feasible.
- [x] Add SSR import tests.
- [ ] Add bundle-size checks.
- [ ] Add a minimal vanilla example.
- [x] Document basic capture, custom UI, redaction, consent, custom transport, and teardown.
- [x] Document all collected data fields.

## Phase 2 exit criteria

- [x] The SDK can initialize, collect approved diagnostics, create a validated payload, submit it, and fully dispose itself.
- [ ] Sensitive values are redacted by default according to the approved privacy policy.
- [ ] The package works under SSR and in the supported browser matrix.
- [x] Public types and runtime schemas agree.

---

# Phase 3: Build the framework-neutral widget

## 3.1 Web Component foundation

- [x] Implement a standards-based custom element.
- [x] Define attributes/properties for endpoint, project key, locale, theme, and capture options.
- [x] Define typed DOM events for open, close, submit, success, and error.
- [x] Use Shadow DOM unless accessibility or integration testing identifies a blocking issue.
- [x] Expose theme tokens through CSS custom properties.
- [x] Support custom trigger buttons and programmatic open/close methods.
- [x] Allow host applications to provide user and application context without placing secrets in markup.

## 3.2 Feedback flow

- [x] Implement feedback category selection.
- [x] Implement title and description fields.
- [x] Implement screenshot preview, removal, and recapture.
- [x] Show exactly which diagnostics will be submitted.
- [x] Allow the reporter to exclude optional diagnostic groups.
- [x] Implement upload progress, retry, success, and recoverable failure states.
- [x] Prevent duplicate submissions.
- [x] Preserve unsent text across recoverable failures.
- [x] Clear sensitive temporary data after success or cancellation.
- [x] Require a useful description and validate it before capture/upload work begins.
- [x] Derive the title from the first meaningful description line instead of collecting a separate title field.
- [x] Support entry classification such as `bug`, `feedback`, and `idea` without hardcoding a customer-specific taxonomy.
- [x] Support optional file attachments in addition to the automatic screenshot.
- [ ] Define configurable attachment types and size limits.
- [x] Automatically disable the automatic screenshot when a reporter selects their own image, unless they explicitly turn it back on.
- [ ] Support long-lived upload state for larger screen recordings without freezing the dialog.
- [x] Place the default trigger where it is unlikely to cover primary application actions; include right-edge vertical-tab placement as an option.

## 3.3 Screenshot annotation

Screenshot annotation is useful feedback functionality and should be implemented
as framework-neutral widget code.

- [ ] Define a versioned annotation shape schema using normalized image coordinates.
- [ ] Support at least freehand/line, arrow, rectangle, ellipse, and text annotations.
- [ ] Render annotations consistently in preview and the final uploaded image.
- [ ] Scale stroke widths and text so annotations remain readable at different image sizes.
- [ ] Support selecting, moving, editing, and removing annotations.
- [ ] Add undo/redo history.
- [ ] Add zoom, pan, fit-to-image, and reset controls.
- [ ] Replace browser prompts/confirms with accessible inline or modal interactions.
- [ ] Preserve feedback form state while the annotation editor is open.
- [ ] Avoid nested-dialog and z-index conflicts.
- [ ] Add defensive delete/clear-all confirmation behavior.
- [ ] Test annotations against large, portrait, landscape, and high-DPI screenshots.
- [ ] Test pointer, mouse, keyboard, and touch interaction.
- [ ] Decide whether annotations are flattened into the image, retained as structured metadata, or both.

## 3.4 Accessibility and localization

- [ ] Meet WCAG 2.2 AA for the primary flow.
- [x] Implement correct dialog semantics and accessible names.
- [x] Implement focus trapping through the native modal dialog and tested focus restoration.
- [ ] Support complete keyboard operation.
- [ ] Respect reduced-motion and contrast preferences.
- [x] Support right-to-left layout.
- [ ] Extract all user-facing text into locale resources.
- [x] Ship English as the baseline locale.
- [x] Add German if required for the initial Ventus applications.
- [ ] Document how consumers add or override translations.

## 3.5 Framework compatibility

- [x] Add vanilla usage example.
- [x] Add React example.
- [ ] Add Vue example without a Vue-specific package.
- [ ] Add Svelte example without a Svelte-specific package.
- [ ] Test event and property interoperability in each example.
- [ ] Document SSR/hydration behavior.

## 3.6 React wrapper

- [x] Implement a thin React component around the custom element.
- [x] Map custom events to typed callback props.
- [x] Forward refs and expose programmatic methods.
- [x] Avoid bundling React or duplicating widget logic.
- [x] Set React as a peer dependency with an intentional supported range.
- [ ] Test Strict Mode and server rendering. (Server rendering is covered; Strict Mode remains.)

## 3.7 In-repo dogfooding demo

The demo application is the first real consumer. It must exercise packages through public exports and documented configuration, never through private source imports.

- [x] Create `apps/demo` as a small standalone web application in the workspace.
- [ ] Keep the demo visually neutral so it tests the product rather than becoming a marketing site.
- [x] Consume the browser SDK only through its package entry point.
- [x] Consume the Web Component through its package entry point once implemented.
- [x] Consume the React wrapper through its package entry point once implemented.
- [ ] Prohibit imports from package `src/` directories with lint rules or workspace boundaries.
- [x] Run the demo against a mock/in-memory transport before the real backend exists.
- [x] Add a deliberate JavaScript error scenario.
- [x] Add an unhandled-rejection scenario.
- [ ] Add failed `fetch` and XHR scenarios.
- [ ] Add click, form-submit, and SPA-navigation breadcrumb scenarios.
- [ ] Add a nested scroll-container page to test viewport and full-document screenshots.
- [ ] Add modern CSS colors and effects to test screenshot compatibility.
- [x] Add sensitive inputs and elements to verify masking and redaction.
- [x] Add synthetic secrets in URLs and console values to verify redaction.
- [x] Add a circular console-value scenario.
- [ ] Add an oversized console-value scenario.
- [ ] Add custom host context through the public context hook.
- [ ] Exercise every supported screenshot annotation shape.
- [ ] Exercise user images, text attachments, and synthetic screen-recording files.
- [ ] Verify automatic screenshot disabling after selecting an image.
- [ ] Exercise light, dark, high-contrast, reduced-motion, mobile, and RTL modes.
- [ ] Add keyboard-only and screen-reader acceptance cases.
- [ ] Add success, offline, timeout, throttling, validation, authorization, and server-error states.
- [x] Display the sanitized submission payload in a developer-only inspector.
- [x] Never display or persist unredacted values in the inspector.
- [ ] Add a reset action that clears feedback, captures, object URLs, and mock state.
- [ ] Add automated browser tests for the primary demo scenarios.
- [ ] Include the demo build and browser smoke tests in CI.
- [ ] Deploy a public demo only after abuse controls and privacy behavior are reviewed.

## 3.8 Demo-to-real-backend progression

- [x] Define a mock transport implementing the same public contract as the HTTP transport.
- [ ] Add deterministic mock responses for success, validation, conflict, throttling, timeout, and server failure.
- [x] Keep mock submissions in memory or disposable browser storage only.
- [x] Switch the local dogfooding demo to the real backend once Phase 5 is usable, with an explicit mock fallback.
- [ ] Run the same transport contract suite against mock and real implementations.
- [ ] Connect the demo to the MCP server once Phase 7 is usable.
- [ ] Demonstrate submit, search, claim, comment, resolve, verify, and close end to end.
- [ ] Retain failure-scenario routes as permanent regression fixtures.

## 3.9 Public showcase and hosting

The preferred target is the existing Cloudflare-compatible Sites/Pages path on
a Ventus subdomain such as `inapp-feedback.ventus.works`. It matches the current
Vinext output, supports a company-owned URL, and can remain a static simulation.
GitHub stays the source and CI system. GitHub Pages is the fallback for a purely
repository-hosted artifact; Vercel is not the default because a GmbH deployment
requires a commercial plan and the repository has no Vercel-specific advantage.

The public showcase is not a hosted Ventus backend and must never imply that
reports are persisted, processed by a real agent, or sent to Ventus.

- [ ] Create a dedicated static showcase entry point rather than forcing the SSR-capable local dogfooding app into a Pages build.
- [ ] Reuse the published browser SDK, Web Component, React wrapper, brand attribution, and visual language through public package exports.
- [ ] Add a prominent notice that the showcase uses synthetic data and that nothing is uploaded or saved.
- [ ] Keep all submissions in memory and clear them on refresh; do not use project keys, service tokens, cookies, analytics, or remote API calls.
- [ ] Let visitors open the widget, choose bug/feedback/idea, toggle diagnostic groups, capture a locally generated masked screenshot, and inspect the sanitized structured payload.
- [ ] Add a simulated agent timeline showing search, claim, comment, evidence, resolve, verify, close, and reopen without presenting simulated actions as real automation.
- [ ] Show the simulated backend record and sanitized JSON beside the reporter UI, with a synthetic feedback ID and explicit copy explaining that a real deployment stores it in the user's self-hosted backend.
- [ ] Animate representative MCP calls such as `search_feedback`, `claim_feedback`, `comment_feedback`, `add_feedback_evidence`, `resolve_feedback`, and `close_feedback`, with pause, manual-step, reopen, and reset controls.
- [ ] Keep a persistent `Simulation — nothing is uploaded or saved` indicator visible throughout the workflow and respect reduced-motion preferences.
- [ ] Include concise links to installation, the one-command local stack, agent/MCP documentation, licensing, and the source repository.
- [ ] Use a Ventus-owned canonical URL and include visible links back to `ventus.works`, installation docs, licensing, and the source repository.
- [ ] Add a public-showcase build mode with no server-only data path and no dependency on a running feedback API.
- [ ] Add a pull-request build check before enabling deployment.
- [ ] Add a dedicated deployment workflow for the selected Sites/Pages target, with actions pinned to reviewed commit SHAs and deployment restricted to `main`.
- [ ] Add automated checks proving the published bundle contains no API endpoint, project key, agent token, real report data, or network submission path.
- [ ] Complete keyboard, mobile, WCAG 2.2 AA, reduced-motion, screenshot-masking, and privacy-copy review before the first public deployment.
- [ ] Configure the Ventus custom domain only after the showcase artifact and privacy gates pass.
- [ ] Keep a documented GitHub Pages fallback that supports `/ventus-inapp-feedback/` if the preferred target becomes unavailable.
- [ ] Keep the static build base-path-safe and provide a manually triggerable GitHub Pages deployment workflow so the fallback is continuously testable rather than theoretical.

### Public showcase acceptance

- [ ] A visitor can understand the reporter-to-agent workflow without documentation or a running backend.
- [ ] Every interaction works from the canonical public URL on a fresh browser session.
- [ ] Refreshing removes every synthetic report and local artifact.
- [ ] Browser network inspection shows no feedback submission or user-data collection.
- [ ] The page clearly distinguishes the interactive simulation from the self-hosted product.
- [ ] The showcase build and deployment are reproducible from the default branch.

## Phase 3 exit criteria

- [ ] The same widget implementation runs in vanilla, React, Vue, and Svelte examples.
- [ ] The primary submission flow passes accessibility checks and manual keyboard testing.
- [ ] Styling can be customized without forking the component.
- [ ] The demo consumes only public package interfaces and passes its browser acceptance suite.
- [ ] Privacy, diagnostics, annotation, attachment, failure, and accessibility scenarios are reproducible in the demo.

---

# Phase 4: Define the backend domain and API contract

This phase defines the contract before substantial server implementation.

## 4.1 Domain model

- [x] Define `Workspace` or `Organization`.
- [x] Define `Project` and environment identifiers.
- [x] Define `Feedback`.
- [x] Define `Attachment`.
- [x] Define append-only `FeedbackEvent` records.
- [x] Define `Comment`.
- [x] Define `Claim` with owner, lease expiry, and renewal timestamps.
- [x] Define external links for commits, pull requests, issues, deployments, and other references.
- [x] Define actor types: reporter, user, service account, agent, and system.
- [x] Define soft deletion and retention metadata.
- [x] Decide whether anonymous reporters can receive follow-up links or tokens.
- [x] Define entry type/category separately from workflow status.
- [x] Define triage priority including an explicit untriaged/unset value.
- [x] Define bounded, normalized labels.
- [x] Define release/build/environment metadata.
- [x] Define append-only evidence/addenda for regressions and reopened reports.

## 4.2 State machine

- [x] Adopt or revise the proposed states: `new`, `triaged`, `in_progress`, `resolved`, `closed`, `rejected`, `reopened`.
- [x] Document allowed transitions.
- [x] Define required permission scopes for each transition.
- [x] Define required fields for resolution, rejection, closure, and reopening.
- [x] Decide who may close feedback: reporter, human triager, automation, or agent.
- [x] Decide what happens when a resolved item fails verification.
- [x] Ensure every transition writes an audit event.
- [x] Use stable generic resolution reasons (`wont_do`, `already_done`, `not_relevant`, `duplicate`) rather than multiplying top-level states unnecessarily.
- [x] Preserve reopen history, previous status, actor, note, and optional new evidence.

## 4.3 API conventions

- [x] Use `/v1` API versioning.
- [x] Define a consistent JSON error envelope.
- [x] Define cursor-based pagination.
- [x] Define filtering and sort conventions.
- [x] Define idempotency-key behavior.
- [x] Define optimistic concurrency using a version field or HTTP `ETag`/`If-Match`.
- [x] Define request and response size limits.
- [x] Define timestamp, identifier, and enum conventions.
- [x] Define API deprecation and compatibility policy.
- [x] Publish an OpenAPI document.
- [x] Generate or validate the TypeScript API client from the contract.

## 4.4 Proposed endpoints

- [x] `POST /v1/feedback`
- [x] `GET /v1/feedback`
- [x] `GET /v1/feedback/{id}`
- [x] `PATCH /v1/feedback/{id}` for limited metadata updates.
- [x] `POST /v1/feedback/{id}/comments`
- [x] `POST /v1/feedback/{id}/claim`
- [x] `POST /v1/feedback/{id}/claim/renew`
- [x] `DELETE /v1/feedback/{id}/claim`
- [x] `POST /v1/feedback/{id}/resolve`
- [x] `POST /v1/feedback/{id}/close`
- [x] `POST /v1/feedback/{id}/reopen`
- [x] `POST /v1/feedback/{id}/reject`
- [x] `POST /v1/feedback/{id}/evidence` or an equivalent addendum endpoint.
- [x] `GET /v1/feedback/{id}/events`
- [x] Define attachment upload and download endpoints.
- [x] Define health, readiness, and version endpoints.

## 4.5 Attachment strategy

- [x] Choose multipart upload or an upload-session/presigned-URL flow for the first release.
- [x] Store metadata in PostgreSQL and binary data in S3-compatible storage.
- [x] Validate MIME types using file content, not only request headers.
- [x] Enforce per-file and per-submission limits.
- [x] Generate non-guessable object keys.
- [x] Define malware-scanning hooks.
- [x] Define image metadata stripping and optional image recompression.
- [x] Use short-lived authorized download URLs.
- [x] Define orphaned-upload cleanup.

## Phase 4 exit criteria

- [ ] The domain model, state machine, permissions, OpenAPI contract, and attachment flow have been reviewed before server implementation.
- [x] Representative browser, human, integration, and agent workflows can all be expressed through the API.

---

# Phase 5: Implement the self-hosted backend

## 5.1 Service foundation

- [x] Select the TypeScript server framework.
- [x] Implement validated configuration loading.
- [x] Implement structured logging with automatic secret redaction.
- [x] Add request IDs and trace/correlation IDs.
- [x] Implement graceful startup and shutdown.
- [x] Add liveness and readiness endpoints.
- [x] Report the running application and schema versions.
- [x] Add database migrations.
- [x] Add development seed data.

## 5.2 Persistence

- [x] Implement the PostgreSQL schema.
- [x] Add appropriate indexes for status, project, creation time, priority, and claim queries.
- [x] Enforce foreign keys and uniqueness constraints.
- [x] Implement append-only audit events.
- [x] Implement optimistic concurrency.
- [x] Implement claim acquisition, renewal, release, and expiry atomically.
- [x] Add a bounded, dry-run-safe data-retention cleanup command with grace-period purge and audit pseudonymization.
- [ ] Test migrations up and down according to the migration policy.
- [ ] Provide an import path for legacy file-backed `report.json` folders and archives.
- [ ] Preserve original IDs, timestamps, build SHAs, status, notes, attachments, and reopen addenda during import.

## 5.3 Authentication and authorization

- [x] Implement restricted browser ingestion keys.
- [x] Add allowed-origin configuration per project.
- [x] Implement user or operator authentication.
- [x] Implement service-account authentication.
- [x] Define and enforce scopes: `feedback:submit`, `feedback:read`, `feedback:triage`, `feedback:comment`, `feedback:resolve`, `feedback:close`, and `feedback:admin`.
- [x] Enforce project/workspace isolation in every query and mutation.
- [ ] Add key rotation and revocation.
- [x] Ensure browser credentials cannot read feedback or administrative data.
- [x] Add authorization tests for cross-project and cross-workspace access.

## 5.4 Abuse protection and security

- [x] Add request and upload size limits.
- [x] Add project- and IP-aware rate limiting with proxy-safe configuration.
- [ ] Add optional bot-protection integration points.
- [ ] Add CSRF protection where cookie authentication is used.
- [x] Define CORS explicitly.
- [x] Add secure response headers.
- [ ] Prevent SSRF through attachment or integration URLs.
- [ ] Sanitize rendered reporter content.
- [x] Ensure logs never include access tokens, cookies, raw console contents, or attachment data.
- [x] Add a backup and recovery guide.
- [x] Document the current threat model; independent review remains required before public hosting.

## 5.5 Event delivery and integrations

- [ ] Define domain event names such as `feedback.created`, `feedback.updated`, `feedback.claimed`, `feedback.resolved`, `feedback.closed`, and `feedback.reopened`.
- [ ] Implement reliable event persistence before delivery.
- [ ] Implement signed webhooks.
- [ ] Implement webhook retries with backoff and a dead-letter state.
- [ ] Expose webhook delivery history without exposing secrets.
- [ ] Add event deduplication identifiers.
- [ ] Defer GitHub, Linear, Jira, Slack, and email integrations until the generic event model is stable.
- [ ] Treat admin notifications as an integration/event consumer rather than core feedback-domain logic.

## 5.6 Tests

- [x] Add domain and state-transition unit tests.
- [x] Add API integration tests against PostgreSQL and object storage.
- [x] Add authorization and tenant-isolation tests.
- [x] Add a real PostgreSQL concurrent-claim smoke test; broader concurrent update/load coverage remains open.
- [x] Add idempotency tests.
- [x] Add attachment security tests.
- [ ] Add webhook signature and retry tests.
- [ ] Add migration tests from every supported release.
- [ ] Add load tests for submission bursts and backlog searches.

## Phase 5 exit criteria

- [x] A browser can securely submit feedback and attachments.
- [x] Authorized users can search, triage, claim, comment, resolve, close, and reopen feedback.
- [x] Concurrent workers cannot silently overwrite state or hold permanent claims.
- [x] Every material mutation is auditable.

---

# Phase 6: Package and deploy the backend

## 6.1 Container image

- [x] Create a minimal multi-stage Docker build.
- [x] Run as a non-root user.
- [x] Pin base images intentionally and automate security updates.
- [ ] Add OCI labels for source, version, license, and revision.
- [ ] Publish multi-architecture images where feasible.
- [ ] Generate an SBOM.
- [ ] Sign images and publish provenance.
- [ ] Scan release images for known vulnerabilities.
- [x] Document upgrade and rollback procedures.

## 6.2 Docker Compose quickstart

- [x] Provide a Compose stack with the Ventus server, PostgreSQL, and MinIO or compatible local storage.
- [x] Provide a safe `.env.example` without real secrets.
- [x] Add an initialization path for the first workspace, project, and operator.
- [x] Add persistent volumes.
- [x] Add health checks and startup dependencies.
- [ ] Document local TLS/reverse-proxy expectations.
- [ ] Verify the quickstart from a clean machine.

## 6.3 Production operations

- [x] Document PostgreSQL and object-storage requirements.
- [x] Document horizontal-scaling behavior.
- [x] Document migration execution in multi-instance deployments.
- [ ] Define metrics for request latency, errors, upload failures, queue depth, claims, and webhook delivery.
- [ ] Add OpenTelemetry support or clearly documented observability hooks.
- [x] Document backup, restore, disaster-recovery, and retention cleanup procedures.
- [x] Document secrets management and key rotation.
- [ ] Add Helm packaging only after the container and Compose contract are stable.

## Phase 6 exit criteria

- [ ] A new user can launch a functioning self-hosted instance using the documented quickstart.
- [ ] A production operator has documented upgrade, backup, restore, monitoring, and rollback procedures.

---

# Phase 7: Build the agent-facing MCP server

The MCP server is an adapter over the HTTP API. It must not bypass API authorization or access the database directly.

## 7.1 MCP foundation

- [x] Use an official maintained MCP SDK.
- [ ] Expose Streamable HTTP at a stable `/mcp` endpoint.
- [x] Give the server a stable name and semantic version.
- [x] Add concise server instructions describing the required claim-before-update workflow.
- [x] Reuse the API's authentication and authorization model.
- [ ] Support OAuth for user-delegated remote access if required.
- [x] Support service credentials for controlled automation if required.
- [ ] Add request correlation between MCP calls and HTTP API calls.

## 7.2 MCP tools

- [x] Implement `search_feedback` with filters, pagination, and stable IDs.
- [x] Implement `get_feedback` with sanitized diagnostic and attachment metadata.
- [x] Implement `claim_feedback` with a requested lease duration.
- [x] Implement `renew_feedback_claim`.
- [x] Implement `release_feedback` (published as `release_feedback_claim`).
- [x] Implement `add_feedback_comment` (published as `comment_feedback`).
- [x] Implement `set_feedback_priority` through `update_feedback`.
- [x] Implement change links as part of `resolve_feedback`.
- [x] Implement `mark_feedback_resolved` (published as `resolve_feedback`) with required summary; evidence can be appended separately.
- [x] Implement `close_feedback` with required closure reason and appropriate permission.
- [x] Implement `reopen_feedback` with required reason.
- [x] Do not expose permanent deletion to agents in the initial release.

## 7.3 Tool design and safety

- [x] Give every tool a narrow, action-oriented purpose.
- [x] Define explicit input and structured output schemas.
- [x] Return stable feedback and event identifiers in structured results.
- [x] Mark search/get tools read-only.
- [x] Mark state-changing tools accurately as writes.
- [ ] Mark irreversible operations destructive if any are added later.
- [x] Never return credentials or unnecessary personal data.
- [x] Require expected record version for mutations.
- [x] Require idempotency keys for retried writes and persist the response atomically with PostgreSQL mutations.
- [x] Return actionable conflict information when another actor changed or claimed a record.
- [x] Enforce authorization in the backend, regardless of tool annotations or model behavior.

## 7.4 Agent workflow

- [x] Document the default sequence: search, get, claim, investigate, comment, link change, resolve, release.
- [x] Define the default claim lease duration.
- [x] Define lease renewal behavior for long-running work.
- [x] Define how abandoned leases expire.
- [x] Define whether agents may close feedback or only resolve it.
- [ ] Define minimum verification evidence required to resolve an item.
- [ ] Record agent/client/run identifiers in audit events.
- [ ] Preserve human comments and decisions as authoritative context.
- [x] Require an explicit reason to reject, close, or reopen feedback.
- [ ] Preserve the distinction between customer intake and the agent's internal task queue.
- [ ] Keep feedback as immutable intake/evidence while allowing an external adapter to create repository-native work items.

## 7.5 Triggering agent work

- [x] Support manual backlog processing through `search_feedback`.
- [ ] Emit `feedback.created` events for webhook or queue-driven automation.
- [ ] Provide an example worker that consumes events and starts an agent task without embedding a specific agent provider in the core server.
- [ ] Deduplicate delivery and task creation.
- [ ] Define retry and dead-letter behavior.
- [ ] Avoid continuous aggressive polling as the primary integration model.
- [ ] Provide a generic CLI command that syncs unprocessed feedback into a repository task adapter idempotently.
- [ ] Store the originating feedback ID and an immutable feedback snapshot with the created task.
- [ ] Ensure repeated sync runs never duplicate a task.
- [ ] Allow repository-specific task frontmatter/templates to be configured outside the core server.

## 7.6 MCP testing

- [x] Test protocol initialization and tool discovery with the official in-memory MCP client; Inspector/manual client validation remains outstanding.
- [ ] Test every tool with valid, invalid, unauthorized, stale-version, and cross-tenant inputs.
- [x] Test conflicting agent claims through the real API/Compose smoke flow.
- [x] Test exact retries and changed-input key conflicts in memory and through the real PostgreSQL Compose smoke flow.
- [ ] Test expired claims.
- [ ] Test that read-only clients cannot call mutation endpoints successfully.
- [ ] Connect a real Codex client and run an evaluation set.
- [ ] Include direct, indirect, ambiguous, adversarial, and out-of-scope requests in the evaluation set.
- [ ] Verify agents do not close or reject records without the required evidence and permissions.

## Phase 7 exit criteria

- [ ] An authorized agent can safely process a feedback item end to end through MCP.
- [ ] Two agents cannot unknowingly own or overwrite the same work.
- [ ] Human operators can reconstruct every agent action from the audit trail.
- [ ] Tool names and schemas have passed compatibility review before `1.0`.

---

# Phase 8: Documentation and examples

## 8.1 User documentation

- [ ] Write a five-minute SDK quickstart.
- [ ] Write a widget installation and theming guide.
- [ ] Write a custom-UI/headless SDK guide.
- [ ] Write React integration guidance.
- [ ] Write framework-neutral Vue and Svelte examples.
- [ ] Document all capture options and defaults.
- [ ] Document exactly what data is collected.
- [ ] Document consent and redaction configuration.
- [ ] Document CSP requirements.
- [ ] Document browser support and known screenshot limitations.
- [ ] Document breadcrumbs, failed-request capture, build metadata, and host-provided context.
- [ ] Document screenshot annotation and attachment behavior.

## 8.2 Server documentation

- [x] Write a Docker Compose quickstart.
- [ ] Document every environment variable.
- [ ] Document database, object-storage, reverse-proxy, and TLS requirements.
- [ ] Document authentication and permission scopes.
- [ ] Publish the OpenAPI reference.
- [ ] Document webhook signatures and retries.
- [ ] Document upgrades, backups, restores, retention, and deletion.
- [ ] Document production hardening.

## 8.3 Agent documentation

- [ ] Write a Codex MCP setup guide (generic stdio configuration is documented).
- [ ] Document OAuth and service-account configuration.
- [x] Document the claim/lease lifecycle.
- [ ] Document resolution versus closure.
- [ ] Provide safe example prompts for triaging and resolving feedback.
- [ ] Provide an example `AGENTS.md` policy for projects using Ventus feedback.
- [ ] Document tool permission recommendations for read-only, triage, resolver, and administrator roles.
- [ ] Document how to investigate failed or conflicting tool calls.

## 8.4 Maintainer documentation

- [ ] Document the repository architecture.
- [ ] Document local development and test commands.
- [ ] Document database and API compatibility policies.
- [ ] Document the release process.
- [ ] Document security response and supported-version policy.
- [ ] Add an architectural decision record template.

## Phase 8 exit criteria

- [ ] A new SDK user, self-hosting operator, agent integrator, and contributor can each complete their primary workflow using only public documentation.

---

# Phase 9: Release engineering

## 9.1 Versioning and change management

- [ ] Adopt semantic versioning for public packages and APIs.
- [ ] Decide whether all packages share one version or are independently versioned.
- [ ] Add Changesets or an equivalent reviewed change-log mechanism.
- [ ] Define breaking-change rules for SDK types, HTTP endpoints, events, database migrations, MCP tools, and container configuration.
- [ ] Maintain `CHANGELOG.md` files or generated release notes.
- [ ] Use release candidates before stable releases.
- [ ] Define the supported-version and security-patch policy.

## 9.2 npm publishing

- [x] Reserve or create the npm organization scope.
- [ ] Publish initial packages manually or as staged releases to establish ownership.
- [ ] Configure npm trusted publishing with OIDC.
- [ ] Publish from protected release tags or approved release environments.
- [ ] Generate provenance for public packages.
- [x] Require builds, tests, package inspection, and license checks before publishing.
- [x] Add an idempotent package-set publisher that validates matching versions, release tags, prerelease channels, internal dependencies, and publication order.
- [ ] Verify package installation from npm in clean example projects.
- [ ] Revoke unnecessary long-lived npm write tokens after trusted publishing works.

## 9.3 Container and source releases

- [ ] Publish versioned and immutable container tags.
- [ ] Keep `latest` informational rather than the only documented deployment tag.
- [ ] Publish checksums, SBOMs, signatures, and provenance.
- [ ] Create matching source releases and Git tags.
- [ ] Attach migration and upgrade notes to every server release.
- [ ] Test upgrade from the previous supported release before publishing.

## 9.4 Release gates

- [ ] All CI checks pass from a clean checkout.
- [ ] Package and image contents have been inspected.
- [ ] No placeholder licenses, secrets, private URLs, or private customer data are present.
- [ ] Database migration and rollback/forward-recovery paths have been tested.
- [ ] Browser compatibility tests pass.
- [ ] Accessibility checks pass.
- [ ] Threat model and release security checklist have been reviewed.
- [ ] Documentation matches the released configuration and API.

---

# Phase 10: Ecosystem work

This phase follows a successful self-hosted release and should not block the
core public product.

## 10.1 Integrations

- [ ] Prioritize integrations based on user demand.
- [ ] Add GitHub Issues and pull-request linking.
- [ ] Add Linear issue synchronization.
- [ ] Add Jira issue synchronization.
- [ ] Add Slack or Teams notifications.
- [ ] Add email follow-up for reporters where consent and identity permit it.
- [ ] Keep integration state and failures visible in the audit/event model.

## 10.2 Future SDKs and interfaces

- [ ] Evaluate native mobile SDKs based on demand.
- [ ] Evaluate a browser extension for internal dogfooding.
- [ ] Evaluate a lightweight administrative UI.
- [ ] Add framework wrappers only where the Web Component creates proven friction.
- [ ] Evaluate Kubernetes/Helm support based on operator demand.

---

# Phase 11: External dogfooding and migration adapters

This phase starts only after the in-repo demo has validated the public package
boundaries and core workflows. External integrations should adopt versioned
releases through thin host adapters, with reversible rollout steps.

## 11.1 Establish reusable compatibility fixtures

- [ ] Add synthetic payload fixtures for representative browser applications.
- [ ] Cover breadcrumbs, failed requests, browser errors, performance data, release identifiers, and host context.
- [ ] Cover screenshots, user images, text attachments, and screen-recording metadata.
- [ ] Cover legacy reports, reopened reports, and multiple evidence addenda.
- [ ] Add contract tests proving supported legacy payloads can be imported safely.
- [ ] Ensure fixtures contain no personal data, credentials, or private URLs.

## 11.2 Dogfood the capture SDK and universal widget

- [ ] Publish an SDK prerelease suitable for external dogfooding.
- [ ] Require the in-repo demo acceptance gates to pass for that exact prerelease.
- [ ] Install through a versioned registry release, not copied source or a long-lived local link.
- [ ] Keep application-specific authentication, context, feature flags, and theming in thin host adapters.
- [ ] Start with one reversible integration behind a feature flag.
- [ ] Verify capture, redaction, screenshots, annotations, attachments, teardown, localization, accessibility, and payload compatibility.
- [ ] Collect dogfooding feedback through the widget itself.
- [ ] Expand rollout only after a successful soak period.

## 11.3 Dogfood the agent workflow

- [ ] Connect the generic CLI or MCP server in read-only mode first.
- [ ] Verify `search_feedback` and `get_feedback` before enabling mutations.
- [ ] Prove repository-task synchronization is idempotent.
- [ ] Enable claim, comment, resolve, close, and reopen operations incrementally.
- [ ] Preserve explicit human approval where the configured workflow requires it.
- [ ] Retire legacy state-mutation tooling only after API/MCP parity and auditability are proven.

## 11.4 Migrate legacy backend data when required

- [ ] Choose a compatibility adapter, short dual-write period, or direct cutover based on migration risk.
- [ ] Export and import legacy reports with count, hash, attachment, and metadata reconciliation.
- [ ] Preserve original IDs, timestamps, statuses, evidence, and task links.
- [ ] Verify authentication, project routing, CORS, rate limits, upload limits, and attachment downloads.
- [ ] Run old and new list/detail results side by side during the acceptance window.
- [ ] Define rollback steps and retain the old data read-only until migration acceptance.

## 11.5 Dogfooding telemetry and acceptance

- [ ] Measure SDK initialization, capture, upload, and submission failures without collecting report contents.
- [ ] Record package and server versions on every submission.
- [ ] Separate product-package defects from host-application defects with labels.
- [ ] Add a demo scenario or package-level regression test for every generic defect discovered.
- [ ] Document rollback steps and pin exact package versions during rollout.

## Phase 11 exit criteria

- [ ] External consumers use released packages with thin host adapters.
- [ ] Agent workflows operate through the generic API/MCP boundary.
- [ ] Legacy history, attachments, dispositions, and reopen evidence survive any migration.
- [ ] Generic regressions discovered through dogfooding have corresponding automated coverage.

---

# Cross-cutting quality checklists

## Security checklist

- [ ] Secrets are never accepted in ordinary feedback fields by design.
- [ ] Known secret patterns are redacted in the browser and again on the server.
- [ ] URLs have sensitive query parameters and fragments removed.
- [ ] Screenshots mask configured sensitive elements.
- [ ] Attachments have strict type and size validation.
- [ ] Tenant and project boundaries are tested.
- [ ] Mutating operations are authorized and audited.
- [ ] Agent permissions follow least privilege.
- [ ] Logs contain identifiers and diagnostics necessary for operations, but not feedback bodies or credentials.
- [ ] Dependencies, packages, and images are scanned and have provenance.

## Privacy checklist

- [ ] Reporters see what will be collected before submission.
- [ ] Optional diagnostic groups can be removed.
- [ ] Collection defaults match the documented privacy policy.
- [ ] Retention and deletion are configurable and enforced.
- [ ] Self-hosted operators can locate, export, and delete a reporter's data.
- [ ] Managed-service legal documentation reflects actual processing.
- [ ] Test fixtures contain synthetic data only.

## Accessibility checklist

- [ ] Primary widget flow is keyboard operable.
- [ ] Focus behavior is predictable.
- [ ] Status and error changes are announced appropriately.
- [ ] Color is not the sole carrier of meaning.
- [ ] Contrast meets WCAG 2.2 AA.
- [ ] Zoom, reduced motion, screen readers, and RTL layouts are tested.

## Compatibility checklist

- [ ] Browser package imports safely during SSR.
- [ ] Widget works in vanilla, React, Vue, and Svelte examples.
- [ ] React wrapper does not contain duplicated widget behavior.
- [ ] HTTP and MCP contracts remain backward compatible within a major version.
- [ ] Database migrations support the documented upgrade window.

---

# Proposed milestone sequence

## Milestone 0.1: Safe capture SDK

- Repository and legal baseline.
- Typed browser SDK.
- Lifecycle cleanup.
- Redaction and privacy controls.
- Transport interface.
- Tests and vanilla example.
- Synthetic compatibility fixtures and capture-store comparison.
- In-repo demo using the public browser-package API with a mock transport.

## Milestone 0.2: Universal widget

- Web Component.
- Theming and localization.
- Accessibility.
- React wrapper.
- Vanilla, React, Vue, and Svelte examples.
- Screenshot annotations and attachment UX proven through dogfooding.
- In-repo demo exercising the widget, React wrapper, accessibility modes, and failure scenarios.

## Milestone 0.3: Self-hosted platform

- Stable domain and OpenAPI contract.
- PostgreSQL and S3-compatible attachments.
- Authentication, authorization, audit events, claims, and state transitions.
- Docker image and Compose quickstart.

## Milestone 0.4: Agent workflow

- MCP server.
- Search, get, claim, comment, link, resolve, close, and reopen tools.
- Concurrency controls and expiring leases.
- Codex integration guide and evaluation suite.
- Generic repository-task adapter demonstrated with a documented example format.
- End-to-end demo flow from submission through agent resolution and verified closure.

## Milestone 0.5: Ecosystem beta

- Webhooks.
- First external integration.
- Release automation and provenance.
- Operational hardening based on self-hosted usage.

## Milestone 1.0: Stable public release

- Stable SDK, HTTP API, event, and MCP compatibility policies.
- Reviewed licensing and privacy documentation.
- Production deployment and upgrade documentation.
- Security, accessibility, browser, concurrency, and agent workflow test gates.

---

# Immediate next tasks

Work through these before beginning Phase 1 implementation:

1. [x] Choose the license split for integration packages and the backend.
2. [x] Confirm the npm scope and public repository location.
3. [ ] Confirm the first public milestone is the safe browser SDK (`0.1`).
4. [ ] Approve the default data collected by the SDK.
5. [x] Approve the proposed monorepo and package names.
6. [x] Select the package manager and supported Node.js versions.
7. [x] Replace placeholder component license files.
8. [x] Create the first architectural decision record for the canonical HTTP API plus MCP-adapter approach.
9. [ ] Create a detailed compatibility matrix for representative integration patterns.
10. [ ] Add synthetic contract fixtures for supported payload versions.
11. [x] Approve the in-repo demo as the first dogfooding consumer.
12. [x] Choose the minimal demo stack and mock-transport implementation during Phase 1 planning.
13. [ ] Define the first demo acceptance scenarios for capture, redaction, screenshots, annotations, attachments, and failures.
14. [x] Defer external consumer selection until the demo and first prerelease are stable.

---

# Decision log

Record accepted decisions here so implementation work does not repeatedly reopen them.

| Date       | Decision                                                          | Status                            | Rationale / notes                                                                                                                                                                                                                                                                           |
| ---------- | ----------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-02 | Use a headless browser SDK plus a framework-neutral Web Component | Confirmed; implemented            | Prevents duplicated UI implementations across frameworks.                                                                                                                                                                                                                                   |
| 2026-08-02 | Provide React as a thin wrapper only                              | Confirmed; implemented            | Improves React ergonomics without forking widget behavior.                                                                                                                                                                                                                                  |
| 2026-08-02 | Make the HTTP API the canonical business interface                | Confirmed; implemented            | Keeps browser, human, integration, and agent workflows consistent. See ADR 0001.                                                                                                                                                                                                            |
| 2026-08-02 | Implement MCP as an authorized adapter over the HTTP API          | Confirmed; stdio implemented      | Gives agents typed tools without bypassing domain or security rules.                                                                                                                                                                                                                        |
| 2026-08-02 | Use PostgreSQL and S3-compatible object storage                   | Confirmed; implemented            | Separates relational workflow data from large binary attachments.                                                                                                                                                                                                                           |
| 2026-08-02 | Distinguish `resolved` from `closed`                              | Confirmed; implemented            | Lets an agent propose a verified fix while preserving final human/reporter closure.                                                                                                                                                                                                         |
| 2026-08-02 | Use expiring claims and optimistic concurrency                    | Confirmed; implemented            | Prevents silent conflicts and permanently abandoned agent work.                                                                                                                                                                                                                             |
| 2026-08-02 | License integration packages under MIT and the API under BSL 1.1  | Confirmed; legal review required  | Keeps SDK, UI, client, and MCP adoption frictionless; permits API production use through 1,000 aggregate feedback submissions per calendar month and requires commercial terms after three consecutive months above the threshold. Each API version changes to Apache-2.0 after four years. |
| 2026-08-02 | Use an in-repo demo as the first dogfooding consumer              | Confirmed; foundation implemented | Validates public package boundaries and failure scenarios without risking a customer application or coupling early APIs to a specific host.                                                                                                                                                 |
| 2026-08-02 | Use npm workspaces for the initial monorepo foundation            | Confirmed; implemented            | Reuses the demo scaffold's npm workflow and keeps the first slice small; package-manager migration remains possible before public release.                                                                                                                                                  |
| 2026-08-02 | Use Cloudflare-backed Sites/Pages for the static public showcase  | Proposed                          | Matches the existing Vinext/Worker-compatible build, supports a Ventus-owned domain, and demonstrates the widget and simulated agent workflow without operating or implying a hosted backend. GitHub Pages remains the fallback.                                                            |

---

# Working notes

- Do not add a framework-specific package unless a real integration limitation cannot be solved with the Web Component or a small documented adapter.
- Do not let the MCP server acquire separate business logic or direct database access.
- Do not allow release pressure to bypass privacy, redaction, authorization, migration, or audit requirements.
- Prefer a modular monolith until operating evidence justifies splitting services.
- Treat public package names, API paths, event names, and MCP tool schemas as long-lived compatibility commitments.
