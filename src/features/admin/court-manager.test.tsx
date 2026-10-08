// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Court } from "@/domain/tournament";
import { CourtManager } from "./TournamentComponents";

afterEach(cleanup);

describe("Platznamen eingeben", () => {
  it("focuses the name field on opening and after consecutive saves, retaining a failed name", async () => {
    const mutate = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Speichern fehlgeschlagen"));
    render(<CourtManager eventId="event" courts={[]} mutate={mutate} />);

    const name = screen.getByRole("textbox", {
      name: "Platzname",
    }) as HTMLInputElement;
    const add = screen.getByRole("button", { name: "Hinzufügen" });
    expect(document.activeElement).toBe(name);

    for (const [index, courtName] of ["Platz 1", "Platz 2"].entries()) {
      fireEvent.change(name, { target: { value: courtName } });
      fireEvent.click(add);
      await waitFor(() => expect(mutate).toHaveBeenCalledTimes(index + 1));
      await waitFor(() => {
        expect(name.value).toBe("");
        expect(document.activeElement).toBe(name);
      });
    }

    fireEvent.change(name, { target: { value: "Platz 3" } });
    fireEvent.click(add);
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(3));
    await waitFor(() => {
      expect(name.value).toBe("Platz 3");
      expect(document.activeElement).toBe(name);
      expect(name.disabled).toBe(false);
    });
    expect(JSON.parse(mutate.mock.calls[2][1].body)).toEqual({
      name: "Platz 3",
    });
  });

  it("does not focus a locked or full court list", () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    const courts: Court[] = Array.from({ length: 13 }, (_, index) => ({
      id: `court-${index}`,
      name: `Platz ${index + 1}`,
      position: index + 1,
      active: 1,
    }));
    const { rerender } = render(
      <CourtManager eventId="event" courts={courts} mutate={mutate} />,
    );
    const name = screen.getByRole("textbox", {
      name: "Platzname",
    }) as HTMLInputElement;
    expect(name.disabled).toBe(true);
    expect(document.activeElement).not.toBe(name);

    rerender(
      <CourtManager
        eventId="event"
        courts={[]}
        mutate={mutate}
        editable={false}
      />,
    );
    expect(screen.queryByRole("textbox", { name: "Platzname" })).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("only calls out unavailable courts in read mode", () => {
    const courts: Court[] = [
      { id: "one", name: "Center Court", position: 1, active: 1 },
      { id: "two", name: "Platz 2", position: 2, active: 0 },
    ];

    render(
      <CourtManager
        eventId="event"
        courts={courts}
        mutate={vi.fn()}
        editable={false}
      />,
    );

    expect(screen.getByText("Aus")).toBeTruthy();
    expect(screen.queryByText("Aktiv")).toBeNull();
  });
});
