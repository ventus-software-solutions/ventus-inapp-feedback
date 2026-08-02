ALTER TABLE feedback ADD COLUMN retain_until timestamptz;
ALTER TABLE feedback ADD COLUMN purged_at timestamptz;
CREATE INDEX feedback_retention_idx
  ON feedback (retain_until, id)
  WHERE deleted_at IS NOT NULL AND retain_until IS NOT NULL AND purged_at IS NULL;

ALTER TABLE feedback_events ADD COLUMN redacted_at timestamptz;

CREATE OR REPLACE FUNCTION prevent_feedback_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.redacted_at IS NULL
     AND NEW.redacted_at IS NOT NULL
     AND NEW.id = OLD.id
     AND NEW.workspace_id = OLD.workspace_id
     AND NEW.feedback_id = OLD.feedback_id
     AND NEW.event_type = OLD.event_type
     AND NEW.previous_version IS NOT DISTINCT FROM OLD.previous_version
     AND NEW.version = OLD.version
     AND NEW.occurred_at = OLD.occurred_at
     AND NEW.actor = '{"id":"system:retention","type":"system","displayName":"Retention cleanup"}'::jsonb
     AND NEW.data = '{}'::jsonb
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'feedback_events are append-only except for retention redaction';
END;
$$;
