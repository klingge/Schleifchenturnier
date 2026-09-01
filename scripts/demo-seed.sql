PRAGMA foreign_keys = ON;

DELETE FROM events WHERE id = 'portfolio-demo-event';

INSERT INTO events (
  id, public_slug, name, event_date, default_round_duration_seconds,
  default_court_count, status, created_at, updated_at
) VALUES (
  'portfolio-demo-event', 'sommerfest-demo', 'SGA Sommerfest 2026',
  '2026-08-15', 900, 3, 'active',
  '2026-08-15T08:00:00.000Z', '2026-08-15T09:30:00.000Z'
);

INSERT INTO courts (id, event_id, name, position, active, created_at, updated_at) VALUES
  ('demo-court-1', 'portfolio-demo-event', 'Center Court', 1, 1, '2026-08-15T08:00:00.000Z', '2026-08-15T08:00:00.000Z'),
  ('demo-court-2', 'portfolio-demo-event', 'Platz 2', 2, 1, '2026-08-15T08:00:00.000Z', '2026-08-15T08:00:00.000Z'),
  ('demo-court-3', 'portfolio-demo-event', 'Platz 3', 3, 1, '2026-08-15T08:00:00.000Z', '2026-08-15T08:00:00.000Z');

INSERT INTO players (id, event_id, display_name, emoji, active, created_at, updated_at) VALUES
  ('demo-player-01', 'portfolio-demo-event', 'Mara', '🦊', 1, '2026-08-15T08:01:00.000Z', '2026-08-15T08:01:00.000Z'),
  ('demo-player-02', 'portfolio-demo-event', 'Noah', '🐼', 1, '2026-08-15T08:02:00.000Z', '2026-08-15T08:02:00.000Z'),
  ('demo-player-03', 'portfolio-demo-event', 'Leyla', '🦋', 1, '2026-08-15T08:03:00.000Z', '2026-08-15T08:03:00.000Z'),
  ('demo-player-04', 'portfolio-demo-event', 'Jonas', '🐸', 1, '2026-08-15T08:04:00.000Z', '2026-08-15T08:04:00.000Z'),
  ('demo-player-05', 'portfolio-demo-event', 'Nele', '🐬', 1, '2026-08-15T08:05:00.000Z', '2026-08-15T08:05:00.000Z'),
  ('demo-player-06', 'portfolio-demo-event', 'Emil', '🦁', 1, '2026-08-15T08:06:00.000Z', '2026-08-15T08:06:00.000Z'),
  ('demo-player-07', 'portfolio-demo-event', 'Aylin', '🦩', 1, '2026-08-15T08:07:00.000Z', '2026-08-15T08:07:00.000Z'),
  ('demo-player-08', 'portfolio-demo-event', 'Theo', '🐨', 1, '2026-08-15T08:08:00.000Z', '2026-08-15T08:08:00.000Z'),
  ('demo-player-09', 'portfolio-demo-event', 'Paula', '🐙', 1, '2026-08-15T08:09:00.000Z', '2026-08-15T08:09:00.000Z'),
  ('demo-player-10', 'portfolio-demo-event', 'Finn', '🐯', 1, '2026-08-15T08:10:00.000Z', '2026-08-15T08:10:00.000Z'),
  ('demo-player-11', 'portfolio-demo-event', 'Leni', '🦄', 1, '2026-08-15T08:11:00.000Z', '2026-08-15T08:11:00.000Z'),
  ('demo-player-12', 'portfolio-demo-event', 'Oskar', '🐢', 1, '2026-08-15T08:12:00.000Z', '2026-08-15T08:12:00.000Z');

INSERT INTO rounds (
  id, event_id, round_number, state, court_count, duration_seconds,
  published_at, started_at, expires_at, completed_at, matchmaking_seed
) VALUES
  ('demo-round-1', 'portfolio-demo-event', 1, 'completed', 3, 900,
   '2026-08-15T09:00:00.000Z', '2026-08-15T09:01:00.000Z',
   '2026-08-15T09:16:00.000Z', '2026-08-15T09:16:00.000Z', 2026081501),
  ('demo-round-2', 'portfolio-demo-event', 2, 'published', 3, 900,
   '2026-08-15T09:20:00.000Z', NULL, NULL, NULL, 2026081502);

INSERT INTO matches (
  id, round_id, court_number, team_a_player_1_id, team_a_player_2_id,
  team_b_player_1_id, team_b_player_2_id, team_a_games, team_b_games,
  result_type, result_locked_at, court_id, court_name_snapshot
) VALUES
  ('demo-match-1-1', 'demo-round-1', 1, 'demo-player-01', 'demo-player-02', 'demo-player-03', 'demo-player-04', 6, 3, 'played', '2026-08-15T09:16:00.000Z', 'demo-court-1', 'Center Court'),
  ('demo-match-1-2', 'demo-round-1', 2, 'demo-player-05', 'demo-player-06', 'demo-player-07', 'demo-player-08', 4, 6, 'played', '2026-08-15T09:16:00.000Z', 'demo-court-2', 'Platz 2'),
  ('demo-match-1-3', 'demo-round-1', 3, 'demo-player-09', 'demo-player-10', 'demo-player-11', 'demo-player-12', 6, 5, 'played', '2026-08-15T09:16:00.000Z', 'demo-court-3', 'Platz 3'),
  ('demo-match-2-1', 'demo-round-2', 1, 'demo-player-01', 'demo-player-05', 'demo-player-08', 'demo-player-11', NULL, NULL, 'pending', NULL, 'demo-court-1', 'Center Court'),
  ('demo-match-2-2', 'demo-round-2', 2, 'demo-player-02', 'demo-player-07', 'demo-player-04', 'demo-player-10', NULL, NULL, 'pending', NULL, 'demo-court-2', 'Platz 2'),
  ('demo-match-2-3', 'demo-round-2', 3, 'demo-player-03', 'demo-player-09', 'demo-player-06', 'demo-player-12', NULL, NULL, 'pending', NULL, 'demo-court-3', 'Platz 3');

INSERT INTO round_participation (round_id, player_id, status)
SELECT 'demo-round-1', id, 'playing'
FROM players
WHERE event_id = 'portfolio-demo-event';

INSERT INTO round_participation (round_id, player_id, status)
SELECT 'demo-round-2', id, 'playing'
FROM players
WHERE event_id = 'portfolio-demo-event';
