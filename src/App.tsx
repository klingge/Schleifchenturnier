import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Link as RouterLink,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  CalendarBlank,
  Check,
  CheckCircle,
  Copy,
  DotsThreeVertical,
  GearSix,
  Link as LinkIcon,
  LockKey,
  Minus,
  Pause,
  PencilSimple,
  Play,
  Plus,
  Shuffle,
  SignOut,
  TennisBall,
  Timer,
  Trash,
  Trophy,
  Users,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import QRCode from "qrcode";
import courtPreview from "./assets/court-preview.png";
import hairBow from "./assets/hair-bow.png";
import sgaLogo from "./assets/sga-logo.png";
import {
  AlertDialog as UiAlertDialog,
  AlertDialogAction as UiAlertDialogAction,
  AlertDialogCancel as UiAlertDialogCancel,
  AlertDialogContent as UiAlertDialogContent,
  AlertDialogDescription as UiAlertDialogDescription,
  AlertDialogFooter as UiAlertDialogFooter,
  AlertDialogHeader as UiAlertDialogHeader,
  AlertDialogMedia as UiAlertDialogMedia,
  AlertDialogTitle as UiAlertDialogTitle,
  AlertDialogTrigger as UiAlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Alert as UiAlert,
  AlertDescription as UiAlertDescription,
  AlertTitle as UiAlertTitle,
} from "@/components/ui/alert";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import {
  Card as UiCard,
  CardAction as UiCardAction,
  CardContent as UiCardContent,
  CardDescription as UiCardDescription,
  CardFooter as UiCardFooter,
  CardHeader as UiCardHeader,
  CardTitle as UiCardTitle,
} from "@/components/ui/card";
import {
  Dialog as UiDialog,
  DialogClose as UiDialogClose,
  DialogContent as UiDialogContent,
  DialogFooter as UiDialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  DialogTrigger as UiDialogTrigger,
} from "@/components/ui/dialog";
import {
  Field as UiField,
  FieldGroup as UiFieldGroup,
  FieldLabel as UiFieldLabel,
} from "@/components/ui/field";
import { Input as UiInput } from "@/components/ui/input";
import {
  DropdownMenu as UiDropdownMenu,
  DropdownMenuContent as UiDropdownMenuContent,
  DropdownMenuGroup as UiDropdownMenuGroup,
  DropdownMenuItem as UiDropdownMenuItem,
  DropdownMenuSeparator as UiDropdownMenuSeparator,
  DropdownMenuTrigger as UiDropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea as UiScrollArea } from "@/components/ui/scroll-area";
import { Skeleton as UiSkeleton } from "@/components/ui/skeleton";
import { Progress as UiProgress } from "@/components/ui/progress";
import { TooltipProvider as UiTooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  canCompleteRoundWithEntries,
  compareCourtsByName,
  comparePlayersByName,
  countCompletedResults,
  getInitialSetupTab,
  getRoundSecondsLeft,
  getSittingOutCount,
  isResultEntryRoundState,
  type MatchEntryStatus,
  shouldAutoSaveScore,
} from "./admin-dashboard-state";
import {
  getBrowserPlayerStorage,
  readPublicPlayerSelection,
  writePublicPlayerSelection,
} from "./public-player-selection";

type Player = {
  id: string;
  display_name: string;
  emoji: string;
  active: number;
  wins: number;
  gameDifference: number;
  sitOuts: number;
  rank: number;
};
type Court = {
  id: string;
  name: string;
  position: number;
  active: number;
};
type Match = {
  id: string;
  court_number: number;
  court_name_snapshot: string | null;
  team_a_player_1_id: string;
  team_a_player_2_id: string;
  team_b_player_1_id: string;
  team_b_player_2_id: string;
  team_a_games: number | null;
  team_b_games: number | null;
  result_type: string;
};
type Round = {
  id: string;
  round_number: number;
  state: "published" | "running" | "paused" | "results" | "completed";
  duration_seconds: number;
  expires_at: string | null;
  paused_at?: string | null;
  matches: Match[];
  sitting_out_player_ids: string[];
};
type EventRow = {
  id: string;
  public_slug: string;
  name: string;
  event_date: string;
  default_round_duration_seconds: number;
  court_count?: number;
  status: string;
};
type EventData = {
  event: EventRow;
  players: Player[];
  courts: Court[];
  leaderboard: Player[];
  rounds: Round[];
  currentRound: Round | null;
};
const scoreValues = [0, 1, 2, 3, 4, 5, 6];
const matchPlayerIds = (match: Match) => [
  match.team_a_player_1_id,
  match.team_a_player_2_id,
  match.team_b_player_1_id,
  match.team_b_player_2_id,
];
const courtName = (match: Match) =>
  match.court_name_snapshot || `Platz ${match.court_number}`;
const eventTabs = [
  "dashboard",
  "teilnehmer",
  "plaetze",
  "bestenliste",
] as const;
type EventTab = (typeof eventTabs)[number];
const isEventTab = (value: string): value is EventTab =>
  eventTabs.includes(value as EventTab);
let csrf = "";
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(csrf && !["GET", "HEAD"].includes(init.method ?? "GET")
        ? { "x-csrf-token": csrf }
        : {}),
      ...init.headers,
    },
  });
  const data = (await res.json()) as T & { error?: string; csrf?: string };
  if (data.csrf) csrf = data.csrf;
  if (!res.ok)
    throw Object.assign(new Error(data.error || "Anfrage fehlgeschlagen."), {
      data,
      status: res.status,
    });
  return data;
}

type LogoutHandler = () => void | Promise<void>;

function LogoutMenuItem({ logout }: { logout: LogoutHandler }) {
  return (
    <UiDropdownMenuItem
      onSelect={() => {
        void logout();
      }}
    >
      <SignOut /> Abmelden
    </UiDropdownMenuItem>
  );
}

