import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import type { Round } from "@/domain/tournament";
import { getRoundPolicy } from "@/domain/round-rules";
import {
  beginSave,
  changeEntry,
  createEntryState,
  entryPersistence,
  finishSave,
  persistedPlayedScore,
  reconcileEntry,
  scoreKey,
  validateScore,
  type EntryState,
  type ResultPersistence,
  type ResultValidation,
  type ScoreDraft,
  type ScoreTeam,
} from "./result-model";

export type ResultMutation = (path: string, init: RequestInit) => Promise<void>;

export type RoundResultEntry = Readonly<{
  matchId: string;
  draft: ScoreDraft;
  editable: boolean;
  validation: ResultValidation;
  persistence: ResultPersistence;
  change(team: ScoreTeam, games: number | null): void;
}>;

export type RoundResults = Readonly<{
  active: boolean;
  entries: ReadonlyMap<string, RoundResultEntry>;
  progress: Readonly<{
    recorded: number;
    total: number;
    percent: number;
    canComplete: boolean;
  }>;
  completion: Readonly<{
    allowed: boolean;
    busy: boolean;
    failed: boolean;
    run(): void;
  }>;
}>;

type RoundResultState = {
  roundId: string | null;
  generation: number;
  entries: Record<string, EntryState>;
};

type RoundResultAction =
  | { type: "source-changed"; round: Round | null }
  | {
      type: "score-changed";
      matchId: string;
      team: ScoreTeam;
      games: number | null;
    }
  | {
      type: "save-started";
      matchId: string;
      token: number;
      snapshot: ScoreDraft;
      generation: number;
    }
  | {
      type: "save-finished";
      matchId: string;
      token: number;
      succeeded: boolean;
      generation: number;
    };

function roundState(round: Round | null): RoundResultState {
  return {
    roundId: round?.id ?? null,
    generation: 0,
    entries: Object.fromEntries(
      (round?.matches ?? []).map((match) => [
        match.id,
        createEntryState(match, persistedPlayedScore(match)),
      ]),
    ),
  };
}

function reconcileRound(
  state: RoundResultState,
  round: Round | null,
): RoundResultState {
  if (state.roundId !== (round?.id ?? null)) {
    const next = roundState(round);
    return { ...next, generation: state.generation + 1 };
  }
  let changed =
    Object.keys(state.entries).length !== (round?.matches.length ?? 0);
  const entries = Object.fromEntries(
    (round?.matches ?? []).map((match) => {
      const existing = state.entries[match.id];
      const persisted = persistedPlayedScore(match);
      const next = existing
        ? reconcileEntry(existing, persisted)
        : createEntryState(match, persisted);
      if (next !== existing) changed = true;
      return [match.id, next];
    }),
  );
  return changed ? { ...state, entries } : state;
}

function resultReducer(
  state: RoundResultState,
  action: RoundResultAction,
): RoundResultState {
  if (action.type === "source-changed")
    return reconcileRound(state, action.round);
  const existing = state.entries[action.matchId];
  if (!existing) return state;
  if (action.type === "score-changed")
    return {
      ...state,
      entries: {
        ...state.entries,
        [action.matchId]: changeEntry(existing, action.team, action.games),
      },
    };
  if (action.generation !== state.generation) return state;
  const entry =
    action.type === "save-started"
      ? beginSave(existing, action.token, action.snapshot)
      : finishSave(existing, action.token, action.succeeded);
  if (entry === existing) return state;
  return {
    ...state,
    entries: { ...state.entries, [action.matchId]: entry },
  };
}

