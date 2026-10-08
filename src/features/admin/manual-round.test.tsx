// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { EventData, Round } from "@/domain/tournament";
import { ManualRoundEditor } from "./ManualRoundEditor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const players = ["Anna", "Ben", "Caro", "David", "Eda", "Fritz"].map(
  (name, index) => ({
    id: `p${index}`,
    display_name: name,
    emoji: "🎾",
    active: 1,
    wins: 0,
    gameDifference: 0,
    sitOuts: 0,
    rank: index + 1,
  }),
);

function data(round: Round | null = null): EventData {
  return {
    event: {
      id: "event",
      name: "Sommerfest",
      public_slug: "event",
      event_date: "2026-09-16",
      default_round_duration_seconds: 1200,
      status: "active",
      planned_round_count: null,
      finished_at: null,
      revision: 7,
    },
    players,
    leaderboard: players,
    courts: [
      { id: "c1", name: "Center Court", position: 1, active: 1 },
      { id: "c2", name: "Nebenplatz", position: 2, active: 1 },
    ],
    rounds: round ? [round] : [],
    currentRound: round,
  };
}

function fillFirstCourt() {
  const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
  for (let index = 0; index < 4; index++)
    fireEvent.change(selects[index + 1], { target: { value: `p${index}` } });
}

function renderEditor(
  event: EventData,
  close: () => void,
  publish: (body: object) => Promise<void>,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <ManualRoundEditor data={event} onClose={close} publish={publish} />
        ),
      },
      { path: "/other", element: <div>Andere Seite</div> },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("manueller Rundeneditor", () => {
  it("filters assigned players, calculates sitting out and retains the draft after a save error", async () => {
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error("Konflikt"))
      .mockResolvedValue(undefined);
    const close = vi.fn();
    renderEditor(data(), close, publish);
    expect(
      screen.getByRole("heading", { name: "Runde zusammenstellen" }),
    ).toBeTruthy();
    expect(screen.getByText("Setzen aus (6)")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Runde veröffentlichen",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fillFirstCourt();
    expect(screen.getByText("Setzen aus (2)")).toBeTruthy();
    expect(screen.getByText(/Eda.*Fritz/)).toBeTruthy();
    expect(
      screen.getAllByRole("combobox")[2].querySelector('option[value="p0"]'),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Runde veröffentlichen" }),
    );
    await screen.findByText("Konflikt");
    expect(close).not.toHaveBeenCalled();
    expect(
      (screen.getAllByRole("combobox")[1] as HTMLSelectElement).value,
    ).toBe("p0");
    fireEvent.click(
      screen.getByRole("button", { name: "Runde veröffentlichen" }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(publish).toHaveBeenCalledWith({
      expectedRevision: 7,
      matches: [{ courtId: "c1", teamA: ["p0", "p1"], teamB: ["p2", "p3"] }],
    });
  });

  it("asks before discarding changes and can edit a published assignment", () => {
    const round: Round = {
      id: "r1",
      round_number: 1,
      state: "published",
      duration_seconds: 1200,
      expires_at: null,
      matches: [
        {
          id: "m1",
          court_number: 2,
          court_id: "c2",
          court_name_snapshot: "Nebenplatz",
          team_a_player_1_id: "p0",
          team_a_player_2_id: "p1",
          team_b_player_1_id: "p2",
          team_b_player_2_id: "p3",
          team_a_games: null,
          team_b_games: null,
          result_type: "pending",
        },
      ],
      sitting_out_player_ids: ["p4", "p5"],
    };
    const close = vi.fn();
    renderEditor(data(round), close, vi.fn());
    expect(
      screen.getByRole("heading", { name: "Aufstellung bearbeiten" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/ersetzen die bereits veröffentlichte Aufstellung/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Änderungen veröffentlichen" }),
    ).toBeTruthy();
    expect(
      (screen.getAllByRole("combobox")[0] as HTMLSelectElement).value,
    ).toBe("c2");
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "p4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Entwurf behalten" }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("guards route navigation when a draft has changed", async () => {
    const close = vi.fn();
    const router = renderEditor(data(), close, vi.fn());
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "p0" },
    });
    await router.navigate("/other");
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Entwurf behalten" }));
    expect(screen.queryByText("Andere Seite")).toBeNull();
    await router.navigate("/other");
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    await screen.findByText("Andere Seite");
    expect(close).toHaveBeenCalledOnce();
  });
});
