CREATE TABLE feedback_attachment_idempotency (
  workspace_id text NOT NULL,
  feedback_id text NOT NULL REFERENCES feedback(id),
  idempotency_key_hash text NOT NULL,
  request_hash text NOT NULL,
  attachment_id text NOT NULL REFERENCES feedback_attachments(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, feedback_id, idempotency_key_hash)
);