export function useRoundResults({
  round,
  mutate,
}: {
  round: Round | null;
  mutate: ResultMutation;
}): RoundResults {
  const [state, dispatch] = useReducer(resultReducer, round, roundState);
  const [completion, setCompletion] = useState({
    busy: false,
    failed: false,
    roundId: round?.id ?? null,
  });
  const inFlight = useRef(new Set<string>());
  const saveToken = useRef(0);
  const completing = useRef(false);

  useEffect(() => {
    dispatch({ type: "source-changed", round });
  }, [round]);

  useEffect(() => {
    completing.current = false;
    setCompletion({
      busy: false,
      failed: false,
      roundId: round?.id ?? null,
    });
  }, [round?.id]);

  const policy = getRoundPolicy(round?.state);
  const active = policy.resultAccess === "entry";

  useEffect(() => {
    if (!active || !round || state.roundId !== round.id) return;
    for (const entry of Object.values(state.entries)) {
      if (
        validateScore(entry.draft) !== "valid" ||
        entryPersistence(entry) !== "dirty" ||
        entry.saving
      )
        continue;
      const draftKey = scoreKey(entry.draft);
      if (draftKey === null || entry.failedKey === draftKey) continue;
      const requestKey = state.generation + ":" + entry.matchId;
      if (inFlight.current.has(requestKey)) continue;
      inFlight.current.add(requestKey);
      const token = ++saveToken.current;
      const snapshot = entry.draft;
      const generation = state.generation;
      dispatch({
        type: "save-started",
        matchId: entry.matchId,
        token,
        snapshot,
        generation,
      });
      void mutate("/admin/matches/" + entry.matchId + "/result", {
        method: "PUT",
        body: JSON.stringify({
          teamAGames: snapshot.teamA,
          teamBGames: snapshot.teamB,
        }),
      })
        .then(() => {
          inFlight.current.delete(requestKey);
          dispatch({
            type: "save-finished",
            matchId: entry.matchId,
            token,
            succeeded: true,
            generation,
          });
        })
        .catch(() => {
          inFlight.current.delete(requestKey);
          dispatch({
            type: "save-finished",
            matchId: entry.matchId,
            token,
            succeeded: false,
            generation,
          });
        });
    }
  }, [active, mutate, round, state]);

  const change = useCallback(
    (matchId: string, team: ScoreTeam, games: number | null) =>
      dispatch({ type: "score-changed", matchId, team, games }),
    [],
  );

  const entries = useMemo(() => {
    const result = new Map<string, RoundResultEntry>();
    for (const match of round?.matches ?? []) {
      const entry =
        state.roundId === round?.id
          ? state.entries[match.id]
          : createEntryState(match, persistedPlayedScore(match));
      if (!entry) continue;
      result.set(match.id, {
        matchId: match.id,
        draft: entry.draft,
        editable: active,
        validation: validateScore(entry.draft),
        persistence: entryPersistence(entry),
        change: (team, games) => change(match.id, team, games),
      });
    }
    return result;
  }, [active, change, round, state.entries, state.roundId]);

  const progress = useMemo(() => {
    const matches = round?.matches ?? [];
    const recorded = matches.filter(
      (match) => match.result_type === "played",
    ).length;
    const allLocallyConfirmed = matches.every((match) => {
      const entry = entries.get(match.id);
      return entry?.persistence === "saved";
    });
    const canComplete =
      policy.canComplete &&
      matches.length > 0 &&
      recorded === matches.length &&
      allLocallyConfirmed;
    return {
      recorded,
      total: matches.length,
      percent: matches.length ? (recorded / matches.length) * 100 : 0,
      canComplete,
    };
  }, [entries, policy.canComplete, round?.matches]);

  const completeRound = useCallback(() => {
    if (!round || !progress.canComplete || completing.current) return;
    completing.current = true;
    setCompletion({ busy: true, failed: false, roundId: round.id });
    void mutate("/admin/rounds/" + round.id + "/complete", {
      method: "POST",
      body: JSON.stringify({ allowMissing: false }),
    })
      .then(() =>
        setCompletion({ busy: false, failed: false, roundId: round.id }),
      )
      .catch(() =>
        setCompletion({ busy: false, failed: true, roundId: round.id }),
      )
      .finally(() => {
        completing.current = false;
      });
  }, [mutate, progress.canComplete, round]);

  const completionForRound =
    completion.roundId === (round?.id ?? null)
      ? completion
      : { busy: false, failed: false };

  return {
    active,
    entries,
    progress,
    completion: {
      allowed: progress.canComplete && !completionForRound.busy,
      busy: completionForRound.busy,
      failed: completionForRound.failed,
      run: completeRound,
    },
  };
}
