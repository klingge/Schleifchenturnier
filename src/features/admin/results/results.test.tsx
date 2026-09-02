// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Match, Round } from "@/domain/tournament";
import {
  useResultCorrection,
  useRoundResults,
  type ResultMutation,
} from "@/features/admin/results";

function match(
  id: string,
  result: {
    type?: string;
    teamA?: number | null;
    teamB?: number | null;
  } = {},
): Match {
  return {
    id,
    court_number: 1,
    court_name_snapshot: "Platz 1",
    team_a_player_1_id: "p1",
    team_a_player_2_id: "p2",
    team_b_player_1_id: "p3",
    team_b_player_2_id: "p4",
    team_a_games: result.teamA ?? null,
    team_b_games: result.teamB ?? null,
    result_type: result.type ?? "pending",
  };
}

function round(
  id: string,
  matches: Match[],
  state: Round["state"] = "results",
): Round {
  return {
    id,
    round_number: 1,
    state,
    duration_seconds: 1200,
    expires_at: null,
    matches,
    sitting_out_player_ids: [],
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function entry(
  current: ReturnType<typeof useRoundResults>,
  matchId = "match-1",
) {
  const result = current.entries.get(matchId);
  if (!result) throw new Error("Expected result entry");
  return result;
}

describe("useRoundResults", () => {
  it("auto-saves one valid changed result through its public interface", async () => {
    const mutate = vi.fn<ResultMutation>().mockResolvedValue();
    const currentRound = round("round-1", [match("match-1")]);
    const { result } = renderHook(() =>
      useRoundResults({ round: currentRound, mutate }),
    );

    act(() => entry(result.current).change("teamA", 6));
    expect(entry(result.current).validation).toBe("incomplete");
    expect(mutate).not.toHaveBeenCalled();

    act(() => entry(result.current).change("teamB", 4));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledWith("/admin/matches/match-1/result", {
      method: "PUT",
      body: JSON.stringify({ teamAGames: 6, teamBGames: 4 }),
    });
    await waitFor(() =>
      expect(entry(result.current).persistence).toBe("saved"),
    );
  });

  it("does not save a draw", async () => {
    const mutate = vi.fn<ResultMutation>().mockResolvedValue();
    const { result } = renderHook(() =>
      useRoundResults({
        round: round("round-1", [match("match-1")]),
        mutate,
      }),
    );

    act(() => {
      entry(result.current).change("teamA", 4);
      entry(result.current).change("teamB", 4);
    });

    await waitFor(() => expect(entry(result.current).validation).toBe("draw"));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("does not loop after a failed auto-save and retries after a real change", async () => {
    const mutate = vi
      .fn<ResultMutation>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce();
    const { result } = renderHook(() =>
      useRoundResults({
        round: round("round-1", [match("match-1")]),
        mutate,
      }),
    );

    act(() => {
      entry(result.current).change("teamA", 6);
      entry(result.current).change("teamB", 4);
    });

    await waitFor(() =>
      expect(entry(result.current).persistence).toBe("failed"),
    );
    expect(mutate).toHaveBeenCalledTimes(1);

    act(() => entry(result.current).change("teamA", 5));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(entry(result.current).persistence).toBe("saved"),
    );
  });

  it("serializes saves per match and sends the newest valid draft next", async () => {
    const first = deferred();
    const mutate = vi
      .fn<ResultMutation>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce();
    const { result } = renderHook(() =>
      useRoundResults({
        round: round("round-1", [match("match-1")]),
        mutate,
      }),
    );

    act(() => {
      entry(result.current).change("teamA", 6);
      entry(result.current).change("teamB", 4);
    });
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));

    act(() => {
      entry(result.current).change("teamA", 7);
      entry(result.current).change("teamB", 5);
    });
    expect(mutate).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve());

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
    expect(mutate.mock.calls[1]).toEqual([
      "/admin/matches/match-1/result",
      {
        method: "PUT",
        body: JSON.stringify({ teamAGames: 7, teamBGames: 5 }),
      },
    ]);
  });

  it("ignores a late save response after the round changes", async () => {
    const first = deferred();
    const mutate = vi.fn<ResultMutation>().mockReturnValue(first.promise);
    const firstRound = round("round-1", [match("match-1")]);
    const nextRound = round("round-2", [match("match-2")]);
    const { result, rerender } = renderHook(
      ({ currentRound }) => useRoundResults({ round: currentRound, mutate }),
      { initialProps: { currentRound: firstRound } },
    );

    act(() => {
      entry(result.current).change("teamA", 6);
      entry(result.current).change("teamB", 4);
    });
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));

    rerender({ currentRound: nextRound });
    await waitFor(() =>
      expect(result.current.entries.has("match-2")).toBe(true),
    );
    await act(async () => first.resolve());

    expect(entry(result.current, "match-2").persistence).toBe("open");
  });

  it("derives progress and submits completion exactly once", async () => {
    const mutate = vi.fn<ResultMutation>().mockResolvedValue();
    const played = match("match-1", {
      type: "played",
      teamA: 6,
      teamB: 3,
    });
    const currentRound = round("round-1", [played]);
    const { result } = renderHook(() =>
      useRoundResults({ round: currentRound, mutate }),
    );

    expect(result.current.progress).toEqual({
      recorded: 1,
      total: 1,
      percent: 100,
      canComplete: true,
    });

    act(() => {
      result.current.completion.run();
      result.current.completion.run();
    });

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledWith("/admin/rounds/round-1/complete", {
      method: "POST",
      body: JSON.stringify({ allowMissing: false }),
    });
  });

  it("blocks completion for invalid, saving, and failed local entries", async () => {
    const pending = deferred();
    const mutate = vi.fn<ResultMutation>().mockReturnValueOnce(pending.promise);
    const played = match("match-1", {
      type: "played",
      teamA: 6,
      teamB: 3,
    });
    const { result } = renderHook(() =>
      useRoundResults({
        round: round("round-1", [played]),
        mutate,
      }),
    );

    act(() => entry(result.current).change("teamB", 6));
    expect(entry(result.current).validation).toBe("draw");
    expect(result.current.completion.allowed).toBe(false);

    act(() => entry(result.current).change("teamB", 4));
    await waitFor(() =>
      expect(entry(result.current).persistence).toBe("saving"),
    );
    expect(result.current.completion.allowed).toBe(false);

    await act(async () => pending.reject(new Error("offline")));
    await waitFor(() =>
      expect(entry(result.current).persistence).toBe("failed"),
    );
    act(() => result.current.completion.run());

    expect(mutate.mock.calls.some(([path]) => path.endsWith("/complete"))).toBe(
      false,
    );
  });
});

