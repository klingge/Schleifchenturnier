import type { Player, Round } from "@/domain/tournament";

const germanNameCollator = new Intl.Collator("de", {
  sensitivity: "base",
  numeric: true,
});

export function getPublicRoundStatus(state?: Round["state"]) {
  switch (state) {
    case "running":
      return "Runde läuft";
    case "paused":
      return "Runde pausiert";
    case "results":
      return "Ergebnisse werden erfasst";
    case "completed":
      return "Runde abgeschlossen";
    case "published":
    default:
      return "Start folgt";
  }
}

export function getVisiblePlayers(players: Player[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("de-DE");

  return [...players]
    .sort((a, b) => germanNameCollator.compare(a.display_name, b.display_name))
    .filter((player) =>
      player.display_name.toLocaleLowerCase("de-DE").includes(normalizedQuery),
    );
}
