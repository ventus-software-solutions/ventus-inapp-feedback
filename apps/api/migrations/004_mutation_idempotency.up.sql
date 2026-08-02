CREATE TABLE feedback_mutation_idempotency (
  workspace_id text NOT NULL,
  actor_id text NOT NULL,
  feedback_id text NOT NULL REFERENCES feedback(id),
  operation text NOT NULL,
  idempotency_key_hash text NOT NULL,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, actor_id, feedback_id, operation, idempotency_key_hash)
);
CREATE INDEX feedback_mutation_idempotency_expiry_idx
  ON feedback_mutation_idempotency (expires_at);
