# @ventus/feedback-api-client

Typed, framework-neutral client for the `/v1` API. It covers submission, search,
metadata updates, comments, lease claims, resolution, verification closure,
reopening, rejection, evidence, and event history. Versioned mutations send an
`If-Match` header automatically. It also sends an `Idempotency-Key`; pass a stable
`idempotencyKey` in the request options when the caller may retry after losing a
response. Reuse a key only for the exact same request. Credentials can be static
or resolved lazily.