describe("useResultCorrection", () => {
  it("keeps correction explicit and restores the persisted score on cancel", () => {
    const mutate = vi.fn<ResultMutation>().mockResolvedValue();
    const played = match("match-1", {
      type: "played",
      teamA: 6,
      teamB: 3,
    });
    const { result } = renderHook(() =>
      useResultCorrection({ match: played, mutate }),
    );

    act(() => {
      result.current.begin();
      result.current.change("teamA", 4);
    });

    expect(result.current.draft.teamA).toBe(4);
    expect(mutate).not.toHaveBeenCalled();

    act(() => result.current.cancel());
    expect(result.current.editing).toBe(false);
    expect(result.current.draft).toEqual({ teamA: 6, teamB: 3 });
  });

  it("saves only on request and allows a manual retry after failure", async () => {
    const mutate = vi
      .fn<ResultMutation>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce();
    const played = match("match-1", {
      type: "played",
      teamA: 6,
      teamB: 3,
    });
    const { result } = renderHook(() =>
      useResultCorrection({ match: played, mutate }),
    );

    act(() => {
      result.current.begin();
      result.current.change("teamA", 5);
    });
    expect(mutate).not.toHaveBeenCalled();

    act(() => result.current.save());
    await waitFor(() => expect(result.current.persistence).toBe("failed"));

    act(() => result.current.save());
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.committed).toBe(true));
    expect(result.current.editing).toBe(false);
  });

  it("keeps a newer correction draft open when an older save finishes", async () => {
    const pending = deferred();
    const mutate = vi.fn<ResultMutation>().mockReturnValue(pending.promise);
    const played = match("match-1", {
      type: "played",
      teamA: 6,
      teamB: 3,
    });
    const { result } = renderHook(() =>
      useResultCorrection({ match: played, mutate }),
    );

    act(() => result.current.begin());
    act(() => result.current.change("teamA", 5));
    act(() => result.current.save());
    await waitFor(() => expect(result.current.persistence).toBe("saving"));

    act(() => result.current.change("teamA", 4));
    await act(async () => pending.resolve());

    expect(result.current.editing).toBe(true);
    expect(result.current.draft.teamA).toBe(4);
    expect(result.current.persistence).toBe("dirty");
  });
});
