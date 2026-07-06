import { describe, expect, it } from "vitest";
import {
  canCompleteRound,
  countCompletedResults,
  shouldAutoSaveScore,
} from "./admin-dashboard-state";

describe("admin dashboard result state", () => {
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
    expect(
      canCompleteRound("results", [
        { result_type: "played" },
        { result_type: "played" },
      ]),
    ).toBe(true);
    expect(
      canCompleteRound("results", [
        { result_type: "played" },
        { result_type: "pending" },
      ]),
    ).toBe(false);
    expect(canCompleteRound("running", [{ result_type: "played" }])).toBe(
      false,
    );
    expect(canCompleteRound("results", [])).toBe(false);
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
