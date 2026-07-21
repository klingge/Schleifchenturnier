import { describe, expect, it } from "vitest";
import {
  canCompleteRound,
  canCompleteRoundWithEntries,
  countCompletedResults,
  getRoundSecondsLeft,
  isResultEntryRoundState,
  shouldAutoSaveScore,
} from "./admin-dashboard-state";

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

  it("counts only played matches as completed results", () => {
    expect(
      countCompletedResults([
        { result_type: "played" },
        { result_type: "pending" },
        { result_type: "missing" },
      ]),
    ).toBe(1);
  });

  it("enables round completion only when every result is played", () => {
    const playedMatches = [
      { result_type: "played" },
      { result_type: "played" },
    ];

    expect(isResultEntryRoundState("running")).toBe(true);
    expect(isResultEntryRoundState("paused")).toBe(true);
    expect(isResultEntryRoundState("results")).toBe(true);
    expect(canCompleteRound("running", playedMatches)).toBe(true);
    expect(canCompleteRound("paused", playedMatches)).toBe(true);
    expect(canCompleteRound("results", playedMatches)).toBe(true);
    expect(
      canCompleteRound("results", [
        { result_type: "played" },
        { result_type: "pending" },
      ]),
    ).toBe(false);
    expect(canCompleteRound("published", playedMatches)).toBe(false);
    expect(canCompleteRound("completed", playedMatches)).toBe(false);
    expect(canCompleteRound("results", [])).toBe(false);
  });

  it("disables round completion when a local entry is invalid or saving", () => {
    const matches = [
      { id: "match-1", result_type: "played" },
      { id: "match-2", result_type: "played" },
    ];

    expect(
      canCompleteRoundWithEntries("running", matches, {
        "match-1": {
          complete: true,
          valid: true,
          saved: true,
          saving: false,
          failed: false,
        },
        "match-2": {
          complete: true,
          valid: true,
          saved: true,
          saving: false,
          failed: false,
        },
      }),
    ).toBe(true);

    expect(
      canCompleteRoundWithEntries("results", matches, {
        "match-1": {
          complete: false,
          valid: false,
          saved: false,
          saving: false,
          failed: false,
        },
        "match-2": {
          complete: true,
          valid: true,
          saved: true,
          saving: false,
          failed: false,
        },
      }),
    ).toBe(false);

    expect(
      canCompleteRoundWithEntries("results", matches, {
        "match-1": {
          complete: false,
          valid: true,
          saved: false,
          saving: true,
          failed: false,
        },
        "match-2": {
          complete: true,
          valid: true,
          saved: true,
          saving: false,
          failed: false,
        },
      }),
    ).toBe(false);
  });

  it("auto-saves only valid changed non-draw scores", () => {
    expect(
      shouldAutoSaveScore({
        resultMode: true,
        a: 6,
        b: 4,
        currentKey: "6:4",
        lastSaved: "",
        failedKey: "",
        saving: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoSaveScore({
        resultMode: true,
        a: 5,
        b: 5,
        currentKey: "5:5",
        lastSaved: "",
        failedKey: "",
        saving: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoSaveScore({
        resultMode: true,
        a: 6,
        b: 4,
        currentKey: "6:4",
        lastSaved: "6:4",
        failedKey: "",
        saving: false,
      }),
    ).toBe(false);
  });
});
