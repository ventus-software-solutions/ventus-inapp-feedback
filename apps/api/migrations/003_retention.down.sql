DROP INDEX IF EXISTS feedback_retention_idx;
ALTER TABLE feedback DROP COLUMN IF EXISTS retain_until;
ALTER TABLE feedback DROP COLUMN IF EXISTS purged_at;
ALTER TABLE feedback_events DROP COLUMN IF EXISTS redacted_at;

CREATE OR REPLACE FUNCTION prevent_feedback_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'feedback_events are append-only';
END;
$$;
