import { useEffect, useState, type FormEvent } from "react";
import {
  Link as RouterLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import {
  Archive,
  CalendarBlank,
  DotsThreeVertical,
  LockKey,
  Plus,
  TennisBall,
  Timer,
} from "@phosphor-icons/react";

import { Badge as UiBadge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";

import {
  Dialog as UiDialog,
  DialogClose as UiDialogClose,
  DialogContent as UiDialogContent,
  DialogFooter as UiDialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  DialogTrigger as UiDialogTrigger,
} from "@/components/ui/dialog";

import { Input as UiInput } from "@/components/ui/input";
import {
  DropdownMenu as UiDropdownMenu,
  DropdownMenuContent as UiDropdownMenuContent,
  DropdownMenuGroup as UiDropdownMenuGroup,
  DropdownMenuTrigger as UiDropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, Loading, Shell } from "@/components/app-shell";
import { EventAdmin } from "@/features/admin/EventAdmin";
import { DeleteEventDialog } from "@/features/admin/DeleteEventDialog";
import { PublicEvent } from "@/features/public/PublicEvent";
import { api, clearCsrfToken, setCsrfToken } from "@/lib/api";
import { RoundPlanFields } from "@/features/admin/RoundPlanFields";
import { validRoundPlan } from "@/domain/event-rules";
import { type EventData, type EventRow } from "@/domain/tournament";

function Login({ done }: { done: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const x = await api<{ csrf: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: pw }),
      });
      setCsrfToken(x.csrf);
      done();
    } catch (x) {
      setError((x as Error).message);
    }
  }
  return (
    <Shell>
      <div className="login">
        <section>
          <UiBadge variant="secondary">Turnierleitung</UiBadge>
          <h1>SGA Schleifchenturnier</h1>
          <p>
            Spieler eintragen, Doppel auslosen oder selbst zusammenstellen und
            Ergebnisse direkt festhalten.
          </p>
          <p className="login-note">
            Eine zentrale Oberfläche für den gesamten Turniertag.
          </p>
        </section>
        <form className="panel" onSubmit={submit}>
          <LockKey size={30} />
          <h2>Organisator anmelden</h2>
          <label>
            Passwort
            <UiInput
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
              autoFocus
            />
          </label>
          {error && <p className="error">{error}</p>}
          <UiButton size="lg">Anmelden</UiButton>
        </form>
      </div>
    </Shell>
  );
}

