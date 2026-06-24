PRAGMA foreign_keys = ON;

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  public_slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  event_date TEXT NOT NULL,
  default_round_duration_seconds INTEGER NOT NULL CHECK(default_round_duration_seconds BETWEEN 60 AND 14400),
  default_court_count INTEGER NOT NULL CHECK(default_court_count BETWEEN 1 AND 13),
  status TEXT NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby', 'active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 40),
  emoji TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(event_id, emoji)
);

CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK(round_number > 0),
  state TEXT NOT NULL CHECK(state IN ('published', 'running', 'paused', 'results', 'completed', 'discarded')),
  court_count INTEGER NOT NULL CHECK(court_count BETWEEN 1 AND 13),
  duration_seconds INTEGER NOT NULL CHECK(duration_seconds BETWEEN 60 AND 14400),
  published_at TEXT NOT NULL,
  started_at TEXT,
  expires_at TEXT,
  paused_at TEXT,
  accumulated_paused_seconds INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  discarded_at TEXT,
  matchmaking_seed INTEGER NOT NULL
);

CREATE UNIQUE INDEX rounds_active_number ON rounds(event_id, round_number) WHERE state <> 'discarded';

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  court_number INTEGER NOT NULL CHECK(court_number BETWEEN 1 AND 13),
  team_a_player_1_id TEXT NOT NULL REFERENCES players(id),
  team_a_player_2_id TEXT NOT NULL REFERENCES players(id),
  team_b_player_1_id TEXT NOT NULL REFERENCES players(id),
  team_b_player_2_id TEXT NOT NULL REFERENCES players(id),
  team_a_games INTEGER CHECK(team_a_games >= 0),
  team_b_games INTEGER CHECK(team_b_games >= 0),
  result_type TEXT NOT NULL DEFAULT 'pending' CHECK(result_type IN ('pending', 'played', 'missing')),
  result_locked_at TEXT,
  UNIQUE(round_id, court_number)
);

CREATE TABLE round_participation (
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  status TEXT NOT NULL CHECK(status IN ('playing', 'sitting_out')),
  PRIMARY KEY(round_id, player_id)
);

CREATE INDEX players_event ON players(event_id);
CREATE INDEX rounds_event ON rounds(event_id, round_number);
CREATE INDEX matches_round ON matches(round_id);
CREATE INDEX participation_player ON round_participation(player_id, status);
