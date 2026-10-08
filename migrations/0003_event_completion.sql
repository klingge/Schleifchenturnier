ALTER TABLE events ADD COLUMN planned_round_count INTEGER
  CHECK(planned_round_count IS NULL OR (typeof(planned_round_count) = 'integer' AND planned_round_count > 0));
ALTER TABLE events ADD COLUMN finished_at TEXT;
ALTER TABLE events ADD COLUMN revision INTEGER NOT NULL DEFAULT 0
  CONSTRAINT event_revision_conflict CHECK(revision >= 0);
