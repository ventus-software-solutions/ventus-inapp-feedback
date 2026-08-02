# Ventus Feedback API

Fastify v5 service implementing the versioned feedback contract. PostgreSQL is
the production repository; the in-memory repository exists for tests and local
ephemeral development only. The service uses parameterized node-postgres queries,
one bounded connection pool, transactions for every versioned mutation, row locks
for claims and optimistic updates, transactional idempotency records for agent
writes, and append-only audit events.

```bash
npm run build --workspace @ventus/feedback-api
npm run migrate --workspace @ventus/feedback-api
npm run seed --workspace @ventus/feedback-api
npm run retention --workspace @ventus/feedback-api
npm run start --workspace @ventus/feedback-api
```

For a local stack:

```bash
docker compose up --build
```

The example credentials in Compose are local-only. Replace both JSON maps with
secret-managed values before exposing a deployment. Production startup refuses
to silently use the in-memory repository when no database URL is configured.

The API implements JSON ingestion, workflow routes, expiring claims, optimistic
concurrency, reporter follow-up tokens, rate-limited public submissions, and
authorized attachment upload/download through S3-compatible object storage.
Attachment uploads validate size, allowlisted MIME type, and file signatures.
Production should provide an `AttachmentScanner`; the local Compose stack opts
into unscanned synthetic attachments explicitly.

All versioned JSON mutations require both `If-Match` and `Idempotency-Key`.
Replaying the exact request with the same actor/key returns the original response,
even though the record version has advanced. Reusing a key with changed input is
a conflict. Replay records expire after 24 hours.

## Configuration

- `VENTUS_API_HOST`, `VENTUS_API_PORT`, `VENTUS_LOG_LEVEL`, and
  `VENTUS_APPLICATION_VERSION` configure the process identity and listener.
- `VENTUS_TRUST_PROXY` accepts `false`, a trusted hop count, or trusted
  addresses/CIDRs; unrestricted `true` is rejected.
- `VENTUS_DATABASE_URL` and `VENTUS_DATABASE_POOL_SIZE` configure PostgreSQL.
  `VENTUS_USE_IN_MEMORY=true` is test-only. `VENTUS_AUTO_MIGRATE` and
  `VENTUS_AUTO_SEED_CONFIGURED_PROJECTS` are explicit startup operations.
- `VENTUS_PROJECT_KEYS_JSON` and `VENTUS_SERVICE_TOKENS_JSON` are JSON maps of
  tenant-scoped credentials and permissions.
- `VENTUS_INGESTION_RATE_LIMIT_MAX` and
  `VENTUS_INGESTION_RATE_LIMIT_WINDOW_MS` configure the process-local limiter.
- `VENTUS_S3_BUCKET`, `VENTUS_S3_ENDPOINT`, `VENTUS_S3_PUBLIC_ENDPOINT`,
  `VENTUS_S3_REGION`, `VENTUS_S3_ACCESS_KEY_ID`,
  `VENTUS_S3_SECRET_ACCESS_KEY`, `VENTUS_S3_FORCE_PATH_STYLE`,
  `VENTUS_S3_AUTO_CREATE_BUCKET`, and `VENTUS_S3_SERVER_SIDE_ENCRYPTION`
  configure object storage.
- `VENTUS_ALLOW_UNSCANNED_ATTACHMENTS`,
  `VENTUS_ATTACHMENT_MAX_FILE_BYTES`,
  `VENTUS_ATTACHMENT_MAX_SUBMISSION_BYTES`, and
  `VENTUS_ATTACHMENT_ALLOWED_MEDIA_TYPES` configure attachment enforcement.
- `VENTUS_RETENTION_DAYS` enables terminal-record retention. The cleanup command
  uses `VENTUS_RETENTION_PURGE_GRACE_DAYS`, `VENTUS_RETENTION_BATCH_SIZE`, and
  `VENTUS_RETENTION_DRY_RUN`; dry-run defaults to true.

See `.env.example` for local values and `docs/deployment.md` for the retention,
backup, reverse-proxy, upgrade, and production contracts.

Run the full local smoke flow after `docker compose up --build`:

```bash
VENTUS_SMOKE_API_URL=http://127.0.0.1:8180/v1 \
VENTUS_SMOKE_PROJECT_KEY=demo-browser-key \
VENTUS_SMOKE_AGENT_TOKEN=demo-service-token \
VENTUS_SMOKE_VERIFIER_TOKEN=demo-service-token \
VENTUS_SMOKE_CONTENDER_TOKEN=demo-agent-two-token \
node scripts/smoke-api.mjs
```

CI follows this with `scripts/smoke-retention.mjs`, using the exposed local
PostgreSQL port 15433 and MinIO port 19001.

The built-in rate limiter is process-local and suitable for a single API
instance. Multi-replica deployments should enforce a shared limit at the edge or
replace it with a shared-store implementation.

## License

The self-hosted API is source-available under the Business Source License 1.1.
Development and non-production use are free. The Additional Use Grant also
permits limited production use until the API processes more than 1,000 aggregate
feedback submissions per month for three consecutive months, as defined in
`LICENSE`. Production use outside that grant requires a commercial license from
Ventus Software Solutions GmbH. Each version changes to Apache-2.0 on its Change
Date.

Built and maintained by
[Ventus Software Solutions GmbH](https://ventus.works/?utm_source=github&utm_medium=referral&utm_campaign=feedback-api).