function Shell({
  children,
  logout,
}: {
  children: React.ReactNode;
  logout?: LogoutHandler;
}) {
  const location = useLocation();
  const eventMenuOwnsLogout = /^\/admin\/events\/[^/]+(?:\/|$)/.test(
    location.pathname,
  );
  return (
    <>
      <a className="skip-link" href="#main-content">
        Zum Inhalt springen
      </a>
      <header>
        <a className="brand" href={logout ? "/admin" : "/"}>
          <img
            src={sgaLogo}
            alt="SG Arheilgen Tennis"
            width="512"
            height="512"
            fetchPriority="high"
          />
          <span>
            <strong>SGA Schleifchenturnier</strong>
            <small>SG Arheilgen Tennis</small>
          </span>
        </a>
        {logout && !eventMenuOwnsLogout && (
          <UiDropdownMenu>
            <UiDropdownMenuTrigger asChild>
              <UiButton
                className="shell-menu-trigger"
                variant="ghost"
                size="icon-lg"
                aria-label="Kontomenü öffnen"
              >
                <DotsThreeVertical />
              </UiButton>
            </UiDropdownMenuTrigger>
            <UiDropdownMenuContent align="end" className="min-w-44">
              <LogoutMenuItem logout={logout} />
            </UiDropdownMenuContent>
          </UiDropdownMenu>
        )}
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
function Loading() {
  return (
    <div className="loading">
      <i />
      <i />
      <i />
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <b>{icon}</b>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

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
      csrf = x.csrf;
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
            Spieler eintragen, faire Doppel auslosen und Ergebnisse direkt
            festhalten.
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

function DeleteEventDialog({
  event,
  onDeleted,
}: {
  event: Pick<EventRow, "id" | "name">;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await api(`/admin/events/${event.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation: event.name }),
      });
      setOpen(false);
      onDeleted();
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <UiAlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!deleting) setOpen(next);
        if (!next) setError("");
      }}
    >
      <UiAlertDialogTrigger asChild>
        <UiDropdownMenuItem
          variant="destructive"
          onSelect={(selectEvent) => selectEvent.preventDefault()}
        >
          <Trash /> Veranstaltung löschen
        </UiDropdownMenuItem>
      </UiAlertDialogTrigger>
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogMedia>
            <Trash />
          </UiAlertDialogMedia>
          <UiAlertDialogTitle>Veranstaltung löschen?</UiAlertDialogTitle>
          <UiAlertDialogDescription>
            „{event.name}“ sowie alle Teilnehmer, Runden und Ergebnisse werden
            dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht
            werden.
          </UiAlertDialogDescription>
        </UiAlertDialogHeader>
        {error && <p className="delete-event-error">{error}</p>}
        <UiAlertDialogFooter>
          <UiAlertDialogCancel disabled={deleting}>
            Abbrechen
          </UiAlertDialogCancel>
          <UiAlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              void remove();
            }}
          >
            <Trash data-icon="inline-start" />
            {deleting ? "Wird gelöscht…" : "Endgültig löschen"}
          </UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>
  );
}

function Dashboard() {
  const nav = useNavigate();
  const [items, setItems] = useState<EventRow[] | null>(null);
  const [open, setOpen] = useState(false);
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
    try {
      const x = await api<EventData>("/admin/events", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      nav(`/admin/events/${x.event.id}`);
    } catch (x) {
      setError((x as Error).message);
    }
  }
  return (
    <div className="overview-page">
      <div className="heading">
        <div>
          <p className="kicker">Veranstaltungen</p>
          <h1>Turnierübersicht</h1>
        </div>
        <UiDialog open={open} onOpenChange={setOpen}>
          <UiDialogTrigger asChild>
            <UiButton size="lg">
              <Plus /> Veranstaltung
            </UiButton>
          </UiDialogTrigger>
          <UiDialogContent className="sm:max-w-[520px]">
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
              <UiDialogFooter>
                <UiDialogClose asChild>
                  <UiButton type="button" variant="outline">
                    Abbrechen
                  </UiButton>
                </UiDialogClose>
                <UiButton type="submit">Erstellen</UiButton>
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

function Leaderboard({
  players,
  selected,
  onSelect,
}: {
  players: Player[];
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="ranking">
      {players.map((p) => (
        <button
          key={p.id}
          data-rank={p.rank <= 3 ? p.rank : undefined}
          className={selected === p.id ? "selected" : ""}
          disabled={!onSelect}
          onClick={() => onSelect?.(p.id)}
        >
          <b>{p.rank}</b>
          <i>{p.emoji}</i>
          <span className="ranking-player">
            <strong>{p.display_name}</strong>
          </span>
          <span className="ranking-stats">
            <span
              className="win-tally"
              data-zero={p.wins === 0}
              role="img"
              aria-label={`${p.wins} ${p.wins === 1 ? "Sieg" : "Siege"}`}
            >
              <span className="win-count">{p.wins}</span>
              <img
                src={hairBow}
                alt=""
                width="292"
                height="292"
                aria-hidden="true"
              />
            </span>
            <small className="game-difference">
              Diff. {p.gameDifference > 0 ? "+" : ""}
              {p.gameDifference}
            </small>
          </span>
        </button>
      ))}
    </div>
  );
}

function QR({ url }: { url: string }) {
  const [img, setImg] = useState("");
  return (
    <UiDialog
      onOpenChange={(o) =>
        o &&
        QRCode.toDataURL(url, {
          width: 420,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        }).then(setImg)
      }
    >
      <UiDialogTrigger asChild>
        <UiButton variant="outline">
          <LinkIcon data-icon="inline-start" /> Teilnehmeransicht
        </UiButton>
      </UiDialogTrigger>
      <UiDialogContent className="sm:max-w-md">
        <UiDialogHeader>
          <UiDialogTitle>Teilnehmeransicht</UiDialogTitle>
        </UiDialogHeader>
        <div className="qr">
          {img ? (
            <img
              src={img}
              alt="QR-Code zur Teilnehmeransicht"
              width="420"
              height="420"
            />
          ) : (
            <UiSkeleton className="size-72" />
          )}
        </div>
        <UiDialogFooter>
          <UiDialogClose asChild>
            <UiButton variant="outline">Schließen</UiButton>
          </UiDialogClose>
          <UiButton onClick={() => navigator.clipboard.writeText(url)}>
            <Copy data-icon="inline-start" /> Link kopieren
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  );
}

function MatchCard({
  m,
  players,
  result,
  save,
  onStatusChange,
}: {
  m: Match;
  players: Map<string, Player>;
  result: boolean;
  save: (a: number, b: number) => Promise<void>;
  onStatusChange?: (matchId: string, status: MatchEntryStatus) => void;
}) {
  const initialSaved =
    m.result_type === "played" &&
    m.team_a_games !== null &&
    m.team_b_games !== null
      ? `${m.team_a_games}:${m.team_b_games}`
      : "";
  const [a, setA] = useState<number | null>(m.team_a_games),
    [b, setB] = useState<number | null>(m.team_b_games),
    [saving, setSaving] = useState(false),
    [failedKey, setFailedKey] = useState(""),
    [lastSaved, setLastSaved] = useState(initialSaved);
  const currentKey = a !== null && b !== null ? `${a}:${b}` : "";
  const canSave = a !== null && b !== null && a !== b;
  const saved = canSave && currentKey === lastSaved;
  const failed = currentKey !== "" && currentKey === failedKey;
  const complete = saved && !saving && !failed;
  const saveState = saved
    ? "Gespeichert"
    : failed
      ? "Speichern fehlgeschlagen"
      : saving
        ? "Speichert…"
        : canSave
          ? "Speichert automatisch"
          : "Offen";
  useEffect(() => {
    setA(m.team_a_games);
    setB(m.team_b_games);
    setLastSaved(
      m.result_type === "played" &&
        m.team_a_games !== null &&
        m.team_b_games !== null
        ? `${m.team_a_games}:${m.team_b_games}`
        : "",
    );
    setFailedKey("");
  }, [m.id, m.team_a_games, m.team_b_games, m.result_type]);
  useEffect(() => {
    if (
      !shouldAutoSaveScore({
        resultMode: result,
        a,
        b,
        currentKey,
        lastSaved,
        failedKey,
        saving,
      })
    )
      return;
    if (a === null || b === null) return;
    setSaving(true);
    save(a, b)
      .then(() => {
        setLastSaved(currentKey);
        setFailedKey("");
      })
      .catch(() => setFailedKey(currentKey))
      .finally(() => setSaving(false));
  }, [a, b, currentKey, failedKey, lastSaved, result, save, saving]);
  useEffect(() => {
    if (!result) return;
    onStatusChange?.(m.id, {
      complete,
      valid: canSave,
      saved,
      saving,
      failed,
    });
  }, [canSave, complete, failed, m.id, onStatusChange, result, saved, saving]);
  const n = (id: string) => (
    <span className="player-pill">
      <i>{players.get(id)?.emoji}</i>
      <span className="player-name">{players.get(id)?.display_name}</span>
    </span>
  );
  return (
    <article
      className={cn(
        "match court-card",
        saved && "is-saved",
        saving && "is-saving",
        failed && "is-save-failed",
      )}
    >
      <header className="court-label">
        <b>{courtName(m)}</b>
        {result && (
          <span
            className={cn(
              "court-save-status",
              saved && "saved",
              saving && "saving",
              failed && "failed",
            )}
            role="status"
            aria-live="polite"
          >
            {saved ? (
              <Check aria-hidden="true" />
            ) : failed ? (
              <WarningCircle aria-hidden="true" />
            ) : saving || canSave ? (
              <ArrowClockwise
                className={cn(saving && "is-spinning")}
                aria-hidden="true"
              />
            ) : (
              <PencilSimple aria-hidden="true" />
            )}
            {saveState}
          </span>
        )}
      </header>
      <div className="match-board court-board-surface">
        <div className="score-team">
          <div className="team-players">
            {n(m.team_a_player_1_id)}
            {n(m.team_a_player_2_id)}
          </div>
        </div>
        <div
          className="score-versus"
          aria-label={`Spielstand ${a ?? "-"} zu ${b ?? "-"}`}
        >
          <strong>
            {a ?? "-"}:{b ?? "-"}
          </strong>
        </div>
        <div className="score-team">
          <div className="team-players">
            {n(m.team_b_player_1_id)}
            {n(m.team_b_player_2_id)}
          </div>
        </div>
      </div>
      {result && (
        <footer>
          <ScorePicker label="Team links" value={a} onChange={setA} />
          <b className="score-divider">:</b>
          <ScorePicker label="Team rechts" value={b} onChange={setB} />
        </footer>
      )}
    </article>
  );
}

function ScorePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [customOpen, setCustomOpen] = useState((value ?? 0) > 6);
  useEffect(() => {
    if ((value ?? 0) > 6) setCustomOpen(true);
  }, [value]);
  return (
    <div
      className={cn(
        "score-entry",
        label.includes("links") && "is-left",
        label.includes("rechts") && "is-right",
      )}
      role="group"
      aria-label={label}
    >
      <div className="score-picker">
        {scoreValues.map((score) => (
          <button
            key={score}
            type="button"
            className={
              value === score ? "score-number selected" : "score-number"
            }
            aria-pressed={value === score}
            onClick={() => onChange(score)}
          >
            {score}
          </button>
        ))}
        <button
          type="button"
          className={
            (value ?? 0) > 6 ? "score-number selected" : "score-number"
          }
          aria-label={`${label}: mehr als 6 eintragen`}
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((open) => !open)}
        >
          <Plus weight="bold" />
        </button>
      </div>
      {customOpen && (
        <UiInput
          type="number"
          min="7"
          inputMode="numeric"
          placeholder="7+"
          value={value !== null && value > 6 ? String(value) : ""}
          onChange={(event) => {
            const next = event.target.value;
            if (!next) {
              onChange(null);
              return;
            }
            const parsed = Number(next);
            if (!Number.isFinite(parsed)) return;
            onChange(Math.max(7, Math.floor(parsed)));
          }}
        />
      )}
    </div>
  );
}

function ScoreCorrection({
  round,
  match,
  players,
  playerId,
  save,
}: {
  round: Round;
  match: Match;
  players: Map<string, Player>;
  playerId: string;
  save: (a: number, b: number) => Promise<void>;
}) {
  const savedKey =
    match.team_a_games !== null && match.team_b_games !== null
      ? `${match.team_a_games}:${match.team_b_games}`
      : "";
  const [a, setA] = useState<number | null>(match.team_a_games),
    [b, setB] = useState<number | null>(match.team_b_games),
    [editing, setEditing] = useState(false),
    [saving, setSaving] = useState(false),
    [failed, setFailed] = useState(false),
    [saved, setSaved] = useState(false);
  const currentKey = a !== null && b !== null ? `${a}:${b}` : "";
  const changed = currentKey !== "" && currentKey !== savedKey;
  const canSave = changed && a !== null && b !== null && a !== b;
  useEffect(() => {
    setA(match.team_a_games);
    setB(match.team_b_games);
    setEditing(false);
    setFailed(false);
    setSaved(false);
  }, [match.id, match.team_a_games, match.team_b_games]);
  const playerPill = (id: string) => {
    const player = players.get(id);
    return (
      <span className={id === playerId ? "selected-player" : ""}>
        <i>{player?.emoji}</i>
        {player?.display_name}
      </span>
    );
  };
  return (
    <article className="score-correction">
      <header>
        <div>
          <strong>
            Runde {round.round_number}
            {" \u00b7 "}
            {courtName(match)}
          </strong>
          <small>
            {match.result_type === "missing"
              ? "Als fehlend gewertet"
              : "Gespeichertes Ergebnis"}
          </small>
        </div>
        <div className="correction-match-actions">
          <UiBadge
            variant={
              match.result_type === "missing" ? "destructive" : "secondary"
            }
          >
            {saved
              ? "Aktualisiert"
              : match.result_type === "missing"
                ? "0:0"
                : savedKey}
          </UiBadge>
          {!editing && (
            <UiButton
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Ergebnis aus Runde ${round.round_number} bearbeiten`}
              onClick={() => {
                setEditing(true);
                setFailed(false);
                setSaved(false);
              }}
            >
              <PencilSimple />
            </UiButton>
          )}
        </div>
      </header>
      <div className="correction-teams">
        <div>
          {playerPill(match.team_a_player_1_id)}
          {playerPill(match.team_a_player_2_id)}
        </div>
        <b>
          {a ?? "-"}:{b ?? "-"}
        </b>
        <div>
          {playerPill(match.team_b_player_1_id)}
          {playerPill(match.team_b_player_2_id)}
        </div>
      </div>
      {editing && (
        <footer>
          <ScorePicker label="Team links" value={a} onChange={setA} />
          <ScorePicker label="Team rechts" value={b} onChange={setB} />
          <div className="correction-editor-actions">
            <UiButton
              disabled={!canSave || saving}
              onClick={() => {
                if (a === null || b === null || !canSave) return;
                setSaving(true);
                setFailed(false);
                void save(a, b)
                  .then(() => {
                    setSaved(true);
                    setEditing(false);
                  })
                  .catch(() => setFailed(true))
                  .finally(() => setSaving(false));
              }}
            >
              <Check data-icon="inline-start" />
              {saving ? "Speichert\u2026" : "Speichern"}
            </UiButton>
            <UiButton
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setA(match.team_a_games);
                setB(match.team_b_games);
                setEditing(false);
                setFailed(false);
              }}
            >
              Abbrechen
            </UiButton>
          </div>
          <small className={failed ? "save-state failed" : "save-state"}>
            {failed
              ? "Speichern fehlgeschlagen. Bitte erneut versuchen."
              : canSave
                ? "Bereit zum Speichern"
                : a === b && a !== null
                  ? "Kein Unentschieden möglich"
                  : "Spielstand wählen"}
          </small>
        </footer>
      )}
    </article>
  );
}