function Dashboard() {
  const nav = useNavigate();
  const [items, setItems] = useState<EventRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const load = () =>
    api<{ events: EventRow[] }>("/admin/events")
      .then((x) => setItems(x.events))
      .catch((x) => setError(x.message));
  useEffect(() => {
    void load();
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (creating || !validRoundPlan(count)) return;
    setCreating(true);
    try {
      const x = await api<EventData>("/admin/events", {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(new FormData(e.currentTarget)),
          plannedRoundCount: count,
        }),
      });
      void nav(`/admin/events/${x.event.id}`);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setCreating(false);
    }
  }
  return (
    <div className="overview-page">
      <div className="heading">
        <div>
          <p className="kicker">Veranstaltungen</p>
          <h1>Turnierübersicht</h1>
        </div>
        <UiDialog
          open={open}
          onOpenChange={(next) => {
            if (!creating) {
              setOpen(next);
              if (next) {
                setCount(null);
                setError("");
              }
            }
          }}
        >
          <UiDialogTrigger asChild>
            <UiButton size="lg">
              <Plus /> Veranstaltung
            </UiButton>
          </UiDialogTrigger>
          <UiDialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-1 overflow-y-auto sm:max-w-[520px]">
            <UiDialogHeader>
              <UiDialogTitle>Neue Veranstaltung</UiDialogTitle>
            </UiDialogHeader>
            <form className="form" onSubmit={create}>
              <label>
                Name
                <UiInput name="name" required />
              </label>
              <label>
                Rundendauer in Minuten
                <UiInput
                  name="durationMinutes"
                  type="number"
                  defaultValue="20"
                  min="1"
                  max="240"
                  required
                />
              </label>
              <RoundPlanFields
                value={count}
                onChange={setCount}
                disabled={creating}
              />
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <UiDialogFooter>
                <UiDialogClose asChild>
                  <UiButton type="button" variant="outline" disabled={creating}>
                    Abbrechen
                  </UiButton>
                </UiDialogClose>
                <UiButton
                  type="submit"
                  disabled={creating || !validRoundPlan(count)}
                >
                  {creating ? "Wird erstellt…" : "Erstellen"}
                </UiButton>
              </UiDialogFooter>
            </form>
          </UiDialogContent>
        </UiDialog>
      </div>
      {error && <p className="notice error">{error}</p>}
      {items === null ? (
        error ? (
          <Empty
            icon={<Archive />}
            title="Veranstaltungen konnten nicht geladen werden"
            text={
              "Pr\u00fcfe die lokale Datenbankverbindung und versuche es erneut."
            }
          />
        ) : (
          <Loading />
        )
      ) : items.length === 0 ? (
        <Empty
          icon={<TennisBall />}
          title="Noch keine Veranstaltung"
          text="Lege das erste Turnier an und öffne danach die Lobby."
        />
      ) : (
        <div className="events" aria-label="Veranstaltungen">
          {items.map((x) => (
            <div className="event-row" key={x.id}>
              <RouterLink className="event-open" to={`/admin/events/${x.id}`}>
                <span className="event-main">
                  <strong>{x.name}</strong>
                  <span className="event-meta">
                    <small>
                      <CalendarBlank aria-hidden="true" />
                      {new Intl.DateTimeFormat("de-DE").format(
                        new Date(`${x.event_date}T12:00:00`),
                      )}
                    </small>
                    <small>
                      <TennisBall aria-hidden="true" />
                      {x.court_count ?? 0} Plätze
                    </small>
                    <small>
                      <Timer aria-hidden="true" />
                      {x.default_round_duration_seconds / 60} Minuten
                    </small>
                  </span>
                </span>
                <UiBadge
                  variant={x.status === "archived" ? "outline" : "secondary"}
                >
                  {x.status === "archived"
                    ? "Archiviert"
                    : x.finished_at
                      ? "Beendet"
                      : x.status === "lobby"
                        ? "Lobby"
                        : "Aktiv"}
                </UiBadge>
              </RouterLink>
              <UiDropdownMenu>
                <UiDropdownMenuTrigger asChild>
                  <UiButton
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Aktionen für ${x.name}`}
                  >
                    <DotsThreeVertical />
                  </UiButton>
                </UiDropdownMenuTrigger>
                <UiDropdownMenuContent align="end" className="min-w-52">
                  <UiDropdownMenuGroup>
                    <DeleteEventDialog
                      event={x}
                      onDeleted={() =>
                        setItems(
                          (current) =>
                            current?.filter((item) => item.id !== x.id) ?? null,
                        )
                      }
                    />
                  </UiDropdownMenuGroup>
                </UiDropdownMenuContent>
              </UiDropdownMenu>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ authenticated: boolean; csrf?: string }>("/auth/session")
      .then((x) => {
        if (x.csrf) setCsrfToken(x.csrf);
        setAuth(x.authenticated);
      })
      .catch(() => setAuth(false));
  }, []);
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    clearCsrfToken();
    setAuth(false);
  }
  if (auth === null)
    return (
      <Shell>
        <Loading />
      </Shell>
    );
  return (
    <Routes>
      <Route path="/event/:slug" element={<PublicEvent />} />
      <Route
        path="/admin/*"
        element={
          auth ? (
            <Shell logout={logout}>
              <Routes>
                <Route index element={<Dashboard />} />
                <Route
                  path="events/:id/*"
                  element={<EventAdmin logout={logout} />}
                />
              </Routes>
            </Shell>
          ) : (
            <Login done={() => setAuth(true)} />
          )
        }
      />
      <Route path="*" element={<Navigate to="/admin" />} />
    </Routes>
  );
}
