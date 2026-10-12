CREATE TABLE organizer_keys (
  id TEXT PRIMARY KEY,
  key_digest TEXT NOT NULL UNIQUE CHECK(length(key_digest) = 64),
  label TEXT NOT NULL DEFAULT '' CHECK(length(label) <= 100),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  revoked_at TEXT,
  event_id TEXT UNIQUE REFERENCES events(id) ON DELETE SET NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(event_id IS NULL OR used_at IS NOT NULL)
);
