import { getRoundPolicy, type RoundState } from "./round-rules";

export type EventLifecycle = {
  status: string;
  planned_round_count: number | null;
  finished_at: string | null;
};

export type RoundSummary = { state: RoundState; round_number: number };

export function getEventPolicy(
  event: EventLifecycle,
  round: RoundSummary | null,
) {
  const finished = event.finished_at !== null;
  const archived = event.status === "archived";
  const closed = finished || archived;
  const roundPolicy = getRoundPolicy(round?.state);
  const completedRounds = round?.state === "completed" ? round.round_number : 0;
  const nextRoundNumber =
    round?.state === "published"
      ? round.round_number
      : (round?.round_number ?? 0) + 1;
  return {
    finished,
    archived,
    configurationLocked: closed || roundPolicy.configurationLocked,
    canPlan: !closed && !roundPolicy.configurationLocked,
    canGenerate:
      !closed &&
      roundPolicy.canGenerate &&
      (event.planned_round_count === null ||
        nextRoundNumber <= event.planned_round_count),
    canFinish: !closed && completedRounds > 0,
    canResume: finished && !archived,
    finalRound:
      event.planned_round_count !== null &&
      round?.round_number === event.planned_round_count,
  };
}

export function validRoundPlan(count: number | null, completedRounds = 0) {
  return (
    count === null || (Number.isSafeInteger(count) && count > completedRounds)
  );
}