function PlayerEditorHeader({
  player,
  matchCount,
  save,
  editable = true,
}: {
  player: Player;
  matchCount: number;
  save: (name: string) => Promise<void>;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.display_name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setName(player.display_name);
    setEditing(false);
    setError("");
  }, [player.id, player.display_name]);
  const trimmedName = name.trim();
  const valid =
    trimmedName.length > 0 &&
    trimmedName.length <= 40 &&
    trimmedName !== player.display_name;

  return (
    <div className="correction-player">
      <i>{player.emoji}</i>
      <div className="correction-player-details">
        {editing ? (
          <form
            className="player-name-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!valid) return;
              setSaving(true);
              setError("");
              void save(trimmedName)
                .then(() => setEditing(false))
                .catch((reason) =>
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : "Name konnte nicht gespeichert werden.",
                  ),
                )
                .finally(() => setSaving(false));
            }}
          >
            <UiField data-invalid={Boolean(error)}>
              <UiFieldLabel className="sr-only" htmlFor="player-display-name">
                Teilnehmername
              </UiFieldLabel>
              <UiInput
                id="player-display-name"
                value={name}
                minLength={1}
                maxLength={40}
                required
                autoFocus
                aria-invalid={Boolean(error)}
                onChange={(event) => {
                  setName(event.target.value);
                  setError("");
                }}
              />
            </UiField>
            <div className="player-name-actions">
              <UiButton type="submit" size="sm" disabled={!valid || saving}>
                <Check data-icon="inline-start" />
                {saving ? "Speichert\u2026" : "Speichern"}
              </UiButton>
              <UiButton
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setName(player.display_name);
                  setEditing(false);
                  setError("");
                }}
              >
                Abbrechen
              </UiButton>
            </div>
            {error && <small className="player-name-error">{error}</small>}
          </form>
        ) : (
          <div className="player-name-display">
            <strong>{player.display_name}</strong>
            {editable && (
              <UiButton
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Name von ${player.display_name} bearbeiten`}
                onClick={() => setEditing(true)}
              >
                <PencilSimple />
              </UiButton>
            )}
          </div>
        )}
        <span>
          {matchCount
            ? `${matchCount} abgeschlossene Spiele`
            : "Noch keine abgeschlossenen Spiele"}
        </span>
      </div>
    </div>
  );
}

function Clock({
  round,
  mutate,
}: {
  round: Round;
  mutate: (p: string, i: RequestInit) => Promise<void>;
}) {
  const [left, setLeft] = useState(() => getRoundSecondsLeft(round));
  useEffect(() => {
    setLeft(getRoundSecondsLeft(round));
    if (round.state !== "running" || !round.expires_at) return;
    const tick = () => {
      setLeft(getRoundSecondsLeft(round));
    };
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [
    round.id,
    round.state,
    round.duration_seconds,
    round.expires_at,
    round.paused_at,
  ]);
  if (["published", "results"].includes(round.state))
    return (
      <UiBadge
        variant={round.state === "results" ? "destructive" : "secondary"}
      >
        {round.state === "results" ? "Ergebnisse" : "Bereit"}
      </UiBadge>
    );
  return (
    <div className={cn("clock", left === 0 && "is-expired")}>
      <div className="clock-readout">
        <Timer aria-hidden="true" />
        <b role="timer" aria-label={`${left} Sekunden verbleibend`}>
          {String(Math.floor(left / 60)).padStart(2, "0")}:
          {String(left % 60).padStart(2, "0")}
        </b>
      </div>
      <span aria-live="polite">
        {left === 0
          ? "Zeit abgelaufen"
          : round.state === "paused"
            ? "Pausiert"
            : "Läuft"}
      </span>
      <div className="clock-actions">
        {round.state === "running" ? (
          <UiButton
            size="icon"
            variant="outline"
            aria-label="Runde pausieren"
            onClick={() =>
              mutate(`/admin/rounds/${round.id}/action`, {
                method: "POST",
                body: JSON.stringify({ action: "pause" }),
              })
            }
          >
            <Pause />
          </UiButton>
        ) : (
          <UiButton
            size="icon"
            variant="outline"
            aria-label="Runde fortsetzen"
            onClick={() =>
              mutate(`/admin/rounds/${round.id}/action`, {
                method: "POST",
                body: JSON.stringify({ action: "resume" }),
              })
            }
          >
            <Play />
          </UiButton>
        )}
      </div>
    </div>
  );
}

function EventSettingsDialog({
  open,
  onOpenChange,
  duration,
  save,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duration: number;
  save: (durationMinutes: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(duration);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setDraft(duration);
  }, [duration, open]);
  const valid = Number.isInteger(draft) && draft >= 1 && draft <= 240;

  return (
    <UiDialog open={open} onOpenChange={onOpenChange}>
      <UiDialogContent className="sm:max-w-md">
        <UiDialogHeader>
          <UiDialogTitle>Veranstaltungseinstellungen</UiDialogTitle>
        </UiDialogHeader>
        <form
          className="event-settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid || saving) return;
            setSaving(true);
            void save(draft)
              .then(() => onOpenChange(false))
              .catch(() => {})
              .finally(() => setSaving(false));
          }}
        >
          <UiFieldGroup>
            <UiField>
              <UiFieldLabel htmlFor="default-round-duration">
                Standard-Rundendauer
              </UiFieldLabel>
              <div className="duration-stepper">
                <UiButton
                  type="button"
                  size="icon-lg"
                  variant="outline"
                  aria-label="Rundendauer um 5 Minuten verringern"
                  disabled={draft <= 1 || saving}
                  onClick={() =>
                    setDraft((current) => Math.max(1, current - 5))
                  }
                >
                  <Minus />
                </UiButton>
                <UiInput
                  id="default-round-duration"
                  className="duration-stepper-input"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="240"
                  value={draft}
                  aria-invalid={!valid}
                  onChange={(event) => setDraft(Number(event.target.value))}
                />
                <UiButton
                  type="button"
                  size="icon-lg"
                  variant="outline"
                  aria-label="Rundendauer um 5 Minuten erhöhen"
                  disabled={draft >= 240 || saving}
                  onClick={() =>
                    setDraft((current) => Math.min(240, current + 5))
                  }
                >
                  <Plus />
                </UiButton>
              </div>
            </UiField>
          </UiFieldGroup>
          <UiDialogFooter>
            <UiDialogClose asChild>
              <UiButton type="button" variant="outline" disabled={saving}>
                Abbrechen
              </UiButton>
            </UiDialogClose>
            <UiButton type="submit" disabled={!valid || saving}>
              Speichern
            </UiButton>
          </UiDialogFooter>
        </form>
      </UiDialogContent>
    </UiDialog>
  );
}

function InitialSetupGuide({
  eventId,
  activeTab,
  activePlayers,
  activeCourts,
}: {
  eventId: string;
  activeTab: EventTab;
  activePlayers: number;
  activeCourts: number;
}) {
  const participantsReady = activePlayers >= 4;
  const courtsReady = activeCourts >= 1;
  const tournamentReady = participantsReady && courtsReady;
  const instructions: Record<EventTab, string> = {
    teilnehmer: "Trage mindestens vier aktive Teilnehmer ein.",
    plaetze: "Lege die verfügbaren Plätze an und aktiviere mindestens einen.",
    dashboard: tournamentReady
      ? "Alles bereit: Jetzt kann die erste Runde ausgelost werden."
      : "Teilnehmer und Plätze müssen bereit sein, bevor du auslosen kannst.",
    bestenliste: "Die Bestenliste füllt sich nach der ersten gespielten Runde.",
  };
  const steps = [
    {
      tab: "teilnehmer" as const,
      label: "Teilnehmer",
      status: `${activePlayers} aktiv`,
      complete: participantsReady,
    },
    {
      tab: "plaetze" as const,
      label: "Plätze",
      status: `${activeCourts} aktiv`,
      complete: courtsReady,
    },
    {
      tab: "dashboard" as const,
      label: "Erste Runde",
      status: tournamentReady ? "Bereit" : "Offen",
      complete: false,
    },
  ];

  return (
    <section
      className="initial-setup-guide"
      aria-labelledby="setup-guide-title"
    >
      <div className="setup-guide-copy">
        <p className="kicker">Turniervorbereitung</p>
        <h2 id="setup-guide-title">In drei Schritten zur ersten Runde</h2>
        <p>{instructions[activeTab]}</p>
      </div>
      <ol className="setup-steps">
        {steps.map((step, index) => (
          <li key={step.tab}>
            <RouterLink
              className={cn(
                "setup-step",
                step.complete && "is-complete",
                activeTab === step.tab && "is-current",
              )}
              to={`/admin/events/${eventId}/${step.tab}`}
              aria-current={activeTab === step.tab ? "step" : undefined}
            >
              <span className="setup-step-marker" aria-hidden="true">
                {step.complete ? <Check weight="bold" /> : index + 1}
              </span>
              <span className="setup-step-copy">
                <strong>{step.label}</strong>
                <small>{step.status}</small>
              </span>
            </RouterLink>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CourtPreview() {
  return (
    <img
      className="court-preview-image"
      src={courtPreview}
      alt=""
      width="384"
      height="512"
      aria-hidden="true"
    />
  );
}

function CourtManager({
  eventId,
  courts,
  mutate,
  editable = true,
  showSetupAction = false,
  setupReady = false,
  onSetupContinue,
}: {
  eventId: string;
  courts: Court[];
  mutate: (path: string, init: RequestInit) => Promise<void>;
  editable?: boolean;
  showSetupAction?: boolean;
  setupReady?: boolean;
  onSetupContinue?: () => void;
}) {
  const [courtAdding, setCourtAdding] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const editingCourt = courts.find((court) => court.id === editingId);
  const activeCount = courts.filter((court) => court.active).length;
  const atCourtLimit = courts.length >= 13;
  const sortedCourts = useMemo(
    () => [...courts].sort(compareCourtsByName),
    [courts],
  );

  async function addCourt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setCourtAdding(true);
    try {
      await mutate(`/admin/events/${eventId}/courts`, {
        method: "POST",
        body: JSON.stringify({ name: new FormData(form).get("name") }),
      });
      form.reset();
    } finally {
      setCourtAdding(false);
    }
  }

  return (
    <UiCard className="control-courts">
      <UiCardHeader>
        <UiCardTitle>Plätze</UiCardTitle>
        <UiCardDescription>
          {activeCount} aktiv von {courts.length}
        </UiCardDescription>
      </UiCardHeader>
      <UiCardContent>
        {!editable && (
          <UiAlert className="configuration-lock" role="status">
            <LockKey />
            <UiAlertTitle>Plätze im Lesemodus</UiAlertTitle>
            <UiAlertDescription>
              Während der offenen Runde bleiben die aktiven Plätze sichtbar.
              Änderungen sind nach dem Rundenabschluss wieder möglich.
            </UiAlertDescription>
          </UiAlert>
        )}
        {editable && (
          <form className="court-add-form" onSubmit={addCourt}>
            <UiField>
              <UiFieldLabel className="sr-only" htmlFor="court-name">
                Platzname
              </UiFieldLabel>
              <UiInput
                id="court-name"
                name="name"
                placeholder="z. B. Halle 1"
                maxLength={40}
                disabled={courtAdding || atCourtLimit}
                aria-busy={courtAdding}
                required
              />
            </UiField>
            <div className="court-add-actions">
              <UiButton type="submit" disabled={courtAdding || atCourtLimit}>
                {courtAdding ? "Wird hinzugefügt…" : "Hinzufügen"}
              </UiButton>
            </div>
          </form>
        )}
        <div className={cn("court-balance", activeCount > 0 && "ready")}>
          {activeCount > 0 ? <Check /> : <TennisBall />}
          <span>
            {activeCount > 0
              ? `${activeCount} ${activeCount === 1 ? "Platz ist" : "Plätze sind"} für die nächste Auslosung aktiv.`
              : "Aktiviere mindestens einen Platz für die nächste Auslosung."}
          </span>
        </div>
        <div className="court-visual-grid">
          {sortedCourts.map((court) => (
            <div
              key={court.id}
              className={cn("court-visual-card", !court.active && "off")}
            >
              {editable ? (
                <button
                  type="button"
                  className="court-open"
                  aria-label={`${court.name} umbenennen`}
                  onClick={() => {
                    setEditingId(court.id);
                    setEditingName(court.name);
                  }}
                >
                  <CourtPreview />
                  <span className="court-card-label">
                    <strong>{court.name}</strong>
                  </span>
                  <PencilSimple aria-hidden="true" />
                </button>
              ) : (
                <div className="court-open">
                  <CourtPreview />
                  <span className="court-card-label">
                    <strong>{court.name}</strong>
                  </span>
                </div>
              )}
              {editable ? (
                <UiButton
                  type="button"
                  size="sm"
                  variant={court.active ? "secondary" : "outline"}
                  className={cn(
                    "court-status-button",
                    court.active && "is-active",
                  )}
                  aria-pressed={Boolean(court.active)}
                  aria-label={`${court.name} ${
                    court.active ? "deaktivieren" : "aktivieren"
                  }`}
                  onClick={() =>
                    mutate(`/admin/courts/${court.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ active: !court.active }),
                    }).catch(() => {})
                  }
                >
                  {court.active && <Check aria-hidden="true" />}
                  {court.active ? "Aktiv" : "Aus"}
                </UiButton>
              ) : (
                <span
                  className={cn(
                    "court-read-status",
                    court.active && "is-active",
                  )}
                >
                  {court.active && <Check aria-hidden="true" />}
                  {court.active ? "Aktiv" : "Aus"}
                </span>
              )}
            </div>
          ))}
          {courts.length === 0 && (
            <p className="court-empty">
              Noch keine Plätze. Füge den ersten Spielort hinzu.
            </p>
          )}
        </div>
      </UiCardContent>
      {showSetupAction && (
        <UiCardFooter className="setup-continue">
          <UiButton size="lg" disabled={!setupReady} onClick={onSetupContinue}>
            Weiter zum Dashboard <ArrowRight data-icon="inline-end" />
          </UiButton>
        </UiCardFooter>
      )}
      <UiDialog
        open={Boolean(editingCourt)}
        onOpenChange={(open) => {
          if (!open) setEditingId("");
        }}
      >
        <UiDialogContent className="sm:max-w-md">
          <UiDialogHeader>
            <UiDialogTitle>Platz umbenennen</UiDialogTitle>
          </UiDialogHeader>
          {editingCourt && (
            <form
              className="court-edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                void mutate(`/admin/courts/${editingCourt.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ name: editingName }),
                }).then(() => setEditingId(""));
              }}
            >
              <UiField>
                <UiFieldLabel htmlFor="court-edit-name">Platzname</UiFieldLabel>
                <UiInput
                  id="court-edit-name"
                  value={editingName}
                  maxLength={40}
                  onChange={(event) => setEditingName(event.target.value)}
                  autoFocus
                  required
                />
              </UiField>
              <UiDialogFooter>
                <UiDialogClose asChild>
                  <UiButton type="button" variant="outline">
                    Abbrechen
                  </UiButton>
                </UiDialogClose>
                <UiButton type="submit">Speichern</UiButton>
              </UiDialogFooter>
            </form>
          )}
        </UiDialogContent>
      </UiDialog>
    </UiCard>
  );
}

