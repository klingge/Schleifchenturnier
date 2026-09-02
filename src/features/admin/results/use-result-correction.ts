import { useCallback, useEffect, useReducer, useRef } from "react";

import type { Match } from "@/domain/tournament";
import {
  beginSave,
  changeEntry,
  createEntryState,
  entryPersistence,
  finishSave,
  persistedCorrectionScore,
  reconcileEntry,
  scoreKey,
  validateScore,
  type EntryState,
  type ResultPersistence,
  type ResultValidation,
  type ScoreDraft,
  type ScoreTeam,
} from "./result-model";
import type { ResultMutation } from "./use-round-results";

export type ResultCorrection = Readonly<{
  draft: ScoreDraft;
  editing: boolean;
  validation: ResultValidation;
  persistence: ResultPersistence;
  committed: boolean;
  begin(): void;
  change(team: ScoreTeam, games: number | null): void;
  cancel(): void;
  save(): void;
}>;

type CorrectionState = {
  entry: EntryState;
  editing: boolean;
};

type CorrectionAction =
  | { type: "source-changed"; match: Match }
  | { type: "editing-started" }
  | { type: "editing-cancelled" }
  | { type: "score-changed"; team: ScoreTeam; games: number | null }
  | { type: "save-started"; token: number; snapshot: ScoreDraft }
  | { type: "save-finished"; token: number; succeeded: boolean };

function correctionState(match: Match): CorrectionState {
  return {
    entry: createEntryState(match, persistedCorrectionScore(match)),
    editing: false,
  };
}

function correctionReducer(
  state: CorrectionState,
  action: CorrectionAction,
): CorrectionState {
  if (action.type === "source-changed") {
    if (state.entry.matchId !== action.match.id)
      return correctionState(action.match);
    return {
      ...state,
      entry: reconcileEntry(
        state.entry,
        persistedCorrectionScore(action.match),
      ),
    };
  }
  if (action.type === "editing-started")
    return {
      editing: true,
      entry: {
        ...state.entry,
        committedInSession: false,
        failedKey: null,
      },
    };
  if (action.type === "editing-cancelled")
    return {
      editing: false,
      entry: {
        ...state.entry,
        draft: state.entry.persisted ?? state.entry.draft,
        failedKey: null,
        committedInSession: false,
      },
    };
  if (action.type === "score-changed")
    return {
      ...state,
      entry: changeEntry(state.entry, action.team, action.games),
    };
  if (action.type === "save-started")
    return {
      ...state,
      entry: beginSave(state.entry, action.token, action.snapshot),
    };
  const sentKey = scoreKey(state.entry.saving?.snapshot ?? null);
  const entry = finishSave(state.entry, action.token, action.succeeded);
  const savedCurrentDraft =
    action.succeeded && sentKey !== null && sentKey === scoreKey(entry.draft);
  return {
    entry: {
      ...entry,
      committedInSession: savedCurrentDraft,
    },
    editing: !savedCurrentDraft,
  };
}

export function useResultCorrection({
  match,
  mutate,
}: {
  match: Match;
  mutate: ResultMutation;
}): ResultCorrection {
  const [state, dispatch] = useReducer(
    correctionReducer,
    match,
    correctionState,
  );
  const requestToken = useRef(0);
  const saving = useRef(false);

  useEffect(() => {
    dispatch({ type: "source-changed", match });
  }, [match]);

  const begin = useCallback(() => dispatch({ type: "editing-started" }), []);
  const change = useCallback(
    (team: ScoreTeam, games: number | null) =>
      dispatch({ type: "score-changed", team, games }),
    [],
  );
  const cancel = useCallback(() => {
    if (!saving.current) dispatch({ type: "editing-cancelled" });
  }, []);
  const persistence = entryPersistence(state.entry);
  const validation = validateScore(state.entry.draft);
  const save = useCallback(() => {
    if (
      saving.current ||
      !state.editing ||
      validateScore(state.entry.draft) !== "valid" ||
      entryPersistence(state.entry) === "saved"
    )
      return;
    saving.current = true;
    const token = ++requestToken.current;
    const snapshot = state.entry.draft;
    dispatch({ type: "save-started", token, snapshot });
    void mutate("/admin/matches/" + match.id + "/result", {
      method: "PUT",
      body: JSON.stringify({
        teamAGames: snapshot.teamA,
        teamBGames: snapshot.teamB,
      }),
    })
      .then(() => {
        saving.current = false;
        dispatch({ type: "save-finished", token, succeeded: true });
      })
      .catch(() => {
        saving.current = false;
        dispatch({ type: "save-finished", token, succeeded: false });
      });
  }, [match.id, mutate, state.editing, state.entry]);

  return {
    draft: state.entry.draft,
    editing: state.editing,
    validation,
    persistence,
    committed: state.entry.committedInSession,
    begin,
    change,
    cancel,
    save,
  };
}
