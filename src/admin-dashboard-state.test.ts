import { describe, expect, it } from "vitest";
import {
  compareCourtsByName,
  comparePlayersByName,
  getInitialSetupTab,
  getRoundSecondsLeft,
  getSittingOutCount,
} from "./admin-dashboard-state";

describe("participant management", () => {
  it("sorts participant names using German, case-insensitive natural ordering", () => {
    const players = [
      { id: "7", display_name: "Zoë" },
      { id: "6", display_name: "Spieler 10" },
      { id: "5", display_name: "annika" },
      { id: "4", display_name: "Änne" },
      { id: "3", display_name: "Spieler 2" },
      { id: "2", display_name: "Ben" },
      { id: "1", display_name: "Anna" },
    ];

    expect(
      [...players]
        .sort(comparePlayersByName)
        .map((player) => player.display_name),
    ).toEqual([
      "Anna",
      "Änne",
      "annika",
      "Ben",
      "Spieler 2",
      "Spieler 10",
      "Zoë",
    ]);
  });
});

describe("court management", () => {
  it("sorts court names using German, case-insensitive natural ordering", () => {
    const courts = [
      { name: "Platz 10", position: 1 },
      { name: "äußerer Platz", position: 2 },
      { name: "Platz 2", position: 3 },
      { name: "halle 1", position: 4 },
      { name: "Halle 2", position: 5 },
    ];

    expect(
      [...courts].sort(compareCourtsByName).map((court) => court.name),
    ).toEqual(["äußerer Platz", "halle 1", "Halle 2", "Platz 2", "Platz 10"]);
  });

  it("uses the stored position to keep equal names deterministic", () => {
    const courts = [
      { name: "Platz A", position: 3 },
      { name: "platz a", position: 1 },
      { name: "PLATZ A", position: 2 },
    ];

    expect(
      [...courts].sort(compareCourtsByName).map((court) => court.position),
    ).toEqual([1, 2, 3]);
  });
});

describe("initial tournament setup", () => {
  it("opens the earliest incomplete setup step", () => {
    expect(getInitialSetupTab(0, 0)).toBe("teilnehmer");
    expect(getInitialSetupTab(3, 2)).toBe("teilnehmer");
    expect(getInitialSetupTab(4, 0)).toBe("plaetze");
    expect(getInitialSetupTab(4, 1)).toBe("dashboard");
  });

  it("calculates sit-outs from players and active court capacity", () => {
    expect(getSittingOutCount(17, 1)).toBe(13);
    expect(getSittingOutCount(17, 4)).toBe(1);
    expect(getSittingOutCount(8, 1)).toBe(4);
    expect(getSittingOutCount(8, 2)).toBe(0);
  });

  it("handles missing prerequisites without producing invalid counts", () => {
    expect(getSittingOutCount(3, 1)).toBe(3);
    expect(getSittingOutCount(8, 0)).toBe(8);
    expect(getSittingOutCount(-1, -1)).toBe(0);
  });
});

describe("admin dashboard result state", () => {
  it("keeps an expired control timer at zero without changing state", () => {
    expect(
      getRoundSecondsLeft(
        {
          state: "running",
          duration_seconds: 1200,
          expires_at: "2026-07-11T10:20:00.000Z",
        },
        Date.parse("2026-07-11T10:21:30.000Z"),
      ),
    ).toBe(0);
  });

  it("freezes the control timer at the pause timestamp", () => {
    expect(
      getRoundSecondsLeft(
        {
          state: "paused",
          duration_seconds: 1200,
          expires_at: "2026-07-11T10:20:00.000Z",
          paused_at: "2026-07-11T10:08:30.000Z",
        },
        Date.parse("2026-07-11T10:15:00.000Z"),
      ),
    ).toBe(690);
  });
});
