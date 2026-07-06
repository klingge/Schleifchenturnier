PRAGMA foreign_keys = ON;

CREATE TABLE courts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
  position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 13),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(event_id, position)
);

CREATE UNIQUE INDEX courts_event_name
  ON courts(event_id, name COLLATE NOCASE);

CREATE INDEX courts_event
  ON courts(event_id, position);

WITH RECURSIVE court_numbers(number) AS (
  SELECT 1
  UNION ALL
  SELECT number + 1 FROM court_numbers WHERE number < 13
)
INSERT INTO courts (id, event_id, name, position, active, created_at, updated_at)
SELECT
  'legacy-court-' || events.id || '-' || court_numbers.number,
  events.id,
  'Platz ' || court_numbers.number,
  court_numbers.number,
  1,
  events.created_at,
  events.updated_at
FROM events
JOIN court_numbers
  ON court_numbers.number <= MAX(
    events.default_court_count,
    COALESCE(
      (SELECT MAX(rounds.court_count) FROM rounds WHERE rounds.event_id = events.id),
      0
    )
  );

ALTER TABLE matches
  ADD COLUMN court_id TEXT REFERENCES courts(id) ON DELETE SET NULL;

ALTER TABLE matches
  ADD COLUMN court_name_snapshot TEXT;

UPDATE matches
SET
  court_id = (
    SELECT courts.id
    FROM courts
    JOIN rounds ON rounds.event_id = courts.event_id
    WHERE rounds.id = matches.round_id
      AND courts.position = matches.court_number
  ),
  court_name_snapshot = 'Platz ' || court_number;
