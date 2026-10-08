// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { EventData } from "@/domain/tournament";
import { api } from "@/lib/api";
import { PublicEvent } from "./PublicEvent";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));

const eventData: EventData = {
  event: {
    id: "event",
    public_slug: "demo",
    name: "Sommerfest",
    event_date: "2026-08-15",
    default_round_duration_seconds: 1200,
    status: "active",
    planned_round_count: null,
    finished_at: null,
    revision: 1,
  },
  players: [
    {
      id: "mara",
      display_name: "Mara",
      emoji: "🦊",
      active: 1,
      wins: 1,
      gameDifference: 3,
      sitOuts: 0,
      rank: 1,
    },
    {
      id: "nele",
      display_name: "Nele",
      emoji: "🐬",
      active: 1,
      wins: 0,
      gameDifference: -1,
      sitOuts: 0,
      rank: 2,
    },
    {
      id: "theo",
      display_name: "Theo",
      emoji: "🐨",
      active: 1,
      wins: 0,
      gameDifference: -1,
      sitOuts: 0,
      rank: 2,
    },
    {
      id: "leni",
      display_name: "Leni",
      emoji: "🦄",
      active: 1,
      wins: 0,
      gameDifference: -1,
      sitOuts: 0,
      rank: 2,
    },
  ],
  courts: [{ id: "center", name: "Center Court", position: 1, active: 1 }],
  leaderboard: [],
  rounds: [],
  currentRound: {
    id: "round",
    round_number: 1,
    state: "published",
    duration_seconds: 1200,
    expires_at: null,
    matches: [
      {
        id: "match",
        court_number: 1,
        court_id: "center",
        court_name_snapshot: "Center Court",
        team_a_player_1_id: "mara",
        team_a_player_2_id: "nele",
        team_b_player_1_id: "theo",
        team_b_player_2_id: "leni",
        team_a_games: null,
        team_b_games: null,
        result_type: "played",
      },
    ],
    sitting_out_player_ids: [],
  },
};

function renderPublicEvent() {
  const router = createMemoryRouter(
    [{ path: "/event/:slug", element: <PublicEvent /> }],
    { initialEntries: ["/event/demo"] },
  );
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api).mockReset();
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});

afterEach(cleanup);

describe("public event refresh behavior", () => {
  it("keeps the current assignment when a refresh is temporarily interrupted", async () => {
    vi.mocked(api).mockResolvedValueOnce(eventData);
    renderPublicEvent();

    expect(
      await screen.findByRole("heading", { name: "Sommerfest" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mara" }));
    expect(screen.getByText("Center Court")).toBeTruthy();

    vi.mocked(api).mockRejectedValueOnce(new Error("Netzwerk getrennt"));
    fireEvent.click(screen.getByRole("button", { name: "Aktualisieren" }));

    expect(await screen.findByText(/Aktualisierung unterbrochen/)).toBeTruthy();
    expect(screen.getByText("Center Court")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Name wechseln" })).toBeTruthy();
  });

  it("clears stale event data after confirmed nonavailability", async () => {
    vi.mocked(api).mockResolvedValueOnce(eventData);
    renderPublicEvent();

    await screen.findByRole("heading", { name: "Sommerfest" });
    vi.mocked(api).mockRejectedValueOnce(
      Object.assign(new Error("Veranstaltung nicht gefunden."), {
        status: 404,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Aktualisieren" }));

    expect(
      await screen.findByRole("heading", { name: "Nicht verfügbar" }),
    ).toBeTruthy();
    expect(screen.queryByText("Center Court")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Erneut versuchen" }),
    ).toBeTruthy();
  });
});
