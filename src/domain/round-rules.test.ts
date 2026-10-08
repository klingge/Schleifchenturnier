import { describe, expect, it } from "vitest";

import {
  getRoundPolicy,
  getRoundTransition,
  roundActions,
  type RoundAction,
  type RoundPolicy,
  type RoundState,
} from "./round-rules";

const policies = [
  [
    null,
    {
      configurationLocked: false,
      canGenerate: true,
      resultAccess: "closed",
      canComplete: false,
      clock: "hidden",
      allowedActions: [],
    },
  ],
  [
    "published",
    {
      configurationLocked: true,
      canGenerate: true,
      resultAccess: "closed",
      canComplete: false,
      clock: "hidden",
      allowedActions: ["start"],
    },
  ],
  [
    "running",
    {
      configurationLocked: true,
      canGenerate: false,
      resultAccess: "entry",
      canComplete: true,
      clock: "running",
      allowedActions: ["pause", "end", "skip"],
    },
  ],
  [
    "paused",
    {
      configurationLocked: true,
      canGenerate: false,
      resultAccess: "entry",
      canComplete: true,
      clock: "paused",
      allowedActions: ["resume", "end", "skip"],
    },
  ],
  [
    "results",
    {
      configurationLocked: true,
      canGenerate: false,
      resultAccess: "entry",
      canComplete: true,
      clock: "hidden",
      allowedActions: [],
    },
  ],
  [
    "completed",
    {
      configurationLocked: false,
      canGenerate: true,
      resultAccess: "correction",
      canComplete: false,
      clock: "hidden",
      allowedActions: [],
    },
  ],
  [
    "discarded",
    {
      configurationLocked: false,
      canGenerate: false,
      resultAccess: "closed",
      canComplete: false,
      clock: "hidden",
      allowedActions: [],
    },
  ],
] satisfies ReadonlyArray<readonly [RoundState | null, RoundPolicy]>;

describe("getRoundPolicy", () => {
  it.each(policies)("describes the capabilities for %s", (state, policy) => {
    expect(getRoundPolicy(state)).toEqual(policy);
  });
});

const expectedTransitions: Record<
  RoundState,
  Partial<Record<RoundAction, RoundState>>
> = {
  published: { start: "running" },
  running: { pause: "paused", end: "results", skip: "results" },
  paused: { resume: "running", end: "results", skip: "results" },
  results: {},
  completed: {},
  discarded: {},
};

describe("getRoundTransition", () => {
  for (const state of Object.keys(expectedTransitions) as RoundState[]) {
    for (const action of roundActions) {
      it(`${state} + ${action}`, () => {
        expect(getRoundTransition(state, action)).toBe(
          expectedTransitions[state][action] ?? null,
        );
      });
    }
  }
});
