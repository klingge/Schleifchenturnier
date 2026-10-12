// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import App from "@/App";
import { api, clearCsrfToken } from "@/lib/api";
import type { EventData } from "@/domain/tournament";
import type { OrganizerKey, SessionResponse } from "./types";

const event: EventData = {
  event: {
    id: "own",
    public_slug: "demo",
    name: "Vereinsturnier",
    event_date: "2026-10-10",
    default_round_duration_seconds: 1200,
    status: "active",
    planned_round_count: null,
    finished_at: null,
    revision: 1,
  },
  players: [],
  courts: [],
  rounds: [],
  leaderboard: [],
  currentRound: null,
};
const operator = {
  authenticated: true,
  role: "operator",
  eventId: null,
  csrf: "operator-csrf",
} as const;
const organizer = {
  authenticated: true,
  role: "organizer",
  eventId: "own",
  csrf: "organizer-csrf",
} as const;
const key: OrganizerKey = {
  id: "key-id",
  label: "TC Testverein",
  version: 1,
  revoked_at: null,
  event_id: null,
  event_name: null,
  used_at: null,
  created_at: "2026-10-10T09:00:00Z",
  updated_at: "2026-10-10T09:00:00Z",
};
const rawKey = "TestschluesselMitZufaelligenBytes";
let session: SessionResponse;
let handler: (path: string, init?: RequestInit) => Response | Promise<Response>;
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
  const url = String(path);
  if (url === "/api/auth/session") return response(session);
  return handler(url, init);
});
function open(path = "/admin") {
  const router = createMemoryRouter([{ path: "*", element: <App /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}
beforeEach(() => {
  session = { authenticated: false };
  handler = (path) => {
    if (path === "/api/admin/events/own") return response(event);
    if (path === "/api/admin/events")
      return response({ events: [event.event] });
    if (path === "/api/admin/keys") return response({ keys: [key] });
    throw new Error(`Unexpected request: ${path}`);
  };
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  localStorage.clear();
  sessionStorage.clear();
  clearCsrfToken();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearCsrfToken();
});

describe("Zugang und rollenbezogene Oberfläche", () => {
  it("uses key login by default and opens the assigned tournament without requesting global data", async () => {
    const normal = handler;
    handler = (path, init) => {
      if (path === "/api/auth/key-login") {
        expect(JSON.parse(String(init?.body))).toEqual({ key: rawKey });
        session = organizer;
        return response(session);
      }
      return normal(path, init);
    };
    const router = open();
    fireEvent.change(await screen.findByLabelText("Turnierschlüssel"), {
      target: { value: ` ${rawKey} ` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
    await screen.findByText("Vereinsturnier");
    expect(router.state.location.pathname).toContain("/admin/events/own");
    expect(
      fetchMock.mock.calls.some(
        ([path]) => path === "/api/admin/events" || path === "/api/admin/keys",
      ),
    ).toBe(false);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
  it("keeps operator password login separate and exposes key management there", async () => {
    const normal = handler;
    handler = (path, init) =>
      path === "/api/auth/login" ? response(operator) : normal(path, init);
    open();
    fireEvent.click(
      await screen.findByRole("link", { name: "Betreiber anmelden" }),
    );
    fireEvent.change(screen.getByLabelText("Betreiberpasswort"), {
      target: { value: "test-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
    expect(
      await screen.findByRole("link", { name: "Turnierschlüssel" }),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([path, init]) =>
          path === "/api/auth/login" &&
          JSON.parse(String(init?.body)).password === "test-password",
      ),
    ).toBe(true);
  });
  it.each([
    "/admin/keys",
    "/admin/events/foreign/dashboard",
    "/admin/betreiber",
  ])(
    "redirects organizers away from %s without foreign API requests",
    async (path) => {
      session = organizer;
      const router = open(path);
      await screen.findByText("Vereinsturnier");
      expect(router.state.location.pathname).toContain("/admin/events/own");
      expect(
        fetchMock.mock.calls.every(
          ([request]) =>
            !String(request).includes("foreign") &&
            request !== "/api/admin/keys",
        ),
      ).toBe(true);
    },
  );
  it("hides archive and delete actions but retains settings and logout for organizers", async () => {
    session = organizer;
    open("/admin/events/own/dashboard");
    fireEvent.pointerDown(
      await screen.findByRole("button", {
        name: "Veranstaltungsaktionen öffnen",
      }),
      { button: 0, ctrlKey: false },
    );
    await screen.findByRole("menuitem", { name: "Einstellungen" });
    expect(screen.getByRole("menuitem", { name: "Abmelden" })).toBeTruthy();
    expect(
      screen.queryByRole("menuitem", {
        name: /Archivieren|Löschen|Zur Übersicht/,
      }),
    ).toBeNull();
  });
  it.each(["Abbrechen", "Schließen", "Escape"])(
    "opens archive confirmation and cancels with %s without a write request",
    async (action) => {
      session = operator;
      open("/admin/events/own/dashboard");
      fireEvent.pointerDown(
        await screen.findByRole("button", {
          name: "Veranstaltungsaktionen öffnen",
        }),
        { button: 0, ctrlKey: false },
      );
      fireEvent.click(
        await screen.findByRole("menuitem", { name: "Archivieren" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Veranstaltung archivieren",
      });
      expect(
        within(dialog).getByText(/„Vereinsturnier“ archivieren/),
      ).toBeTruthy();
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
      ).toBe(false);
      if (action === "Escape") fireEvent.keyDown(dialog, { key: "Escape" });
      else
        fireEvent.click(within(dialog).getByRole("button", { name: action }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
      ).toBe(false);
    },
  );
  it("sends the existing archive PATCH once after operator confirmation", async () => {
    session = operator;
    const normal = handler;
    handler = (path, init) =>
      path === "/api/admin/events/own" && init?.method === "PATCH"
        ? response({ ok: true })
        : normal(path, init);
    open("/admin/events/own/dashboard");
    fireEvent.pointerDown(
      await screen.findByRole("button", {
        name: "Veranstaltungsaktionen öffnen",
      }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Archivieren" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Veranstaltung archivieren" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const writes = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "PATCH",
    );
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe("/api/admin/events/own");
    expect(JSON.parse(String(writes[0][1]?.body))).toEqual({
      status: "archived",
      expectedRevision: 1,
    });
  });
  it("recovers simultaneous creation by opening the existing assignment", async () => {
    session = { ...organizer, eventId: null };
    const normal = handler;
    handler = (path, init) => {
      if (path === "/api/admin/events" && init?.method === "POST") {
        session = organizer;
        return response(
          { error: "Bereits verwendet", code: "key_creation_unavailable" },
          409,
        );
      }
      return normal(path, init);
    };
    const router = open();
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Neues Turnier" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Turnier erstellen" }));
    await screen.findByText("Vereinsturnier");
    expect(router.state.location.pathname).toContain("/admin/events/own");
    expect(
      fetchMock.mock.calls.filter(
        ([path, init]) =>
          path === "/api/admin/events" && init?.method === "POST",
      ),
    ).toHaveLength(1);
  });
  it("refreshes the assignment after successful first creation", async () => {
    session = { ...organizer, eventId: null };
    const normal = handler;
    handler = (path, init) => {
      if (path === "/api/admin/events" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          name: "Neues Turnier",
          durationMinutes: 20,
          plannedRoundCount: null,
        });
        expect(new Headers(init.headers).get("x-csrf-token")).toBe(
          "organizer-csrf",
        );
        session = organizer;
        return response(event, 201);
      }
      return normal(path, init);
    };
    open();
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Neues Turnier" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Turnier erstellen" }));
    await screen.findByText("Vereinsturnier");
    expect(
      screen.queryByRole("button", { name: "Turnier erstellen" }),
    ).toBeNull();
  });
  it("recovers a lost creation response without making a second creation request", async () => {
    session = { ...organizer, eventId: null };
    const normal = handler;
    handler = (path, init) => {
      if (path === "/api/admin/events" && init?.method === "POST") {
        session = organizer;
        throw new TypeError("Antwort verloren");
      }
      return normal(path, init);
    };
    open();
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Neues Turnier" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Turnier erstellen" }));
    await screen.findByText("Vereinsturnier");
    expect(
      fetchMock.mock.calls.filter(
        ([path, init]) =>
          path === "/api/admin/events" && init?.method === "POST",
      ),
    ).toHaveLength(1);
  });

  it("removes protected data when a focus check confirms an invalid session", async () => {
    session = organizer;
    open("/admin/events/own/dashboard");
    await screen.findByText("Vereinsturnier");
    session = { authenticated: false };
    fireEvent.focus(window);
    await screen.findByLabelText("Turnierschlüssel");
    expect(screen.queryByText("Vereinsturnier")).toBeNull();
  });

  it("keeps a rejected key login on the login form", async () => {
    handler = () => response({ error: "Der Schlüssel ist ungültig." }, 401);
    open();
    fireEvent.change(await screen.findByLabelText("Turnierschlüssel"), {
      target: { value: "invalid-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
    await screen.findByText("Der Schlüssel ist ungültig.");
    expect(
      (screen.getByLabelText("Turnierschlüssel") as HTMLInputElement).value,
    ).toBe("invalid-key");
    expect(screen.queryByText(/Dein Zugang ist nicht mehr gültig/)).toBeNull();
  });

  it("removes protected data on a revoked or expired session response and clears CSRF", async () => {
    session = organizer;
    open("/admin/events/own/dashboard");
    await screen.findByText("Vereinsturnier");
    handler = () => response({ error: "Ungültige Sitzung" }, 401);
    await act(async () => {
      await api("/admin/events/own").catch(() => {});
    });
    await screen.findByLabelText("Turnierschlüssel");
    expect(screen.queryByText("Vereinsturnier")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(
      "nicht mehr gültig",
    );
    handler = (_path, init) => {
      expect(new Headers(init?.headers).has("x-csrf-token")).toBe(false);
      return response({ authenticated: false });
    };
    await api("/auth/key-login", { method: "POST", body: "{}" });
  });
  it("keeps confirmed organizer data when a focus session check has a network failure", async () => {
    session = organizer;
    open("/admin/events/own/dashboard");
    await screen.findByText("Vereinsturnier");
    fetchMock.mockRejectedValueOnce(new TypeError("Offline"));
    fireEvent.focus(window);
    await screen.findByText(/Die Anmeldung konnte nicht geprüft werden/);
    expect(screen.getByText("Vereinsturnier")).toBeTruthy();
    expect(screen.queryByLabelText("Turnierschlüssel")).toBeNull();
  });
  it("does not check an admin session before loading a public event", async () => {
    handler = (path) =>
      path === "/api/public/events/demo"
        ? response(event)
        : response({ error: "Nicht gefunden" }, 404);
    open("/event/demo");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(
      fetchMock.mock.calls.some(([path]) => path === "/api/auth/session"),
    ).toBe(false);
  });
  it("offers a retry after an initial session connection failure", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Offline"));
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Erneut versuchen" }),
    );
    await screen.findByLabelText("Turnierschlüssel");
  });
});

describe("Schlüsselverwaltung", () => {
  async function openKeys() {
    session = operator;
    open("/admin/keys");
    await screen.findByText("TC Testverein");
  }
  it("displays a secret once, copies it, and discards it on closing", async () => {
    const normal = handler;
    handler = (path, init) =>
      path === "/api/admin/keys" && init?.method === "POST"
        ? response({ key: rawKey, organizerKey: key }, 201)
        : normal(path, init);
    await openKeys();
    fireEvent.change(screen.getByLabelText(/Bezeichnung/), {
      target: { value: "TC Testverein" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schlüssel erzeugen" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Dein Turnierschlüssel",
    });
    expect(
      (within(dialog).getByLabelText("TC Testverein") as HTMLInputElement)
        .value,
    ).toBe(rawKey);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Schlüssel kopieren" }),
    );
    await screen.findByRole("button", { name: "Kopiert" });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(rawKey);
    fireEvent.click(within(dialog).getByRole("button", { name: "Fertig" }));
    expect(screen.queryByDisplayValue(rawKey)).toBeNull();
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(window.location.href).not.toContain(rawKey);
  });
  it("keeps the secret available with a manual-copy fallback if clipboard access fails", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(
      new Error("Denied"),
    );
    const normal = handler;
    handler = (path, init) =>
      path === "/api/admin/keys" && init?.method === "POST"
        ? response({ key: rawKey, organizerKey: key }, 201)
        : normal(path, init);
    await openKeys();
    fireEvent.click(screen.getByRole("button", { name: "Schlüssel erzeugen" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Schlüssel kopieren" }),
    );
    await screen.findByText(/Markiere den Schlüssel/);
    expect(screen.getByDisplayValue(rawKey)).toBeTruthy();
  });
  it("preserves a successfully issued secret when refreshing the key list fails", async () => {
    let issued = false;
    const normal = handler;
    handler = (path, init) => {
      if (path === "/api/admin/keys" && init?.method === "POST") {
        issued = true;
        return response({ key: rawKey, organizerKey: key }, 201);
      }
      if (path === "/api/admin/keys" && issued)
        throw new TypeError("Liste nicht erreichbar");
      return normal(path, init);
    };
    await openKeys();
    fireEvent.click(screen.getByRole("button", { name: "Schlüssel erzeugen" }));
    await screen.findByDisplayValue(rawKey);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("alert", { hidden: true })
          .some((alert) =>
            alert.textContent?.includes("Liste nicht erreichbar"),
          ),
      ).toBe(true),
    );
    expect(screen.getByDisplayValue(rawKey)).toBeTruthy();
  });

  it.each(["rotate", "revoke"] as const)(
    "confirms %s and refreshes the list after mutation",
    async (mode) => {
      const normal = handler;
      handler = (path, init) =>
        path === `/api/admin/keys/key-id/${mode}`
          ? response(
              mode === "rotate"
                ? { key: rawKey, organizerKey: { ...key, version: 2 } }
                : { ok: true },
            )
          : normal(path, init);
      await openKeys();
      fireEvent.click(
        screen.getByRole("button", {
          name: `Schlüssel für TC Testverein ${mode === "rotate" ? "ersetzen" : "sperren"}`,
        }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: mode === "rotate" ? "Schlüssel ersetzen?" : "Schlüssel sperren?",
      });
      expect(
        fetchMock.mock.calls.some(([path]) =>
          String(path).endsWith(`/${mode}`),
        ),
      ).toBe(false);
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: mode === "rotate" ? "Schlüssel ersetzen" : "Schlüssel sperren",
        }),
      );
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(([path]) =>
            String(path).endsWith(`/${mode}`),
          ),
        ).toBe(true),
      );
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.filter(
            ([path, init]) => path === "/api/admin/keys" && !init?.method,
          ),
        ).toHaveLength(2),
      );
      if (mode === "rotate")
        expect(await screen.findByDisplayValue(rawKey)).toBeTruthy();
    },
  );
  it("offers replacement for blocked keys but no reactivation for a deleted tournament", async () => {
    handler = () =>
      response({
        keys: [
          { ...key, revoked_at: "2026-10-10" },
          {
            ...key,
            id: "deleted",
            label: "Gelöschtes Turnier",
            used_at: "2026-10-10",
            revoked_at: "2026-10-10",
          },
        ],
      });
    await openKeys();
    expect(
      (
        screen.getByRole("button", {
          name: "Schlüssel für TC Testverein sperren",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Schlüssel für TC Testverein ersetzen",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(
      screen.queryByRole("button", { name: /Gelöschtes Turnier/ }),
    ).toBeNull();
    expect(screen.getByText(/Zugang dauerhaft deaktiviert/)).toBeTruthy();
  });
});
