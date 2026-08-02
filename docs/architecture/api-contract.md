# Backend contract decisions

Status: accepted for the pre-1.0 implementation. Breaking changes remain possible
until the first stable release, but every deployed API is namespaced under `/v1`.

## Workflow and actors

Feedback moves through `new`, `triaged`, `in_progress`, `resolved`, `closed`,
`rejected`, and `reopened`. Resolution is an implementation claim; closure is a
separate verification action. Agents normally receive read, comment, triage,
claim, and resolve scopes. They cannot close unless a service credential is
explicitly granted `feedback:close`.

Every mutation requires the current resource version through both `If-Match` and
the JSON body during the pre-1.0 period. A successful mutation increments the
version and appends an immutable event containing the actor, previous version,
new version, timestamp, and safe mutation data. Claim acquisition, renewal,
release, and expiry are atomic lease operations; a claim is not a lock and does
not bypass optimistic concurrency.

Anonymous reporters may request a follow-up token. The plaintext token is
returned once, only its digest is stored, and the token is scoped to reading and
reopening that report. It is not an account credential.

## API conventions

- Identifiers are opaque lowercase prefixed IDs; clients must not parse them.
- Timestamps are UTC RFC 3339 strings.
- Lists use opaque cursor pagination with a default of 25 and maximum of 100.
- Filters are ANDed across fields and ORed within repeated values of one field.
- POST ingestion requires an idempotency key. Reusing a key with different input
  produces `409 conflict`; an identical replay returns the original result.
- Error responses use the shared `{ error: { code, message, requestId, details } }`
  envelope and never include stack traces.
- Feedback resources carry an integer `version` and an `ETag` derived from it.
- JSON request bodies are limited to 512 KiB by default. Limits remain
  configurable downward per deployment and project.
- `/v1` receives backward-compatible additions only after 1.0. Removals or
  semantic breaks require a new API namespace and at least one supported minor
  release of overlap. Deprecations are documented in OpenAPI and response headers.

## Attachments

The first release creates feedback as JSON, then accepts streaming multipart attachment uploads. PostgreSQL stores metadata;
binary objects use S3-compatible storage with opaque, non-guessable keys. Defaults
are 10 MiB per file, 25 MiB per submission, and a project-configurable MIME
allowlist. The service determines MIME type from file signatures, strips image
metadata and may recompress images, and exposes a malware-scanning hook. Objects
remain quarantined until scanning succeeds. Downloads use short-lived authorized
URLs. A cleanup job deletes expired multipart sessions, quarantined failures, and
objects without committed metadata.

## Tenancy and credentials

Every row and object key is scoped to a workspace and project. Browser ingestion
keys can submit only, are restricted by configured origins, and can be rotated or
revoked. Users, service accounts, and agents authenticate independently and carry
explicit scopes. Repository methods require tenant identifiers so authorization
cannot rely solely on route filtering.
