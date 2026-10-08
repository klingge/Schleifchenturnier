import type { VisibleRoundState } from "./round-rules";

export type Player = {
  id: string;
  display_name: string;
  emoji: string;
  active: number;
  wins: number;
  gameDifference: number;
  sitOuts: number;
  rank: number;
};

export type Court = {
  id: string;
  name: string;
  position: number;
  active: number;
};

export type Match = {
  id: string;
  court_number: number;
  court_id: string | null;
  court_name_snapshot: string | null;
  team_a_player_1_id: string;
  team_a_player_2_id: string;
  team_b_player_1_id: string;
  team_b_player_2_id: string;
  team_a_games: number | null;
  team_b_games: number | null;
  result_type: string;
};

export type Round = {
  id: string;
  round_number: number;
  state: VisibleRoundState;
  duration_seconds: number;
  expires_at: string | null;
  paused_at?: string | null;
  matches: Match[];
  sitting_out_player_ids: string[];
};

export type EventRow = {
  id: string;
  public_slug: string;
  name: string;
  event_date: string;
  default_round_duration_seconds: number;
  court_count?: number;
  status: string;
  planned_round_count: number | null;
  finished_at: string | null;
  revision: number;
};

export type EventData = {
  event: EventRow;
  players: Player[];
  courts: Court[];
  leaderboard: Player[];
  rounds: Round[];
  currentRound: Round | null;
};

export const matchPlayerIds = (match: Match) => [
  match.team_a_player_1_id,
  match.team_a_player_2_id,
  match.team_b_player_1_id,
  match.team_b_player_2_id,
];

export const courtName = (match: Match) =>
  match.court_name_snapshot || `Platz ${match.court_number}`;
