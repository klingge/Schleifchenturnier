export const roundActions = [
  "start",
  "pause",
  "resume",
  "end",
  "skip",
] as const;

export type RoundAction = (typeof roundActions)[number];

export type RoundState =
  "published" | "running" | "paused" | "results" | "completed" | "discarded";

export type VisibleRoundState = Exclude<RoundState, "discarded">;

export type RoundPolicy = Readonly<{
  configurationLocked: boolean;
  canGenerate: boolean;
  resultAccess: "closed" | "entry" | "correction";
  canComplete: boolean;
  clock: "hidden" | "running" | "paused";
  allowedActions: readonly RoundAction[];
}>;

const transitions: Record<
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

const policies = {
  published: {
    configurationLocked: true,
    canGenerate: true,
    resultAccess: "closed",
    canComplete: false,
    clock: "hidden",
    allowedActions: ["start"],
  },
  running: {
    configurationLocked: true,
    canGenerate: false,
    resultAccess: "entry",
    canComplete: true,
    clock: "running",
    allowedActions: ["pause", "end", "skip"],
  },
  paused: {
    configurationLocked: true,
    canGenerate: false,
    resultAccess: "entry",
    canComplete: true,
    clock: "paused",
    allowedActions: ["resume", "end", "skip"],
  },
  results: {
    configurationLocked: true,
    canGenerate: false,
    resultAccess: "entry",
    canComplete: true,
    clock: "hidden",
    allowedActions: [],
  },
  completed: {
    configurationLocked: false,
    canGenerate: true,
    resultAccess: "correction",
    canComplete: false,
    clock: "hidden",
    allowedActions: [],
  },
  discarded: {
    configurationLocked: false,
    canGenerate: false,
    resultAccess: "closed",
    canComplete: false,
    clock: "hidden",
    allowedActions: [],
  },
} as const satisfies Record<RoundState, RoundPolicy>;

const noRoundPolicy: RoundPolicy = {
  configurationLocked: false,
  canGenerate: true,
  resultAccess: "closed",
  canComplete: false,
  clock: "hidden",
  allowedActions: [],
};

export function getRoundPolicy(
  state: RoundState | null | undefined,
): RoundPolicy {
  return state ? policies[state] : noRoundPolicy;
}

export function getRoundTransition(
  state: RoundState,
  action: RoundAction,
): RoundState | null {
  return transitions[state][action] ?? null;
}
