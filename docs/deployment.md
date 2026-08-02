# Self-hosting and operations

The root Compose file is a reproducible local quickstart, not a production
topology. It uses pinned images, persistent named volumes, known local-only
credentials, automatic migrations, and an explicitly unscanned attachment mode.

## Production requirements

- Node.js 22, PostgreSQL 17, and private S3-compatible object storage.
- TLS terminated by a trusted reverse proxy or load balancer. Forward the real
  client address only from the hop count or addresses configured in
  `VENTUS_TRUST_PROXY`; unrestricted `true` is rejected. Enforce distributed
  rate limits at that edge when more than one API replica is used.
- A malware scanner supplied through the attachment-scanner integration. Keep
  `VENTUS_ALLOW_UNSCANNED_ATTACHMENTS` false.
- Secret-managed project keys, service tokens, database credentials, and object
  storage credentials. Do not place secrets in Compose files or command history.
- A public S3 endpoint for signed download URLs and a private/internal endpoint
  for server operations where the network topology requires both.

Run migrations as a single release job before starting upgraded replicas. Keep
`VENTUS_AUTO_MIGRATE=false` on ordinary production replicas. Migrations are
ordered and recorded in `schema_migrations`; never edit an applied migration.

## Upgrade and rollback

1. Back up PostgreSQL and verify the backup can be read.
2. Enable object-store versioning or take a storage snapshot.
3. Stop writes or use a maintenance window for migrations that are not explicitly
   documented as online-safe.
4. Run the new image's migration command once, deploy the API, and verify
   `/v1/ready`, `/v1/version`, and the smoke workflow.
5. Roll application replicas back to the previous pinned image if application
   verification fails. Apply a down migration only when its release notes declare
   it data-safe; restoring the database backup is the safer rollback for a
   destructive migration.

## Backup and restore

Back up the PostgreSQL database and object bucket as one logical recovery point.
For PostgreSQL, use the operator's managed snapshots or `pg_dump`/`pg_restore`.
For objects, use bucket versioning plus the provider's replication or snapshot
facility. Preserve the bucket keys referenced by attachment metadata.

Test restores regularly into an isolated environment. A restore is successful
only when record counts, event counts, attachment metadata, and sampled object
hashes reconcile and the API smoke flow passes.

## Scaling and failure behavior

API replicas are stateless except for the built-in process-local ingestion rate
limiter. PostgreSQL transactions and row locks coordinate claims and mutations;
S3 stores attachment bodies. Use an edge/shared-store limiter for multiple API
replicas. Readiness fails when PostgreSQL or object storage is unavailable.

The current release does not include webhook delivery, metrics, or OpenTelemetry.
Those are explicit pre-stable work items in `PLANNING.md`, not silent production
guarantees.

## Retention cleanup

Retention is deliberately disabled until an operator selects
`VENTUS_RETENTION_DAYS`. The cleanup command is also a dry run unless
`VENTUS_RETENTION_DRY_RUN=false` is explicitly configured:

```bash
npm run retention --workspace @ventus/feedback-api
```

Only terminal `closed` and `rejected` records older than the policy are eligible.
The first stage makes the record inaccessible and writes a `deleted` audit event.
After `VENTUS_RETENTION_PURGE_GRACE_DAYS`, the second stage removes attachment
objects and child content, clears reporter credentials, reduces the feedback to
a non-content tombstone, and pseudonymizes event actors/data. Stable IDs, event
types, versions, and timestamps remain for operational audit integrity.

Run the command from a scheduler until both eligible counts reach zero; each run
is bounded by `VENTUS_RETENTION_BATCH_SIZE`. Always inspect a dry run after a
policy change. Back up the database and object store together before enabling
mutation, and test the policy in a non-production copy first.

## Key rotation

Add the replacement key/token alongside the old one, deploy the new configuration,
move clients, then remove the old credential and restart all replicas. Project
keys must remain submit-only. Agent tokens should normally omit `feedback:close`;
use a separate verifier token for final closure.
