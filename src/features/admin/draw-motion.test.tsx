// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { api } from "@/lib/api";
import type { EventData } from "@/domain/tournament";
import { EventAdmin } from "./EventAdmin";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
const players = ["Anna", "Ben", "Caro", "David"].map((display_name, index) => ({
  id: `p${index}`,
  display_name,
  emoji: ["🦊", "🐬", "🐨", "🦄"][index],
  active: 1,
  wins: 0,
  gameDifference: 0,
  sitOuts: 0,
  rank: index + 1,
}));
const lobby: EventData = {
  event: {
    id: "event",
    name: "Sommerfest",
    public_slug: "demo",
    event_date: "2026-10-08",
    default_round_duration_seconds: 1200,
    status: "active",
    planned_round_count: null,
    finished_at: null,
    revision: 1,
  },
  players,
  leaderboard: players,
  courts: [{ id: "court", name: "Center Court", position: 1, active: 1 }],
  rounds: [],
  currentRound: null,
};
const published: EventData = {
  ...lobby,
  currentRound: {
    id: "round",
    round_number: 1,
    state: "published",
    duration_seconds: 1200,
    expires_at: null,
    sitting_out_player_ids: [],
    matches: [
      {
        id: "match",
        court_number: 1,
        court_id: "court",
        court_name_snapshot: "Center Court",
        team_a_player_1_id: "p0",
        team_a_player_2_id: "p1",
        team_b_player_1_id: "p2",
        team_b_player_2_id: "p3",
        team_a_games: null,
        team_b_games: null,
        result_type: "played",
      },
    ],
  },
};
beforeEach(() => {
  vi.mocked(api).mockReset();
  window.scrollTo = vi.fn();
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
async function openAdmin(initial = lobby) {
  vi.mocked(api).mockResolvedValueOnce(initial);
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            path: "/admin/events/:id/dashboard",
            element: <EventAdmin logout={vi.fn()} />,
          },
        ],
        { initialEntries: ["/admin/events/event/dashboard"] },
      )}
    />,
  );
  return await screen.findByRole("button", { name: "Erste Runde auslosen" });
}
describe("draw feedback", () => {
  it("starts mixing immediately, stops after 600 ms and reveals confirmed data without waiting", async () => {
    const button = await openAdmin();
    let resolve!: (value: object) => void;
    vi.mocked(api)
      .mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      )
      .mockResolvedValueOnce(published);
    vi.useFakeTimers();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(
      vi.mocked(api).mock.calls.filter(([path]) => path.endsWith("/generate")),
    ).toHaveLength(1);
    expect(document.querySelector(".draw-tokens.is-mixing")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Doppel werden ausgelost",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(document.querySelector(".draw-tokens.is-mixing")).toBeNull();
    await act(async () => {
      resolve({});
    });
    expect(document.querySelector(".match.is-draw-reveal")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Erste Runde starten",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(document.querySelector(".draw-feedback")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(document.querySelector(".is-draw-reveal")).toBeNull();
  });
  it("does not reveal on failure and allows a retry", async () => {
    const button = await openAdmin();
    vi.mocked(api).mockRejectedValueOnce(new Error("Verbindung unterbrochen"));
    fireEvent.click(button);
    await screen.findByText("Verbindung unterbrochen");
    expect(document.querySelector(".is-draw-reveal")).toBeNull();
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
    vi.mocked(api).mockResolvedValueOnce({}).mockResolvedValueOnce(published);
    fireEvent.click(button);
    await screen.findByRole("button", { name: "Erste Runde starten" });
    expect(document.querySelector(".is-draw-reveal")).toBeTruthy();
  });
  it("publishes immediately with reduced motion", async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const button = await openAdmin();
    vi.mocked(api).mockResolvedValueOnce({}).mockResolvedValueOnce(published);
    fireEvent.click(button);
    await screen.findByRole("button", { name: "Erste Runde starten" });
    expect(document.querySelector(".is-mixing, .is-draw-reveal")).toBeNull();
  });

  function multiCourtData(count: number): EventData {
    const nextPlayers = Array.from({ length: count * 4 }, (_, index) => ({
      ...players[index % 4],
      id: `player-${index}`,
      display_name: `Spieler ${index + 1}`,
    }));
    const courts = Array.from({ length: count }, (_, index) => ({
      ...lobby.courts[0],
      id: `court-${index}`,
      name: `Platz ${index + 1}`,
      position: index + 1,
    }));
    return {
      ...published,
      players: nextPlayers,
      leaderboard: nextPlayers,
      courts,
      currentRound: {
        ...published.currentRound!,
        matches: courts.map((court, index) => ({
          ...published.currentRound!.matches[0],
          id: `match-${index}`,
          court_id: court.id,
          court_number: court.position,
          court_name_snapshot: court.name,
          team_a_player_1_id: nextPlayers[index * 4].id,
          team_a_player_2_id: nextPlayers[index * 4 + 1].id,
          team_b_player_1_id: nextPlayers[index * 4 + 2].id,
          team_b_player_2_id: nextPlayers[index * 4 + 3].id,
        })),
      },
    };
  }

  it.each([1, 4, 13])(
    "reserves %i court cards in order and keeps the reveal for the whole sequence",
    async (count) => {
      const next = multiCourtData(count);
      const button = await openAdmin({ ...next, currentRound: null });
      vi.useFakeTimers();
      vi.mocked(api).mockResolvedValueOnce({}).mockResolvedValueOnce(next);
      await act(async () => {
        fireEvent.click(button);
      });
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(".match"),
      );
      expect(cards).toHaveLength(count);
      expect(
        cards.map((card) => card.querySelector(".court-label b")?.textContent),
      ).toEqual(next.courts.map((court) => court.name));
      expect(cards.map((card) => card.style.animationDelay)).toEqual(
        next.courts.map((_, index) => `${index * 650}ms`),
      );
      expect(
        (
          screen.getByRole("button", {
            name: "Erste Runde starten",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(count * 650 - 1);
      });
      expect(document.querySelectorAll(".is-draw-reveal")).toHaveLength(count);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(document.querySelectorAll(".is-draw-reveal")).toHaveLength(0);
      expect(Array.from(document.querySelectorAll(".match"))).toEqual(cards);
    },
  );

  it("shows all courts immediately when a round is started during the reveal", async () => {
    const next = multiCourtData(4);
    const button = await openAdmin({ ...next, currentRound: null });
    vi.useFakeTimers();
    vi.mocked(api).mockResolvedValueOnce({}).mockResolvedValueOnce(next);
    await act(async () => {
      fireEvent.click(button);
    });
    const cards = Array.from(document.querySelectorAll(".match"));
    expect(document.querySelectorAll(".is-draw-reveal")).toHaveLength(4);
    const running: EventData = {
      ...next,
      currentRound: {
        ...next.currentRound!,
        state: "running",
        expires_at: new Date(Date.now() + 1200000).toISOString(),
      },
    };
    vi.mocked(api).mockResolvedValueOnce({}).mockResolvedValueOnce(running);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Erste Runde starten" }),
      );
    });
    expect(document.querySelector(".is-draw-reveal")).toBeNull();
    expect(Array.from(document.querySelectorAll(".match"))).toEqual(cards);
    expect(
      document.querySelector(".clock-readout .tournament-start-icon"),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Ergebnisse erfassen" }),
    ).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(360);
    });
    expect(document.querySelector(".tournament-start-icon")).toBeNull();
  });

  it("finishes all courts immediately when the tab becomes hidden and never replays them", async () => {
    const next = multiCourtData(4);
    const button = await openAdmin({ ...next, currentRound: null });
    vi.mocked(api).mockResolvedValueOnce({}).mockResolvedValueOnce(next);
    await act(async () => {
      fireEvent.click(button);
    });
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(document.querySelector(".is-draw-reveal")).toBeNull();
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(document.querySelector(".is-draw-reveal")).toBeNull();
    expect(document.querySelectorAll(".match")).toHaveLength(4);
  });
});
