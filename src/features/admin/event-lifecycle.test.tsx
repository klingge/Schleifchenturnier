// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { RoundPlanFields } from "./RoundPlanFields";
import { EventLifecycleDialog } from "./EventLifecycleDialog";
import type { EventRow, Round } from "@/domain/tournament";

afterEach(cleanup);
const event: EventRow = {
  id: "event",
  public_slug: "event",
  name: "Sommerfest",
  event_date: "2026-09-16",
  default_round_duration_seconds: 1200,
  status: "active",
  planned_round_count: 2,
  finished_at: "2026-09-16T12:00:00Z",
  revision: 7,
};
const round: Round = {
  id: "round",
  round_number: 2,
  state: "completed",
  duration_seconds: 1200,
  expires_at: null,
  matches: [],
  sitting_out_player_ids: [],
};

describe("Turnierplanung und Abschlussdialoge", () => {
  it("archives a finished tournament only after confirmation and blocks duplicate submissions and closing while pending", async () => {
    let resolve!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const close = vi.fn();
    render(
      <EventLifecycleDialog
        event={event}
        round={round}
        mode="archive"
        onClose={close}
        save={save}
      />,
    );
    expect(screen.getByText(/„Sommerfest“ archivieren/)).toBeTruthy();
    expect(
      screen.getByText(/öffentliche Teilnehmeransicht wird abgeschaltet/),
    ).toBeTruthy();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(save).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", {
      name: "Veranstaltung archivieren",
    });
    fireEvent.click(confirm);
    fireEvent.submit(confirm.closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Schließen" })).toBeNull();
    expect(close).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("/admin/events/event", {
      status: "archived",
      expectedRevision: 7,
    });
    await act(async () => resolve());
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps archive errors visible and retries with the revision known when opened", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("Verbindung unterbrochen. Bitte erneut versuchen."),
      )
      .mockResolvedValueOnce(undefined);
    const close = vi.fn();
    const view = render(
      <EventLifecycleDialog
        event={event}
        round={round}
        mode="archive"
        onClose={close}
        save={save}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Veranstaltung archivieren" }),
    );
    await screen.findByText("Verbindung unterbrochen. Bitte erneut versuchen.");
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    view.rerender(
      <EventLifecycleDialog
        event={{ ...event, revision: 8 }}
        round={round}
        mode="archive"
        onClose={close}
        save={save}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Veranstaltung archivieren" }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(save.mock.calls.map(([, body]) => body)).toEqual([
      { status: "archived", expectedRevision: 7 },
      { status: "archived", expectedRevision: 7 },
    ]);
  });

  it("defaults to manual ending and exposes a required count only for fixed rounds", () => {
    function Form() {
      const [value, setValue] = useState<number | null>(null);
      return <RoundPlanFields value={value} onChange={setValue} />;
    }
    render(<Form />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Feste Rundenanzahl" }));
    expect(
      screen.getByLabelText("Runden insgesamt").getAttribute("required"),
    ).not.toBeNull();
    expect(
      screen.getByLabelText("Runden insgesamt").getAttribute("aria-invalid"),
    ).toBe("false");
    fireEvent.blur(screen.getByLabelText("Runden insgesamt"));
    expect(
      screen.getByLabelText("Runden insgesamt").getAttribute("aria-invalid"),
    ).toBe("true");
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "5" },
    });
    expect(screen.getByRole("spinbutton").getAttribute("aria-invalid")).toBe(
      "false",
    );
    fireEvent.click(screen.getByRole("radio", { name: "Selbst beenden" }));
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("suggests another round and sends the original revision on resume", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    render(
      <EventLifecycleDialog
        event={event}
        round={round}
        mode="resume"
        onClose={close}
        save={save}
      />,
    );
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe(
      "3",
    );
    fireEvent.click(screen.getByRole("button", { name: "Turnier fortsetzen" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith("/admin/events/event/resume", {
      expectedRevision: 7,
      plannedRoundCount: 3,
    });
  });

  it("keeps user input after a conflict and never silently adopts a newer revision", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Bitte aktualisieren"));
    const close = vi.fn();
    const view = render(
      <EventLifecycleDialog
        event={event}
        round={round}
        mode="resume"
        onClose={close}
        save={save}
      />,
    );
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Turnier fortsetzen" }));
    await screen.findByText("Bitte aktualisieren");
    view.rerender(
      <EventLifecycleDialog
        event={{ ...event, revision: 8 }}
        round={round}
        mode="resume"
        onClose={close}
        save={save}
      />,
    );
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe(
      "5",
    );
    expect(close).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith("/admin/events/event/resume", {
      expectedRevision: 7,
      plannedRoundCount: 5,
    });
  });

  it("summarizes locked round planning while published but allows duration changes", () => {
    render(
      <EventLifecycleDialog
        event={{ ...event, finished_at: null }}
        round={{ ...round, state: "published" }}
        mode="settings"
        onClose={() => {}}
        save={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Runden insgesamt")).toBeNull();
    expect(screen.getByText("2 Runden")).toBeTruthy();
    expect(
      screen.getByText(/nach Abschluss der aktuellen Runde ändern/),
    ).toBeTruthy();
    expect(
      (
        screen.getByLabelText(
          "Standard-Rundendauer in Minuten",
        ) as HTMLInputElement
      ).disabled,
    ).toBe(false);
  });
});
