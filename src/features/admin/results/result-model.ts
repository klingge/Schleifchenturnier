import type { Match } from "@/domain/tournament";

export type ScoreDraft = Readonly<{
  teamA: number | null;
  teamB: number | null;
}>;

export type ScoreTeam = "teamA" | "teamB";
export type ResultValidation = "incomplete" | "draw" | "invalid" | "valid";
export type ResultPersistence =
  "open" | "invalid" | "dirty" | "saving" | "saved" | "failed";

export type EntryState = {
  matchId: string;
  draft: ScoreDraft;
  persisted: ScoreDraft | null;
  saving: { token: number; snapshot: ScoreDraft } | null;
  failedKey: string | null;
  committedInSession: boolean;
};

export function scoreFromMatch(match: Match): ScoreDraft {
  return {
    teamA: match.team_a_games,
    teamB: match.team_b_games,
  };
}

export function persistedPlayedScore(match: Match) {
  return match.result_type === "played" &&
    match.team_a_games !== null &&
    match.team_b_games !== null
    ? scoreFromMatch(match)
    : null;
}

export function persistedCorrectionScore(match: Match) {
  return match.team_a_games !== null && match.team_b_games !== null
    ? scoreFromMatch(match)
    : null;
}

export function createEntryState(
  match: Match,
  persisted: ScoreDraft | null,
): EntryState {
  return {
    matchId: match.id,
    draft: persisted ?? scoreFromMatch(match),
    persisted,
    saving: null,
    failedKey: null,
    committedInSession: false,
  };
}

export function scoreKey(score: ScoreDraft | null) {
  return score ? (score.teamA ?? "") + ":" + (score.teamB ?? "") : null;
}

export function validateScore(score: ScoreDraft): ResultValidation {
  const { teamA, teamB } = score;
  if (teamA === null || teamB === null) return "incomplete";
  if (
    !Number.isInteger(teamA) ||
    !Number.isInteger(teamB) ||
    teamA < 0 ||
    teamB < 0
  )
    return "invalid";
  return teamA === teamB ? "draw" : "valid";
}

export function entryPersistence(state: EntryState): ResultPersistence {
  const validation = validateScore(state.draft);
  const draftKey = scoreKey(state.draft);
  if (state.saving) return "saving";
  if (draftKey !== null && state.failedKey === draftKey) return "failed";
  if (validation === "incomplete") return "open";
  if (validation !== "valid") return "invalid";
  return draftKey === scoreKey(state.persisted) ? "saved" : "dirty";
}

export function changeEntry(
  state: EntryState,
  team: ScoreTeam,
  games: number | null,
): EntryState {
  const draft = { ...state.draft, [team]: games };
  return {
    ...state,
    draft,
    committedInSession: false,
  };
}

export function beginSave(
  state: EntryState,
  token: number,
  snapshot: ScoreDraft,
): EntryState {
  if (state.saving) return state;
  return {
    ...state,
    saving: { token, snapshot },
  };
}

export function finishSave(
  state: EntryState,
  token: number,
  succeeded: boolean,
): EntryState {
  if (!state.saving || state.saving.token !== token) return state;
  const sent = state.saving.snapshot;
  return {
    ...state,
    persisted: succeeded ? sent : state.persisted,
    saving: null,
    failedKey: succeeded ? null : scoreKey(sent),
    committedInSession: succeeded,
  };
}

export function reconcileEntry(
  state: EntryState,
  persisted: ScoreDraft | null,
): EntryState {
  if (state.committedInSession && persisted === null) return state;
  const persistedChanged = scoreKey(state.persisted) !== scoreKey(persisted);
  const clean =
    !state.saving &&
    state.failedKey === null &&
    scoreKey(state.draft) === scoreKey(state.persisted);
  if (!clean) return persistedChanged ? { ...state, persisted } : state;
  const nextDraft = persisted ?? state.draft;
  if (!persistedChanged && scoreKey(nextDraft) === scoreKey(state.draft))
    return state;
  return {
    ...state,
    draft: nextDraft,
    persisted,
  };
}