function EventAdmin({ logout }: { logout: LogoutHandler }) {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const routeLocation = useLocation();
  const requestedTab =
    routeLocation.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const [data, setData] = useState<EventData | null>(null),
    [error, setError] = useState("");
  const setupActivePlayers =
    data?.players.filter((player) => player.active).length ?? 0;
  const setupActiveCourts =
    data?.courts.filter((court) => court.active).length ?? 0;
  const defaultTab: EventTab =
    data && data.rounds.length === 0
      ? getInitialSetupTab(setupActivePlayers, setupActiveCourts)
      : "dashboard";
  const activeTab: EventTab = isEventTab(requestedTab)
    ? requestedTab
    : defaultTab;
  const [duration, setDuration] = useState(20);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [participantAddOpen, setParticipantAddOpen] = useState(false);
  const [participantAdding, setParticipantAdding] = useState(false);
  const [correctionPlayerId, setCorrectionPlayerId] = useState("");
  const participantNameRef = useRef<HTMLInputElement>(null);
  const [matchEntryStatuses, setMatchEntryStatuses] = useState<
    Record<string, MatchEntryStatus>
  >({});
  const configurationLocked = Boolean(
    data?.currentRound && data.currentRound.state !== "completed",
  );
  const load = () =>
    api<EventData>(`/admin/events/${id}`)
      .then((x) => {
        setData(x);
        setDuration(x.event.default_round_duration_seconds / 60);
      })
      .catch((x) => setError(x.message));
  useEffect(() => {
    void load();
  }, [id]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [id]);
  useEffect(() => {
    if (data && data.event.id === id && !isEventTab(requestedTab)) {
      nav(`/admin/events/${id}/${defaultTab}`, { replace: true });
      return;
    }
  }, [data, defaultTab, id, nav, requestedTab]);
  useEffect(() => {
    setMatchEntryStatuses({});
  }, [data?.currentRound?.id, data?.currentRound?.state]);
  useEffect(() => {
    if (activeTab !== "teilnehmer" || configurationLocked) {
      setParticipantAddOpen(false);
      return;
    }
    if (participantAddOpen && !participantAdding)
      participantNameRef.current?.focus();
  }, [activeTab, configurationLocked, participantAddOpen, participantAdding]);
  const updateMatchEntryStatus = useCallback(
    (matchId: string, status: MatchEntryStatus) => {
      setMatchEntryStatuses((current) => {
        const existing = current[matchId];
        if (
          existing &&
          existing.complete === status.complete &&
          existing.valid === status.valid &&
          existing.saved === status.saved &&
          existing.saving === status.saving &&
          existing.failed === status.failed
        ) {
          return current;
        }
        return { ...current, [matchId]: status };
      });
    },
    [],
  );
  async function mutate(path: string, init: RequestInit) {
    setError("");
    try {
      await api(path, init);
      await load();
    } catch (x) {
      const e = x as Error;
      setError(e.message);
      throw e;
    }
  }
  if (!data)
    return error ? (
      <UiAlert variant="destructive">
        <UiAlertTitle>Veranstaltung konnte nicht geladen werden</UiAlertTitle>
        <UiAlertDescription>{error}</UiAlertDescription>
      </UiAlert>
    ) : (
      <div
        className="control-page control-loading"
        aria-label="Veranstaltung lädt"
      >
        <UiCard>
          <UiCardHeader>
            <UiSkeleton className="h-7 w-2/5" />
            <UiSkeleton className="h-4 w-3/5" />
          </UiCardHeader>
        </UiCard>
        <div className="control-desk">
          <UiSkeleton className="h-[560px] w-full rounded-xl" />
          <UiSkeleton className="h-[560px] w-full rounded-xl" />
        </div>
      </div>
    );
  const round = data.currentRound,
    pm = new Map(data.players.map((p) => [p.id, p])),
    correctionPlayer = correctionPlayerId
      ? pm.get(correctionPlayerId)
      : undefined,
    correctionMatches = correctionPlayer
      ? data.rounds
          .filter((item) => item.state === "completed")
          .flatMap((item) =>
            item.matches
              .filter((match) =>
                matchPlayerIds(match).includes(correctionPlayer.id),
              )
              .map((match) => ({ round: item, match })),
          )
          .sort(
            (a, b) =>
              b.round.round_number - a.round.round_number ||
              a.match.court_number - b.match.court_number,
          )
      : [],
    sittingOutPlayers =
      round?.sitting_out_player_ids
        .map((playerId) => pm.get(playerId))
        .filter((player): player is Player => Boolean(player)) ?? [],
    participantCount = data.players.length,
    activePlayers = data.players.filter((p) => p.active).length,
    activeCourts = data.courts.filter((court) => court.active).length,
    nextSitOutCount = getSittingOutCount(activePlayers, activeCourts),
    perfectActiveCount =
      activePlayers >= 4 && activeCourts > 0 && nextSitOutCount === 0,
    initialSetup = data.rounds.length === 0,
    initialSetupReady = activePlayers >= 4 && activeCourts > 0,
    alphabeticalPlayers = [...data.players].sort(comparePlayersByName),
    rankedPlayers = data.leaderboard,
    lobbyOpen = !round || round.state === "completed",
    resultEntryOpen = isResultEntryRoundState(round?.state),
    completedResults = countCompletedResults(round?.matches ?? []),
    roundCanComplete = canCompleteRoundWithEntries(
      round?.state,
      round?.matches ?? [],
      matchEntryStatuses,
    );
  const generate = () =>
    mutate(`/admin/events/${id}/generate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (participantAdding) return;
    const f = e.currentTarget;
    setParticipantAdding(true);
    try {
      await mutate(`/admin/events/${id}/players`, {
        method: "POST",
        body: JSON.stringify({ name: new FormData(f).get("name") }),
      });
      f.reset();
    } catch {
      // The shared error alert contains the actionable API message.
    } finally {
      setParticipantAdding(false);
    }
  }
  return (
    <UiTooltipProvider>
      <div className="control-page">
        <UiCard className="control-header">
          <UiCardHeader>
            <UiCardTitle>
              <small className="control-event-name">{data.event.name}</small>
              <span
                className={cn(
                  "control-round-title",
                  round?.state === "completed" && "is-completed",
                )}
              >
                {round?.state === "completed" && (
                  <CheckCircle aria-hidden="true" weight="fill" />
                )}
                <span>
                  {round
                    ? `Runde ${round.round_number}${
                        round.state === "completed" ? " abgeschlossen" : ""
                      }`
                    : "Vorbereitung"}
                </span>
              </span>
            </UiCardTitle>
            <UiCardDescription>{participantCount} Teilnehmer</UiCardDescription>
            <UiCardAction>
              <div className="control-header-actions">
                {round?.state !== "completed" &&
                  round?.state !== "published" && (
                    <UiBadge variant={!round ? "outline" : "secondary"}>
                      {!round
                        ? "Vorbereitung"
                        : round.state === "results"
                          ? "Ergebnisse"
                          : round.state === "paused"
                            ? "Pausiert"
                            : "Läuft"}
                    </UiBadge>
                  )}
                <QR
                  url={`${window.location.origin}/event/${data.event.public_slug}`}
                />
                <UiDropdownMenu>
                  <UiDropdownMenuTrigger asChild>
                    <UiButton
                      className="event-actions-trigger"
                      variant="ghost"
                      size="icon-lg"
                      aria-label="Veranstaltungsaktionen öffnen"
                    >
                      <DotsThreeVertical />
                    </UiButton>
                  </UiDropdownMenuTrigger>
                  <UiDropdownMenuContent align="end" className="min-w-52">
                    <UiDropdownMenuGroup>
                      <UiDropdownMenuItem onSelect={() => nav("/admin")}>
                        <ArrowLeft /> Zur Übersicht
                      </UiDropdownMenuItem>
                    </UiDropdownMenuGroup>
                    <UiDropdownMenuSeparator />
                    <UiDropdownMenuGroup>
                      <UiDropdownMenuItem
                        onSelect={() => setSettingsOpen(true)}
                      >
                        <GearSix /> Einstellungen
                      </UiDropdownMenuItem>
                      <UiDropdownMenuItem
                        onSelect={() => {
                          void mutate(`/admin/events/${id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ status: "archived" }),
                          }).catch(() => {});
                        }}
                      >
                        <Archive /> Archivieren
                      </UiDropdownMenuItem>
                      <DeleteEventDialog
                        event={data.event}
                        onDeleted={() => nav("/admin")}
                      />
                    </UiDropdownMenuGroup>
                    <UiDropdownMenuSeparator />
                    <UiDropdownMenuGroup>
                      <LogoutMenuItem logout={logout} />
                    </UiDropdownMenuGroup>
                  </UiDropdownMenuContent>
                </UiDropdownMenu>
              </div>
            </UiCardAction>
          </UiCardHeader>
          {activeTab === "dashboard" &&
            round &&
            ["running", "paused"].includes(round.state) && (
              <UiCardFooter>
                <Clock round={round} mutate={mutate} />
              </UiCardFooter>
            )}
        </UiCard>
        <EventSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          duration={duration}
          save={(durationMinutes) =>
            mutate(`/admin/events/${id}`, {
              method: "PATCH",
              body: JSON.stringify({ durationMinutes }),
            })
          }
        />
        <nav className="event-tabs" aria-label="Veranstaltungsbereiche">
          <NavLink to={`/admin/events/${id}/dashboard`}>Dashboard</NavLink>
          <NavLink to={`/admin/events/${id}/teilnehmer`}>Teilnehmer</NavLink>
          <NavLink to={`/admin/events/${id}/plaetze`}>Plätze</NavLink>
          <NavLink to={`/admin/events/${id}/bestenliste`}>Bestenliste</NavLink>
        </nav>
        {error && (
          <UiAlert variant="destructive">
            <UiAlertTitle>Anfrage fehlgeschlagen</UiAlertTitle>
            <UiAlertDescription>{error}</UiAlertDescription>
          </UiAlert>
        )}
        {initialSetup && (
          <InitialSetupGuide
            eventId={id}
            activeTab={activeTab}
            activePlayers={activePlayers}
            activeCourts={activeCourts}
          />
        )}
        <div
          className={cn(
            "control-desk",
            activeTab === "dashboard" && "control-dashboard",
          )}
        >
          {activeTab === "dashboard" && (
            <UiCard
              className={cn(
                "control-stage",
                lobbyOpen && "is-draw-stage",
                round?.state === "completed" && "is-recap-stage",
              )}
            >
              <UiCardHeader>
                <UiCardTitle role="heading" aria-level={2}>
                  {!round
                    ? "Erste Runde auslosen"
                    : round.state === "completed"
                      ? "Aktualisierte Bestenliste"
                      : resultEntryOpen
                        ? "Ergebnisse erfassen"
                        : round.state === "published"
                          ? "Doppel veröffentlicht"
                          : "Runde vorbereiten"}
                </UiCardTitle>
                <UiCardDescription>
                  {!round
                    ? "Wer spielt in der ersten Runde zusammen?"
                    : round.state === "completed"
                      ? `Runde ${round.round_number} ist abgeschlossen.`
                      : resultEntryOpen
                        ? "Ergebnisse können eingetragen werden, sobald ein Platz fertig ist."
                        : "Die aktuelle Runde ist für die Teilnehmer sichtbar."}
                </UiCardDescription>
                {round && resultEntryOpen && (
                  <UiCardAction>
                    <UiBadge variant="outline">
                      {completedResults}/{round.matches.length} erfasst
                    </UiBadge>
                  </UiCardAction>
                )}
              </UiCardHeader>
              <UiCardContent>
                {round?.state === "completed" && (
                  <div className="round-recap-leaderboard">
                    <Leaderboard players={rankedPlayers} />
                  </div>
                )}
                {round?.state === "published" && (
                  <div className="control-actions">
                    <UiButton
                      size="lg"
                      data-primary-round-action
                      onClick={() =>
                        mutate(`/admin/rounds/${round.id}/action`, {
                          method: "POST",
                          body: JSON.stringify({ action: "start" }),
                        })
                      }
                    >
                      <Play data-icon="inline-start" weight="fill" />
                      {round.round_number === 1
                        ? "Erste Runde starten"
                        : "Runde starten"}
                    </UiButton>
                    <UiButton
                      className="redraw-action"
                      size="sm"
                      variant="ghost"
                      onClick={generate}
                    >
                      <Shuffle data-icon="inline-start" />
                      Neu auslosen
                    </UiButton>
                  </div>
                )}
                {round && round.state !== "completed" && (
                  <>
                    {sittingOutPlayers.length > 0 && (
                      <UiAlert className="sitting-out">
                        <UiAlertTitle>Setzen diese Runde aus</UiAlertTitle>
                        <UiAlertDescription>
                          {sittingOutPlayers.map((player) => (
                            <UiBadge key={player.id} variant="outline">
                              <i>{player.emoji}</i>
                              {player.display_name}
                            </UiBadge>
                          ))}
                        </UiAlertDescription>
                      </UiAlert>
                    )}
                    <div className="matches dashboard-matches">
                      {round.matches.map((m) => (
                        <MatchCard
                          key={m.id}
                          m={m}
                          players={pm}
                          result={resultEntryOpen}
                          onStatusChange={updateMatchEntryStatus}
                          save={(a, b) =>
                            mutate(`/admin/matches/${m.id}/result`, {
                              method: "PUT",
                              body: JSON.stringify({
                                teamAGames: a,
                                teamBGames: b,
                              }),
                            })
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </UiCardContent>
              <UiCardFooter
                className={cn(
                  "control-stage-footer",
                  (round?.state === "completed" || resultEntryOpen) &&
                    "floating-stage-footer",
                  resultEntryOpen && "results-progress-footer",
                )}
              >
                {(!round || round.state === "completed") && (
                  <UiButton
                    className="draw-action"
                    size="lg"
                    disabled={activePlayers < 4 || activeCourts === 0}
                    onClick={generate}
                  >
                    <Shuffle data-icon="inline-start" />
                    <span className="draw-action-label">
                      {round?.state === "completed"
                        ? "Nächste Runde auslosen"
                        : "Erste Runde auslosen"}
                    </span>
                  </UiButton>
                )}
                {round && resultEntryOpen && (
                  <>
                    <div className="result-progress" aria-live="polite">
                      <div>
                        <strong>
                          {completedResults} von {round.matches.length}{" "}
                          Ergebnissen erfasst
                        </strong>
                        <span>
                          {roundCanComplete
                            ? "Alle Ergebnisse sind gespeichert."
                            : "Alle Plätze vollständig eintragen."}
                        </span>
                      </div>
                      <UiProgress
                        value={
                          round.matches.length
                            ? (completedResults / round.matches.length) * 100
                            : 0
                        }
                        aria-label={`${completedResults} von ${round.matches.length} Ergebnissen erfasst`}
                      />
                    </div>
                    <UiButton
                      size="lg"
                      disabled={!roundCanComplete}
                      onClick={() => {
                        void mutate(`/admin/rounds/${round.id}/complete`, {
                          method: "POST",
                          body: JSON.stringify({ allowMissing: false }),
                        }).catch(() => {});
                      }}
                    >
                      <Check data-icon="inline-start" /> Runde abschließen
                    </UiButton>
                  </>
                )}
              </UiCardFooter>
            </UiCard>
          )}
          <section className="control-tab-panel">
            {activeTab === "plaetze" && (
              <CourtManager
                eventId={id}
                courts={data.courts}
                mutate={mutate}
                editable={!configurationLocked}
                showSetupAction={initialSetup}
                setupReady={initialSetupReady}
                onSetupContinue={() => nav(`/admin/events/${id}/dashboard`)}
              />
            )}
            {activeTab === "teilnehmer" && (
              <UiCard className="control-participants">
                <UiCardHeader>
                  <UiCardTitle>Teilnehmer</UiCardTitle>
                  <UiCardDescription>
                    {activePlayers} aktiv von {participantCount}
                  </UiCardDescription>
                  {!configurationLocked && (
                    <UiCardAction>
                      <UiButton
                        className="participant-add-trigger"
                        type="button"
                        variant={participantAddOpen ? "secondary" : "default"}
                        aria-expanded={participantAddOpen}
                        aria-controls="participant-add-form"
                        onClick={() => setParticipantAddOpen((open) => !open)}
                      >
                        {participantAddOpen ? (
                          <>
                            <X data-icon="inline-start" /> Schließen
                          </>
                        ) : (
                          <>
                            <Plus data-icon="inline-start" /> Hinzufügen
                          </>
                        )}
                      </UiButton>
                    </UiCardAction>
                  )}
                </UiCardHeader>
                <UiCardContent>
                  {configurationLocked && (
                    <UiAlert className="configuration-lock" role="status">
                      <LockKey />
                      <UiAlertTitle>Teilnehmer im Lesemodus</UiAlertTitle>
                      <UiAlertDescription>
                        Namen und Spielhistorie bleiben einsehbar. Änderungen
                        sind nach dem Rundenabschluss wieder möglich.
                      </UiAlertDescription>
                    </UiAlert>
                  )}
                  {!configurationLocked && participantAddOpen && (
                    <form
                      id="participant-add-form"
                      className="participant-add-form"
                      onSubmit={add}
                      onKeyDown={(event) => {
                        if (event.key === "Escape" && !participantAdding) {
                          event.preventDefault();
                          setParticipantAddOpen(false);
                        }
                      }}
                    >
                      <UiField>
                        <UiFieldLabel
                          className="sr-only"
                          htmlFor="participant-name"
                        >
                          Vorname oder Spitzname
                        </UiFieldLabel>
                        <UiInput
                          ref={participantNameRef}
                          id="participant-name"
                          name="name"
                          maxLength={40}
                          placeholder="Vorname oder Spitzname"
                          disabled={participantAdding}
                          aria-busy={participantAdding}
                          required
                        />
                      </UiField>
                      <div className="participant-add-actions">
                        <UiButton
                          type="button"
                          variant="outline"
                          disabled={participantAdding}
                          onClick={() => setParticipantAddOpen(false)}
                        >
                          Abbrechen
                        </UiButton>
                        <UiButton type="submit" disabled={participantAdding}>
                          {participantAdding
                            ? "Wird hinzugefügt…"
                            : "Hinzufügen"}
                        </UiButton>
                      </div>
                    </form>
                  )}
                  <div
                    className={cn(
                      "participant-balance",
                      perfectActiveCount && "perfect",
                    )}
                  >
                    {perfectActiveCount ? <Check /> : <Users />}
                    <span>
                      {activePlayers === 0
                        ? "Noch keine aktiven Teilnehmer."
                        : activePlayers < 4
                          ? `${activePlayers} aktiv: mindestens 4 für eine Runde.`
                          : activeCourts === 0
                            ? `${activePlayers} aktiv: Aktiviere mindestens einen Platz für die Auslosung.`
                            : perfectActiveCount
                              ? `Perfekt: ${activePlayers} aktive Teilnehmer, niemand setzt aus.`
                              : `${activePlayers} aktiv: ${nextSitOutCount} ${
                                  nextSitOutCount === 1 ? "setzt" : "setzen"
                                } bei der nächsten Runde aus.`}
                    </span>
                  </div>
                  {alphabeticalPlayers.length ? (
                    <UiScrollArea className="participant-scroll">
                      <div className="players control-players">
                        {alphabeticalPlayers.map((p) => (
                          <div
                            key={p.id}
                            className={
                              !p.active ? "player-row off" : "player-row"
                            }
                          >
                            <button
                              type="button"
                              className="player-open"
                              onClick={() => setCorrectionPlayerId(p.id)}
                              aria-label={
                                configurationLocked
                                  ? `Spielhistorie von ${p.display_name} anzeigen`
                                  : `${p.display_name} bearbeiten`
                              }
                            >
                              <i>{p.emoji}</i>
                              <span>
                                <strong>{p.display_name}</strong>
                              </span>
                              {configurationLocked && (
                                <small className="player-read-status">
                                  {p.active ? "Aktiv" : "Pausiert"}
                                </small>
                              )}
                            </button>
                            {!configurationLocked && (
                              <UiButton
                                type="button"
                                size="sm"
                                variant={p.active ? "secondary" : "outline"}
                                className={cn(
                                  "player-status-button",
                                  p.active && "is-active",
                                )}
                                aria-pressed={Boolean(p.active)}
                                aria-label={`${p.display_name} ${
                                  p.active ? "pausieren" : "aktivieren"
                                }`}
                                onClick={() =>
                                  mutate(`/admin/players/${p.id}`, {
                                    method: "PATCH",
                                    body: JSON.stringify({ active: !p.active }),
                                  }).catch(() => {})
                                }
                              >
                                {p.active ? (
                                  <Check aria-hidden="true" />
                                ) : (
                                  <Pause aria-hidden="true" weight="fill" />
                                )}
                                {p.active ? "Aktiv" : "Pausiert"}
                              </UiButton>
                            )}
                          </div>
                        ))}
                      </div>
                    </UiScrollArea>
                  ) : (
                    <p className="participant-empty">
                      {configurationLocked
                        ? "Noch keine Teilnehmer eingetragen."
                        : "Noch keine Teilnehmer. Über „+ Hinzufügen“ geht es los."}
                    </p>
                  )}
                </UiCardContent>
                {initialSetup && (
                  <UiCardFooter className="setup-continue">
                    <UiButton
                      size="lg"
                      disabled={activePlayers < 4}
                      onClick={() => nav(`/admin/events/${id}/plaetze`)}
                    >
                      Weiter zu den Plätzen{" "}
                      <ArrowRight data-icon="inline-end" />
                    </UiButton>
                  </UiCardFooter>
                )}
                <UiDialog
                  open={Boolean(correctionPlayer)}
                  onOpenChange={(open) => {
                    if (!open) setCorrectionPlayerId("");
                  }}
                >
                  <UiDialogContent className="correction-dialog sm:max-w-3xl">
                    <UiDialogHeader>
                      <UiDialogTitle>
                        {configurationLocked
                          ? "Teilnehmerdetails"
                          : "Teilnehmer bearbeiten"}
                      </UiDialogTitle>
                    </UiDialogHeader>
                    {correctionPlayer && (
                      <>
                        <PlayerEditorHeader
                          player={correctionPlayer}
                          matchCount={correctionMatches.length}
                          editable={!configurationLocked}
                          save={(name) =>
                            mutate(`/admin/players/${correctionPlayer.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ name }),
                            })
                          }
                        />
                        <div className="correction-section-heading">
                          <div>
                            <h3>Spielhistorie</h3>
                            <p>Abgeschlossene Spiele, neueste Runde zuerst.</p>
                          </div>
                        </div>
                        {correctionMatches.length ? (
                          <div className="correction-list">
                            {correctionMatches.map(({ round, match }) => (
                              <ScoreCorrection
                                key={match.id}
                                round={round}
                                match={match}
                                players={pm}
                                playerId={correctionPlayer.id}
                                save={(a, b) =>
                                  mutate(`/admin/matches/${match.id}/result`, {
                                    method: "PUT",
                                    body: JSON.stringify({
                                      teamAGames: a,
                                      teamBGames: b,
                                    }),
                                  })
                                }
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="correction-empty">
                            Für diesen Teilnehmer gibt es noch keinen früheren
                            Spielstand.
                          </p>
                        )}
                      </>
                    )}
                    <UiDialogFooter>
                      <UiDialogClose asChild>
                        <UiButton variant="outline">Schließen</UiButton>
                      </UiDialogClose>
                    </UiDialogFooter>
                  </UiDialogContent>
                </UiDialog>
              </UiCard>
            )}
            {activeTab === "bestenliste" && (
              <UiCard className="control-leaderboard">
                <UiCardHeader>
                  <UiCardTitle>Bestenliste</UiCardTitle>
                  <UiCardAction>
                    <Trophy />
                  </UiCardAction>
                </UiCardHeader>
                <UiCardContent>
                  <Leaderboard players={data.leaderboard} />
                </UiCardContent>
              </UiCard>
            )}
          </section>
        </div>
      </div>
    </UiTooltipProvider>
  );
}

function PublicEvent() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<EventData | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(() =>
      readPublicPlayerSelection(getBrowserPlayerStorage(), slug),
    ),
    [refreshing, setRefreshing] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  const refreshingRef = useRef(false);
  const load = (background = false) =>
    api<EventData>(`/public/events/${slug}`)
      .then((next) => {
        setData(next);
        setError("");
      })
      .catch((x) => {
        if (!background) setError(x.message);
      });
  const refresh = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await Promise.all([
        load(),
        new Promise<void>((resolve) => window.setTimeout(resolve, 450)),
      ]);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  };
  useEffect(() => {
    void load();
  }, [slug]);
  useEffect(() => {
    setSelected(readPublicPlayerSelection(getBrowserPlayerStorage(), slug));
  }, [slug]);
  useEffect(() => {
    if (!data) return;
    const timer = window.setInterval(() => {
      void load(true);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [slug, Boolean(data)]);
  useEffect(() => {
    if (
      !data ||
      data.event.public_slug !== slug ||
      !selected ||
      data.players.some((player) => player.id === selected)
    )
      return;

    setSelected("");
    writePublicPlayerSelection(getBrowserPlayerStorage(), slug, "");
  }, [data, selected, slug]);
  useEffect(() => {
    if (!selected) return;
    detailRef.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [selected, data?.currentRound?.id]);
  const match = useMemo(
    () =>
      data?.currentRound?.matches.find((m) =>
        [
          m.team_a_player_1_id,
          m.team_a_player_2_id,
          m.team_b_player_1_id,
          m.team_b_player_2_id,
        ].includes(selected),
      ),
    [data, selected],
  );
  if (error)
    return (
      <Shell>
        <Empty icon={<Archive />} title="Nicht verfügbar" text={error} />
      </Shell>
    );
  if (!data)
    return (
      <Shell>
        <Loading />
      </Shell>
    );
  const currentRound = data.currentRound;
  const initialLobby = data.rounds.length === 0;
  const lobbyPlayers = data.players.filter((player) => player.active);
  const selectedPlayer = data.players.find((x) => x.id === selected);
  const p = (id: string) => data.players.find((x) => x.id === id)!;
  const selectPlayer = (playerId: string) => {
    setSelected(playerId);
    writePublicPlayerSelection(getBrowserPlayerStorage(), slug, playerId);
  };
  let detail = (
    <div className="public-state">
      <b>
        <TennisBall />
      </b>
      <h2>Wer bist du?</h2>
      <p>
        Tippe unten deinen Namen an. Danach siehst du sofort Platz, Partner und
        Gegner.
      </p>
    </div>
  );
  if (selectedPlayer && !currentRound)
    detail = (
      <div className="public-state calm">
        <b>
          <Timer />
        </b>
        <p className="public-playerline">
          <i>{selectedPlayer.emoji}</i>
          <strong>{selectedPlayer.display_name}</strong>
        </p>
        <h2>Noch keine Paarung</h2>
        <p>Die Turnierleitung bereitet die nächste Runde vor.</p>
      </div>
    );
  if (selectedPlayer && currentRound && !match)
    detail = (
      <div className="public-state rest">
        <b>
          <Timer />
        </b>
        <p className="public-playerline">
          <i>{selectedPlayer.emoji}</i>
          <strong>{selectedPlayer.display_name}</strong>
        </p>
        <h2>Du setzt diese Runde aus</h2>
        <p>Kurz durchatmen. Bei der nächsten Runde wieder reinschauen.</p>
      </div>
    );
  if (match) {
    const ids = [
        match.team_a_player_1_id,
        match.team_a_player_2_id,
        match.team_b_player_1_id,
        match.team_b_player_2_id,
      ],
      a = ids.slice(0, 2).includes(selected),
      partner = p(
        (a ? ids.slice(0, 2) : ids.slice(2)).find((x) => x !== selected)!,
      ),
      opps = (a ? ids.slice(2) : ids.slice(0, 2)).map(p);
    detail = (
      <article className="assignment public-court-card">
        <header className="public-assignment-summary">
          <div className="public-assignment-court">
            <div className="public-assignment-court-copy">
              <span>Du spielst auf</span>
              <strong>{courtName(match)}</strong>
            </div>
            <div className="public-assignment-court-meta">
              <span
                className="public-assignment-round-badge"
                aria-label={`Runde ${currentRound?.round_number ?? "–"}`}
              >
                <small aria-hidden="true">Runde</small>
                <b aria-hidden="true">{currentRound?.round_number ?? "–"}</b>
              </span>
              <TennisBall aria-hidden="true" />
            </div>
          </div>
        </header>
        <div
          className="public-court-board"
          aria-label={`${courtName(match)}: ${p(selected).display_name} und ${partner.display_name} gegen ${opps[0].display_name} und ${opps[1].display_name}`}
        >
          <section
            className="public-court-team public-court-team-own"
            aria-label="Dein Team"
          >
            <div className="public-court-players">
              <div className="public-court-player is-partner">
                <i>{partner.emoji}</i>
                <strong>{partner.display_name}</strong>
                <small>Partner</small>
              </div>
              <div className="public-court-player is-you">
                <i>{p(selected).emoji}</i>
                <strong>{p(selected).display_name}</strong>
                <small>Du</small>
              </div>
            </div>
          </section>
          <section
            className="public-court-team public-court-team-opponents"
            aria-label="Gegner"
          >
            <div className="public-court-players">
              {opps.map((opponent) => (
                <div className="public-court-player" key={opponent.id}>
                  <i>{opponent.emoji}</i>
                  <strong>{opponent.display_name}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      </article>
    );
  }
  return (
    <Shell>
      <div className="public-screen">
        <div className="public-refresh-dock">
          <span className="public-refresh-status">
            <i aria-hidden="true" /> Auto-Update aktiv
          </span>
          <UiButton
            className={cn("public-refresh", refreshing && "is-refreshing")}
            variant="secondary"
            disabled={refreshing}
            aria-busy={refreshing}
            onClick={() => void refresh()}
          >
            <ArrowClockwise
              className="public-refresh-icon"
              aria-hidden="true"
            />
            <span className="public-refresh-label-desktop">
              {refreshing ? "Aktualisiere…" : "Aktualisieren"}
            </span>
            <span className="public-refresh-label-mobile">
              {refreshing ? "Aktualisiere…" : "Jetzt aktualisieren"}
            </span>
          </UiButton>
        </div>
        {initialLobby ? (
          <section className="public-lobby-roster" aria-live="polite">
            <header>
              <div>
                <h2>Lobby geöffnet</h2>
                <p>
                  {lobbyPlayers.length === 1
                    ? "1 Teilnehmer ist dabei"
                    : `${lobbyPlayers.length} Teilnehmer sind dabei`}
                </p>
              </div>
            </header>
            {lobbyPlayers.length ? (
              <div className="public-lobby-grid">
                {lobbyPlayers.map((player) => (
                  <button
                    type="button"
                    key={player.id}
                    className={selected === player.id ? "selected" : ""}
                    aria-pressed={selected === player.id}
                    onClick={() => selectPlayer(player.id)}
                  >
                    <i>{player.emoji}</i>
                    <span className="public-lobby-player-copy">
                      <strong>{player.display_name}</strong>
                      {selected === player.id && <span>· Du</span>}
                    </span>
                    {selected === player.id && (
                      <Check
                        className="public-lobby-selection-check"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="public-lobby-empty">
                <Users aria-hidden="true" />
                <strong>Noch niemand eingetragen</strong>
                <p>Neue Teilnehmer erscheinen hier automatisch.</p>
              </div>
            )}
          </section>
        ) : (
          <div className="public">
            <section
              className="panel detail"
              ref={detailRef}
              aria-live="polite"
            >
              {detail}
            </section>
            <section className="panel public-rank-panel">
              <div className="title">
                <div>
                  <h2>Bestenliste</h2>
                  <span className="title-note">Tippe deinen Namen an</span>
                </div>
                <Trophy />
              </div>
              <Leaderboard
                players={data.leaderboard}
                selected={selected}
                onSelect={selectPlayer}
              />
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}

export default function App() {
  const [auth, setAuth] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ authenticated: boolean; csrf?: string }>("/auth/session")
      .then((x) => {
        if (x.csrf) csrf = x.csrf;
        setAuth(x.authenticated);
      })
      .catch(() => setAuth(false));
  }, []);
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    csrf = "";
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
