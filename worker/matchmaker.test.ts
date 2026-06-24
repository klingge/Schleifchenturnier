import { describe, expect, it } from "vitest";
import { generateMatches, pairKey, type MatchPlayer } from "./matchmaker";

const players = (count: number): MatchPlayer[] =>
  Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, rank: index + 1, sitOuts: 0 }));

describe("generateMatches", () => {
  it("assigns every playing participant exactly once", () => {
    const result = generateMatches(players(10), 2, { partners: new Map(), opponents: new Map() }, 42);
    const assigned = result.matches.flatMap((match) => [...match.teamA, ...match.teamB]);
    expect(result.matches).toHaveLength(2);
    expect(new Set(assigned).size).toBe(8);
    expect(result.sittingOut).toHaveLength(2);
  });

  it("prioritizes players with fewer sit-outs to sit out", () => {
    const input = players(6).map((player, index) => ({ ...player, sitOuts: index < 2 ? 0 : 2 }));
    const result = generateMatches(input, 1, { partners: new Map(), opponents: new Map() }, 7);
    expect(new Set(result.sittingOut)).toEqual(new Set(["p1", "p2"]));
  });

  it("avoids a prior partnership when alternatives exist", () => {
    const history = { partners: new Map([[pairKey("p1", "p2"), 1]]), opponents: new Map<string, number>() };
    const result = generateMatches(players(4), 1, history, 12);
    expect(result.repeatedPartners).toBe(0);
  });

  it("is reproducible for a fixed seed", () => {
    const first = generateMatches(players(12), 3, { partners: new Map(), opponents: new Map() }, 123);
    const second = generateMatches(players(12), 3, { partners: new Map(), opponents: new Map() }, 123);
    expect(first).toEqual(second);
  });
});
