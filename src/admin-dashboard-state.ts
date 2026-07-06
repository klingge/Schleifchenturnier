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

export function countCompletedResults(matches: ResultMatchState[]) {
  return matches.filter((match) => match.result_type === "played").length;
}

export function canCompleteRound(
  roundState: string | null | undefined,
  matches: ResultMatchState[],
) {
  return (
    roundState === "results" &&
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
