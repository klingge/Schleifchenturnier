export type ResultMatchState = {
  id?: string;
  result_type: string;
};

export type MatchEntryStatus = {
  complete: boolean;
  valid: boolean;
  saved: boolean;
  saving: boolean;
  failed: boolean;
};

export type TimerRoundState = {
  state: string;
  duration_seconds: number;
  expires_at: string | null;
  paused_at?: string | null;
};

const resultEntryRoundStates = new Set(["running", "paused", "results"]);

export function isResultEntryRoundState(
  roundState: string | null | undefined,
) {
  return resultEntryRoundStates.has(roundState ?? "");
}

export function getRoundSecondsLeft(round: TimerRoundState, now = Date.now()) {
  if (!round.expires_at) return round.duration_seconds;
  const referenceTime =
    round.state === "paused" && round.paused_at
      ? Date.parse(round.paused_at)
      : now;
  return Math.max(
    0,
    Math.ceil((Date.parse(round.expires_at) - referenceTime) / 1000),
  );
}

export function countCompletedResults(matches: ResultMatchState[]) {
  return matches.filter((match) => match.result_type === "played").length;
}

export function canCompleteRound(
  roundState: string | null | undefined,
  matches: ResultMatchState[],
) {
  return (
    isResultEntryRoundState(roundState) &&
    matches.length > 0 &&
    matches.every((match) => match.result_type === "played")
  );
}

export function canCompleteRoundWithEntries(
  roundState: string | null | undefined,
  matches: ResultMatchState[],
  entries: Record<string, MatchEntryStatus | undefined>,
) {
  return (
    canCompleteRound(roundState, matches) &&
    matches.every((match, index) => {
      const key = match.id ?? String(index);
      const entry = entries[key];
      return entry ? entry.complete : match.result_type === "played";
    })
  );
}

export function shouldAutoSaveScore({
  resultMode,
  a,
  b,
  currentKey,
  lastSaved,
  failedKey,
  saving,
}: {
  resultMode: boolean;
  a: number | null;
  b: number | null;
  currentKey: string;
  lastSaved: string;
  failedKey: string;
  saving: boolean;
}) {
  return (
    resultMode &&
    a !== null &&
    b !== null &&
    a !== b &&
    currentKey !== lastSaved &&
    currentKey !== failedKey &&
    !saving
  );
}
