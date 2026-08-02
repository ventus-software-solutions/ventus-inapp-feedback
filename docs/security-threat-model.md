# Security and privacy threat model

## Protected data

Feedback descriptions, host context, console/error diagnostics, URLs, screenshots,
attachments, reporter tokens, project keys, and operator/service credentials may
all be sensitive. Tenant boundaries and the append-only audit trail are security
boundaries, not UI conveniences.

## Principal threats and controls

- Credential leakage: browser redaction, bounded logging, secret-header log
  redaction, hashed reporter tokens, and submit-only project keys.
- Cross-tenant access: workspace/project predicates on repository reads and
  mutations, plus authorization tests.
- Stored hostile content: the API stores reporter text as data and never renders
  it as HTML. Consumers must escape it when rendering.
- Malicious uploads: bounded multipart parsing, filename normalization, MIME
  allowlists, signature sniffing, fail-closed scanner integration, private object
  storage, and short-lived authorized downloads.
- SSRF: the service never fetches reporter-provided URLs or external change links.
  Object-storage endpoints are operator configuration, not request input.
- Replay and races: idempotency keys for create/upload, optimistic versions for
  mutations, database transactions, row locks, and expiring claims.
- Submission abuse: origin-bound project keys, per-process project/IP rate limits,
  and documented shared edge limits for scaled deployments.
- Overpowered agents: scoped service tokens, an API-only MCP adapter, no delete
  tool, auditable mutations, and separate resolve/close permissions.

## Known pre-stable gaps

Retention/export/deletion jobs, webhook delivery, remote MCP OAuth, distributed
rate limiting, security telemetry, browser-matrix testing, and a formal external
security review remain open. The demo uses synthetic data and must not be exposed
as a production service.
