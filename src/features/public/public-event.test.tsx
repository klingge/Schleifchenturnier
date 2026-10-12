// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { EventData, Round } from "@/domain/tournament";
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
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("public event refresh behavior", () => {
  const enableMotion = () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  };
  const nextRound = (
    id: string,
    state: Round["state"] = "published",
  ): EventData => ({
    ...eventData,
    currentRound: { ...eventData.currentRound!, id, state },
  });
  async function openAssignment() {
    vi.mocked(api).mockResolvedValueOnce(eventData);
    renderPublicEvent();
    await screen.findByRole("heading", { name: "Sommerfest" });
    fireEvent.click(screen.getByRole("button", { name: "Mara" }));
    return document.querySelector(".public-court-card")!;
  }
  async function refreshWith(next: EventData) {
    vi.mocked(api).mockResolvedValueOnce(next);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aktualisieren" }));
    });
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Aktualisieren",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  }

  it("shows round status once beside the assignment, and moves it back for name selection and final standings", async () => {
    await openAssignment();
    const status = () => document.querySelectorAll(".public-round-status");
    expect(status()).toHaveLength(1);
    expect(status()[0].closest(".detail")).toBeTruthy();
    expect(status()[0].textContent).toBe("Runde 1 · Start folgt");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "auto",
    });
    for (const [state, text] of [
      ["running", "Runde läuft"],
      ["paused", "Runde pausiert"],
      ["results", "Ergebnisse werden erfasst"],
      ["completed", "Runde abgeschlossen"],
    ] as const) {
      await refreshWith(nextRound("round", state));
      expect(status()).toHaveLength(1);
      expect(status()[0].textContent).toBe(`Runde 1 · ${text}`);
      expect(status()[0].closest(".detail")).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Name wechseln" }));
    expect(status()).toHaveLength(1);
    expect(status()[0].closest(".public-page-heading")).toBeTruthy();
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Mara" }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Name wechseln" }));
    fireEvent.click(screen.getByRole("button", { name: "Nele" }));
    expect(status()).toHaveLength(1);
    expect(status()[0].closest(".detail")).toBeTruthy();
    await refreshWith({
      ...nextRound("round", "completed"),
      event: { ...eventData.event, finished_at: "2026-10-10T12:00:00Z" },
    });
    expect(status()).toHaveLength(1);
    expect(status()[0].closest(".public-page-heading")).toBeTruthy();
  });

  it("reveals a new round once without remounting names or replaying unchanged data", async () => {
    enableMotion();
    const board = await openAssignment();
    const nameSwitch = screen.getByRole("button", { name: "Name wechseln" });
    nameSwitch.focus();
    expect(board.classList.contains("is-assignment-reveal")).toBe(false);
    await refreshWith(nextRound("redrawn")); // same round number, new publication
    expect(board.classList.contains("is-assignment-reveal")).toBe(true);
    expect(document.querySelector(".public-court-card")).toBe(board);
    expect(document.activeElement).toBe(nameSwitch);
    expect(screen.getByText("Center Court")).toBeTruthy();
    await waitFor(() =>
      expect(board.classList.contains("is-assignment-reveal")).toBe(false),
    );
    await refreshWith(nextRound("redrawn", "running"));
    expect(board.classList.contains("is-assignment-reveal")).toBe(false);
  });

  it("reveals new data received by automatic polling", async () => {
    enableMotion();
    const interval = vi.spyOn(window, "setInterval");
    const board = await openAssignment();
    vi.mocked(api).mockResolvedValueOnce(nextRound("polled"));
    await act(async () => {
      const [poll, delay] = interval.mock.calls.at(-1)!;
      expect(delay).toBe(10_000);
      (poll as () => void)();
    });
    expect(board.classList.contains("is-assignment-reveal")).toBe(true);
    await waitFor(() =>
      expect(board.classList.contains("is-assignment-reveal")).toBe(false),
    );
  });

  it("does not replay a hidden-tab publication when the tab becomes visible", async () => {
    enableMotion();
    const board = await openAssignment();
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    await refreshWith(nextRound("background"));
    expect(board.classList.contains("is-assignment-reveal")).toBe(false);
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    await refreshWith(nextRound("background"));
    expect(board.classList.contains("is-assignment-reveal")).toBe(false);
  });

  it("uses immediate updates with reduced motion and when choosing another name", async () => {
    const board = await openAssignment();
    await refreshWith(nextRound("reduced"));
    expect(board.classList.contains("is-assignment-reveal")).toBe(false);
    enableMotion();
    fireEvent.click(screen.getByRole("button", { name: "Name wechseln" }));
    fireEvent.click(screen.getByRole("button", { name: "Nele" }));
    expect(document.querySelector(".is-assignment-reveal")).toBeNull();
  });

  it("gives sitting-out players a short reveal and gives completion priority", async () => {
    enableMotion();
    await openAssignment();
    const rest = nextRound("rest");
    rest.currentRound!.matches = [];
    rest.currentRound!.sitting_out_player_ids = ["mara"];
    await refreshWith(rest);
    expect(
      document.querySelector(".public-state.rest.is-assignment-reveal"),
    ).toBeTruthy();
    const finished = nextRound("final");
    finished.event = { ...finished.event, finished_at: "2026-10-08T12:00:00Z" };
    await refreshWith(finished);
    expect(document.querySelector(".is-assignment-reveal")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Turnier beendet" }),
    ).toBeTruthy();
    expect(document.querySelector(".tournament-finish-icon")).toBeTruthy();
    expect(document.querySelector(".tournament-start-icon")).toBeNull();
  });

  it("accents the existing court symbol at start without remounting the assignment or moving focus", async () => {
    enableMotion();
    const board = await openAssignment();
    const nameSwitch = screen.getByRole("button", { name: "Name wechseln" });
    nameSwitch.focus();
    await refreshWith(nextRound("round", "running"));
    expect(board.querySelector(".tournament-start-icon")).toBeTruthy();
    expect(document.querySelector(".public-court-card")).toBe(board);
    expect(document.activeElement).toBe(nameSwitch);
    await waitFor(() =>
      expect(document.querySelector(".tournament-start-icon")).toBeNull(),
    );
    await refreshWith(nextRound("round", "running"));
    expect(document.querySelector(".tournament-start-icon")).toBeNull();
  });

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
    expect(
      document.querySelector(".detail .public-round-status")?.textContent,
    ).toBe("Runde 1 · Start folgt");
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
