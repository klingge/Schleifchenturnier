// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dialog keyboard viewport", () => {
  it("keeps the dialog in the visible area when a keyboard shrinks and shifts the viewport, and cleans up its listeners", () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 844,
      offsetTop: 0,
    });
    vi.stubGlobal("visualViewport", viewport);
    const remove = vi.spyOn(viewport, "removeEventListener");
    const view = render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Einstellungen</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.maxHeight).toBe("812px");
    act(() => {
      viewport.height = 360;
      viewport.offsetTop = 90;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(dialog.style.maxHeight).toBe("328px");
    expect(dialog.style.top).toBe("270px");
    act(() => {
      viewport.offsetTop = 120;
      viewport.dispatchEvent(new Event("scroll"));
    });
    expect(dialog.style.top).toBe("300px");
    act(() => {
      viewport.height = 844;
      viewport.offsetTop = 0;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(dialog.style.top).toBe("422px");
    view.unmount();
    expect(remove.mock.calls.map(([name]) => name)).toEqual([
      "resize",
      "scroll",
    ]);
  });
});
