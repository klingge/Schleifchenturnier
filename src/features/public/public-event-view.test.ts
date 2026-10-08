import { describe, expect, it } from "vitest";
import type { Player } from "@/domain/tournament";
import { getPublicRoundStatus, getVisiblePlayers } from "./public-event-view";

const player = (id: string, display_name: string): Player => ({
  id,
  display_name,
  emoji: "🎾",
  active: 1,
  wins: 0,
  gameDifference: 0,
  sitOuts: 0,
  rank: 1,
});

describe("public event orientation", () => {
  it("uses participant-facing labels for every round state", () => {
    expect(getPublicRoundStatus("published")).toBe("Start folgt");
    expect(getPublicRoundStatus("running")).toBe("Runde läuft");
    expect(getPublicRoundStatus("paused")).toBe("Runde pausiert");
    expect(getPublicRoundStatus("results")).toBe("Ergebnisse werden erfasst");
    expect(getPublicRoundStatus("completed")).toBe("Runde abgeschlossen");
  });

  it("sorts names alphabetically and searches without case sensitivity", () => {
    const players = [
      player("zoe", "Zoë"),
      player("anna", "Anna"),
      player("aron", "Äron"),
    ];

    expect(getVisiblePlayers(players, "").map((entry) => entry.id)).toEqual([
      "anna",
      "aron",
      "zoe",
    ]);
    expect(getVisiblePlayers(players, "AN").map((entry) => entry.id)).toEqual([
      "anna",
    ]);
  });
});
