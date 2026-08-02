CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  slug text NOT NULL,
  name text NOT NULL,
  allowed_origins text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug),
  UNIQUE (workspace_id, id)
);

CREATE TABLE feedback (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('new','triaged','in_progress','resolved','closed','rejected','reopened')),
  category text NOT NULL CHECK (category IN ('bug','feedback','idea')),
  priority text NOT NULL CHECK (priority IN ('unset','low','medium','high','urgent')),
  release text,
  environment text,
  labels text[] NOT NULL DEFAULT '{}',
  claimed_by text,
  claim_expires_at timestamptz,
  version integer NOT NULL CHECK (version >= 1),
  record jsonb NOT NULL,
  reporter_token_hash text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id)
);

CREATE INDEX feedback_workspace_status_created_idx ON feedback (workspace_id, status, created_at DESC);
CREATE INDEX feedback_project_created_idx ON feedback (workspace_id, project_id, created_at DESC);
CREATE INDEX feedback_priority_updated_idx ON feedback (workspace_id, priority, updated_at DESC);
CREATE INDEX feedback_claim_idx ON feedback (workspace_id, claimed_by, claim_expires_at) WHERE claimed_by IS NOT NULL;
CREATE INDEX feedback_labels_idx ON feedback USING gin (labels);
CREATE INDEX feedback_record_search_idx ON feedback USING gin (to_tsvector('simple', coalesce(record->>'title','') || ' ' || coalesce(record->>'description','')));

CREATE TABLE feedback_events (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  feedback_id text NOT NULL REFERENCES feedback(id),
  event_type text NOT NULL,
  actor jsonb NOT NULL,
  previous_version integer,
  version integer NOT NULL,
  data jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  UNIQUE (feedback_id, version, event_type)
);
CREATE INDEX feedback_events_feedback_idx ON feedback_events (workspace_id, feedback_id, occurred_at, id);

CREATE TABLE feedback_comments (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  feedback_id text NOT NULL REFERENCES feedback(id),
  actor jsonb NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX feedback_comments_feedback_idx ON feedback_comments (workspace_id, feedback_id, created_at);

CREATE TABLE feedback_evidence (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  feedback_id text NOT NULL REFERENCES feedback(id),
  actor jsonb NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE feedback_attachments (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  feedback_id text NOT NULL REFERENCES feedback(id),
  evidence_id text REFERENCES feedback_evidence(id),
  kind text NOT NULL,
  file_name text NOT NULL,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  object_key text NOT NULL UNIQUE,
  scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','rejected','failed')),
  created_at timestamptz NOT NULL
);

CREATE TABLE feedback_external_links (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  feedback_id text NOT NULL REFERENCES feedback(id),
  link_type text NOT NULL,
  url text NOT NULL,
  label text NOT NULL,
  actor jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE feedback_idempotency_keys (
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  idempotency_key_hash text NOT NULL,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, project_id, idempotency_key_hash)
);

CREATE OR REPLACE FUNCTION prevent_feedback_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'feedback_events are append-only';
END;
$$;

CREATE TRIGGER feedback_events_no_update
BEFORE UPDATE OR DELETE ON feedback_events
FOR EACH ROW EXECUTE FUNCTION prevent_feedback_event_mutation();
