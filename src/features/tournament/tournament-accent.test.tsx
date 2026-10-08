// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventData, Round } from "@/domain/tournament";
import { useTournamentAccent } from "./useTournamentAccent";

function snapshot(
  state: Round["state"] = "published",
  finished = false,
  round = "round",
): EventData {
  return {
    event: {
      id: "event",
      public_slug: "demo",
      name: "Sommerfest",
      event_date: "2026-10-08",
      status: "active",
      finished_at: finished ? "2026-10-08T12:00:00Z" : null,
      revision: 1,
      default_round_duration_seconds: 1200,
      planned_round_count: null,
    },
    currentRound: {
      id: round,
      round_number: 1,
      state,
      duration_seconds: 1200,
      expires_at: null,
      matches: [],
      sitting_out_player_ids: [],
    },
    players: [],
    courts: [],
    rounds: [],
    leaderboard: [],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("tournament accents", () => {
  it("marks an observed start for 360 ms, keeps unchanged polling from extending it and ignores resume", async () => {
    const { result, rerender } = renderHook(useTournamentAccent, {
      initialProps: snapshot(),
    });
    expect(result.current).toBeNull();
    rerender(snapshot("running"));
    expect(result.current).toBe("start");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    rerender(snapshot("running"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    expect(result.current).toBeNull();
    rerender(snapshot("paused"));
    rerender(snapshot("running"));
    expect(result.current).toBeNull();
  });

  it("gives completion priority and cleans up after 700 ms without animation events", async () => {
    const { result, rerender } = renderHook(useTournamentAccent, {
      initialProps: snapshot(),
    });
    rerender(snapshot("running"));
    rerender(snapshot("running", true));
    expect(result.current).toBe("finish");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(699);
    });
    rerender(snapshot("running", true));
    expect(result.current).toBe("finish");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current).toBeNull();
    rerender(snapshot("completed", true));
    expect(result.current).toBeNull();
  });

  it("does not celebrate first loads, a different event, or a newly received running assignment", () => {
    const { result, rerender } = renderHook(useTournamentAccent, {
      initialProps: snapshot("completed", true),
    });
    expect(result.current).toBeNull();
    const another = snapshot();
    another.event.id = "another";
    rerender(another);
    expect(result.current).toBeNull();
    rerender(snapshot());
    rerender(snapshot("running", false, "redrawn"));
    expect(result.current).toBeNull();
  });

  it("discards changes in hidden tabs and never replays them", () => {
    const { result, rerender } = renderHook(useTournamentAccent, {
      initialProps: snapshot(),
    });
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    rerender(snapshot("running"));
    rerender(snapshot("completed", true));
    expect(result.current).toBeNull();
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    rerender(snapshot("completed", true));
    expect(result.current).toBeNull();
  });

  it("cancels an active accent when hidden, with no replay on return", () => {
    const { result, rerender } = renderHook(useTournamentAccent, {
      initialProps: snapshot(),
    });
    rerender(snapshot("running"));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(result.current).toBeNull();
  });

  it("uses immediate updates with reduced motion", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    const { result, rerender } = renderHook(useTournamentAccent, {
      initialProps: snapshot(),
    });
    rerender(snapshot("running"));
    expect(result.current).toBeNull();
    rerender(snapshot("completed", true));
    expect(result.current).toBeNull();
  });

  it("stops completion feedback when the tournament is continued or archived", () => {
    const { result, rerender } = renderHook(useTournamentAccent, {
      initialProps: snapshot(),
    });
    rerender(snapshot("completed", true));
    expect(result.current).toBe("finish");
    rerender(snapshot("completed"));
    expect(result.current).toBeNull();
    rerender(snapshot("completed", true));
    const archived = snapshot("completed", true);
    archived.event.status = "archived";
    rerender(archived);
    expect(result.current).toBeNull();
  });
});
