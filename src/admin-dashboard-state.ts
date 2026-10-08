import type { VisibleRoundState } from "./domain/round-rules";

export type TimerRoundState = {
  state: VisibleRoundState;
  duration_seconds: number;
  expires_at: string | null;
  paused_at?: string | null;
};

export type InitialSetupTab = "teilnehmer" | "plaetze" | "dashboard";

const germanNameCollator = new Intl.Collator("de", {
  numeric: true,
  sensitivity: "base",
});

export function compareCourtsByName(
  a: { name: string; position: number },
  b: { name: string; position: number },
) {
  return germanNameCollator.compare(a.name, b.name) || a.position - b.position;
}

export function comparePlayersByName(
  a: { id: string; display_name: string },
  b: { id: string; display_name: string },
) {
  return (
    germanNameCollator.compare(a.display_name, b.display_name) ||
    a.id.localeCompare(b.id)
  );
}

export function getInitialSetupTab(
  activePlayerCount: number,
  activeCourtCount: number,
): InitialSetupTab {
  if (activePlayerCount < 4) return "teilnehmer";
  if (activeCourtCount < 1) return "plaetze";
  return "dashboard";
}

export function getSittingOutCount(
  activePlayerCount: number,
  activeCourtCount: number,
) {
  const players = Math.max(0, Math.floor(activePlayerCount));
  const courts = Math.max(0, Math.floor(activeCourtCount));
  const playableCount = Math.min(courts * 4, Math.floor(players / 4) * 4);
  return players - playableCount;
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
