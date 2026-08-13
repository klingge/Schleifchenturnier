PRAGMA foreign_keys = ON;

DELETE FROM events WHERE id = 'demo-event-2026';

INSERT INTO events (
  id, public_slug, name, event_date,
  default_round_duration_seconds, default_court_count,
  status, created_at, updated_at
) VALUES (
  'demo-event-2026', 'demo-sommerfest-2026', 'SGA Schleifchenturnier - Demo',
  '2026-08-13', 1200, 2, 'active',
  '2026-08-13T08:00:00.000Z', '2026-08-13T09:30:00.000Z'
);

INSERT INTO players (id, event_id, display_name, emoji, active, created_at, updated_at) VALUES
  ('demo-p1', 'demo-event-2026', 'Anna', '🐯', 1, '2026-08-13T08:05:00.000Z', '2026-08-13T08:05:00.000Z'),
  ('demo-p2', 'demo-event-2026', 'Ben', '🦊', 1, '2026-08-13T08:06:00.000Z', '2026-08-13T08:06:00.000Z'),
  ('demo-p3', 'demo-event-2026', 'Clara', '🐼', 1, '2026-08-13T08:07:00.000Z', '2026-08-13T08:07:00.000Z'),
  ('demo-p4', 'demo-event-2026', 'David', '🐸', 1, '2026-08-13T08:08:00.000Z', '2026-08-13T08:08:00.000Z'),
  ('demo-p5', 'demo-event-2026', 'Emma', '🦁', 1, '2026-08-13T08:09:00.000Z', '2026-08-13T08:09:00.000Z'),
  ('demo-p6', 'demo-event-2026', 'Felix', '🐨', 1, '2026-08-13T08:10:00.000Z', '2026-08-13T08:10:00.000Z'),
  ('demo-p7', 'demo-event-2026', 'Greta', '🦄', 1, '2026-08-13T08:11:00.000Z', '2026-08-13T08:11:00.000Z'),
  ('demo-p8', 'demo-event-2026', 'Henry', '🐧', 1, '2026-08-13T08:12:00.000Z', '2026-08-13T08:12:00.000Z');

INSERT INTO courts (id, event_id, name, position, active, created_at, updated_at) VALUES
  ('demo-court-1', 'demo-event-2026', 'Center Court', 1, 1, '2026-08-13T08:00:00.000Z', '2026-08-13T08:00:00.000Z'),
  ('demo-court-2', 'demo-event-2026', 'Platz 2', 2, 1, '2026-08-13T08:00:00.000Z', '2026-08-13T08:00:00.000Z');

INSERT INTO rounds (
  id, event_id, round_number, state, court_count, duration_seconds,
  published_at, started_at, completed_at, matchmaking_seed
) VALUES (
  'demo-round-1', 'demo-event-2026', 1, 'completed', 2, 1200,
  '2026-08-13T08:20:00.000Z', '2026-08-13T08:22:00.000Z',
  '2026-08-13T08:45:00.000Z', 101
);

INSERT INTO matches (
  id, round_id, court_number, court_id, court_name_snapshot,
  team_a_player_1_id, team_a_player_2_id,
  team_b_player_1_id, team_b_player_2_id,
  team_a_games, team_b_games, result_type, result_locked_at
) VALUES
  ('demo-match-1', 'demo-round-1', 1, 'demo-court-1', 'Center Court',
   'demo-p1', 'demo-p2', 'demo-p3', 'demo-p4', 6, 4, 'played', '2026-08-13T08:44:00.000Z'),
  ('demo-match-2', 'demo-round-1', 2, 'demo-court-2', 'Platz 2',
   'demo-p5', 'demo-p6', 'demo-p7', 'demo-p8', 3, 6, 'played', '2026-08-13T08:44:30.000Z');

INSERT INTO round_participation (round_id, player_id, status)
SELECT 'demo-round-1', id, 'playing' FROM players WHERE event_id = 'demo-event-2026';

INSERT INTO rounds (
  id, event_id, round_number, state, court_count, duration_seconds,
  published_at, started_at, expires_at, matchmaking_seed
) VALUES (
  'demo-round-2', 'demo-event-2026', 2, 'running', 2, 1200,
  '2026-08-13T09:00:00.000Z', '2026-08-13T09:02:00.000Z',
  '2099-12-31T23:59:59.000Z', 202
);

INSERT INTO matches (
  id, round_id, court_number, court_id, court_name_snapshot,
  team_a_player_1_id, team_a_player_2_id,
  team_b_player_1_id, team_b_player_2_id,
  result_type
) VALUES
  ('demo-match-3', 'demo-round-2', 1, 'demo-court-1', 'Center Court',
   'demo-p1', 'demo-p3', 'demo-p5', 'demo-p7', 'pending'),
  ('demo-match-4', 'demo-round-2', 2, 'demo-court-2', 'Platz 2',
   'demo-p2', 'demo-p4', 'demo-p6', 'demo-p8', 'pending');

INSERT INTO round_participation (round_id, player_id, status)
SELECT 'demo-round-2', id, 'playing' FROM players WHERE event_id = 'demo-event-2026';
