import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Badge, Button, Dialog, TextField } from "@radix-ui/themes";
import {
  Archive,
  ArrowClockwise,
  Check,
  Copy,
  DotsThreeVertical,
  Link,
  LockKey,
  Minus,
  Pause,
  PencilSimple,
  Play,
  Plus,
  SkipForward,
  SignOut,
  TennisBall,
  Timer,
  Trash,
  Trophy,
  Users,
} from "@phosphor-icons/react";
import QRCode from "qrcode";
import hairBow from "./assets/hair-bow.png";
import raffleBox from "./assets/raffle-box.png";
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
  InputGroup as UiInputGroup,
  InputGroupAddon as UiInputGroupAddon,
  InputGroupButton as UiInputGroupButton,
  InputGroupInput as UiInputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea as UiScrollArea } from "@/components/ui/scroll-area";
import { Skeleton as UiSkeleton } from "@/components/ui/skeleton";
import { Switch as UiSwitch } from "@/components/ui/switch";
import { TooltipProvider as UiTooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  canCompleteRound,
  countCompletedResults,
  shouldAutoSaveScore,
} from "./admin-dashboard-state";

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

function Shell({
  children,
  logout,
}: {
  children: React.ReactNode;
  logout?: () => void;
}) {
  return (
    <>
      <header>
        <a className="brand" href={logout ? "/admin" : "/"}>
          <img src={sgaLogo} alt="SG Arheilgen Tennis" />
          <span>
            <strong>SGA Sommerfest</strong>
            <small>SG Arheilgen Tennis</small>
          </span>
        </a>
        {logout && (
          <Button variant="ghost" color="gray" onClick={logout}>
            <SignOut /> Abmelden
          </Button>
        )}
      </header>
      <main>{children}</main>
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
          <Badge color="blue">Turnierleitung</Badge>
          <h1>SGA Sommerfest</h1>
          <p>
            Spieler eintragen, faire Doppel auslosen und Ergebnisse direkt
            festhalten.
          </p>
          <div className="login-brandmark" aria-hidden="true">
            <img src={sgaLogo} alt="" />
            <span>Teilnehmer warten</span>
          </div>
        </section>
        <form className="panel" onSubmit={submit}>
          <LockKey size={30} />
          <h2>Organisator anmelden</h2>
          <label>
            Passwort
            <TextField.Root
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
              autoFocus
            />
          </label>
          {error && <p className="error">{error}</p>}
          <Button size="3">Anmelden</Button>
        </form>
      </div>
    </Shell>
  );
}

function DeleteEventDialog({
  event,
  onDeleted,
  compact = false,
}: {
  event: Pick<EventRow, "id" | "name">;
  onDeleted: () => void;
  compact?: boolean;
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
        <UiButton
          variant={compact ? "ghost" : "destructive"}
          size={compact ? "icon" : "default"}
          aria-label={`Veranstaltung ${event.name} löschen`}
        >
          <Trash data-icon={compact ? undefined : "inline-start"} />
          {!compact && "Löschen"}
        </UiButton>
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
    <>
      <div className="heading">
        <div>
          <p className="kicker">Veranstaltungen</p>
          <h1>Turnierübersicht</h1>
        </div>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger>
            <Button size="3">
              <Plus /> Veranstaltung
            </Button>
          </Dialog.Trigger>
          <Dialog.Content maxWidth="520px">
            <Dialog.Title>Neue Veranstaltung</Dialog.Title>
            <form className="form" onSubmit={create}>
              <label>
                Name
                <TextField.Root name="name" required />
              </label>
              <label>
                Rundendauer in Minuten
                <TextField.Root
                  name="durationMinutes"
                  type="number"
                  defaultValue="20"
                  min="1"
                  max="240"
                  required
                />
              </label>
              <Button>Erstellen</Button>
            </form>
          </Dialog.Content>
        </Dialog.Root>
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
        <div className="events">
          {items.map((x) => (
            <div className="event-row" key={x.id}>
              <button
                className="event-open"
                onClick={() => nav(`/admin/events/${x.id}`)}
              >
                <span>
                  <strong>{x.name}</strong>
                  <small>
                    {x.court_count ?? 0} Plätze,{" "}
                    {x.default_round_duration_seconds / 60} Minuten
                  </small>
                </span>
                <Badge color={x.status === "archived" ? "gray" : "blue"}>
                  {x.status === "archived"
                    ? "Archiviert"
                    : x.status === "lobby"
                      ? "Lobby"
                      : "Aktiv"}
                </Badge>
              </button>
              <DeleteEventDialog
                event={x}
                compact
                onDeleted={() =>
                  setItems(
                    (current) =>
                      current?.filter((item) => item.id !== x.id) ?? null,
                  )
                }
              />
            </div>
          ))}
        </div>
      )}
    </>
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
              <img src={hairBow} alt="" aria-hidden="true" />
              <span className="win-count">{p.wins}</span>
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
          <Link data-icon="inline-start" /> Teilnehmeransicht
        </UiButton>
      </UiDialogTrigger>
      <UiDialogContent className="sm:max-w-md">
        <UiDialogHeader>
          <UiDialogTitle>Teilnehmeransicht</UiDialogTitle>
        </UiDialogHeader>
        <div className="qr">
          {img ? (
            <img src={img} alt="QR-Code zur Teilnehmeransicht" />
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
}: {
  m: Match;
  players: Map<string, Player>;
  result: boolean;
  save: (a: number, b: number) => Promise<void>;
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
  const n = (id: string) => (
    <span className="player-pill">
      <i>{players.get(id)?.emoji}</i>
      {players.get(id)?.display_name}
    </span>
  );
  return (
    <article className="match court-card">
      <header className="court-label">
        <b>{courtName(m)}</b>
        {m.result_type === "played" && (
          <UiBadge variant="secondary">Gespeichert</UiBadge>
        )}
      </header>
      <div className="match-board">
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
          <span
            className={cn(
              "score-save-indicator",
              saved && "saved",
              saving && "saving",
              failed && "failed",
            )}
            aria-label={
              saved
                ? "Ergebnis gespeichert"
                : failed
                  ? "Speichern fehlgeschlagen"
                  : saving
                    ? "Ergebnis wird gespeichert"
                    : "Automatisches Speichern"
            }
            title={
              saved
                ? "Gespeichert"
                : failed
                  ? "Speichern fehlgeschlagen"
                  : saving
                    ? "Speichert…"
                    : "Speichert automatisch"
            }
          >
            <Check aria-hidden="true" weight="bold" />
          </span>
          <small
            className={
              saved
                ? "save-state saved"
                : failed
                  ? "save-state failed"
                  : "save-state"
            }
          >
            {saved
              ? "Gespeichert"
              : failed
                ? "Speichern fehlgeschlagen"
                : saving
                  ? "Speichert…"
                  : canSave
                    ? "Speichert automatisch"
                    : "Beide Teams wählen"}
          </small>
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
    <div className="score-entry" aria-label={label}>
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
  mutate: (p: string, i: RequestInit, m?: string) => Promise<void>;
}) {
  const [left, setLeft] = useState(round.duration_seconds);
  useEffect(() => {
    if (round.state !== "running" || !round.expires_at) return;
    const tick = () => {
      const s = Math.max(
        0,
        Math.ceil((Date.parse(round.expires_at!) - Date.now()) / 1000),
      );
      setLeft(s);
      if (!s)
        mutate(`/admin/rounds/${round.id}/action`, {
          method: "POST",
          body: JSON.stringify({ action: "end" }),
        });
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [round.id, round.state, round.expires_at]);
  if (["published", "results"].includes(round.state))
    return (
      <UiBadge
        variant={round.state === "results" ? "destructive" : "secondary"}
      >
        {round.state === "results" ? "Ergebnisse" : "Bereit"}
      </UiBadge>
    );
  return (
    <div className="clock">
      <b>
        {String(Math.floor(left / 60)).padStart(2, "0")}:
        {String(left % 60).padStart(2, "0")}
      </b>
      <span>{round.state === "paused" ? "Pausiert" : "Läuft"}</span>
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
        <UiButton
          size="icon"
          variant="secondary"
          aria-label="Runde skippen"
          onClick={() =>
            mutate(`/admin/rounds/${round.id}/action`, {
              method: "POST",
              body: JSON.stringify({ action: "skip" }),
            })
          }
        >
          <SkipForward />
        </UiButton>
      </div>
    </div>
  );
}

function CourtManager({
  eventId,
  courts,
  mutate,
  editable = true,
}: {
  eventId: string;
  courts: Court[];
  mutate: (path: string, init: RequestInit, message?: string) => Promise<void>;
  editable?: boolean;
}) {
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const editingCourt = courts.find((court) => court.id === editingId);
  const activeCount = courts.filter((court) => court.active).length;

  async function addCourt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await mutate(
      `/admin/events/${eventId}/courts`,
      {
        method: "POST",
        body: JSON.stringify({ name: new FormData(form).get("name") }),
      },
      "Platz hinzugefügt.",
    );
    form.reset();
  }

  return (
    <UiCard className="control-courts">
      <UiCardHeader>
        <UiCardTitle>Plätze</UiCardTitle>
        <UiCardDescription>
          {activeCount} aktiv von {courts.length}
        </UiCardDescription>
        <UiCardAction>
          <TennisBall />
        </UiCardAction>
      </UiCardHeader>
      <UiCardContent>
        {!editable && (
          <UiAlert className="configuration-lock">
            <LockKey />
            <UiAlertTitle>Platzverwaltung gesperrt</UiAlertTitle>
            <UiAlertDescription>
              Während der offenen Runde bleiben Plätze sichtbar. Änderungen sind
              nach dem Rundenabschluss wieder möglich.
            </UiAlertDescription>
          </UiAlert>
        )}
        {editable && (
          <form onSubmit={addCourt}>
            <UiFieldGroup>
              <UiField>
                <UiFieldLabel className="sr-only" htmlFor="court-name">
                  Platzname
                </UiFieldLabel>
                <UiInputGroup>
                  <UiInputGroupInput
                    id="court-name"
                    name="name"
                    placeholder="z. B. Halle 1"
                    maxLength={40}
                    disabled={courts.length >= 13}
                    required
                  />
                  <UiInputGroupAddon align="inline-end">
                    <UiInputGroupButton
                      type="submit"
                      size="icon-xs"
                      aria-label="Platz hinzufügen"
                      disabled={courts.length >= 13}
                    >
                      <Plus />
                    </UiInputGroupButton>
                  </UiInputGroupAddon>
                </UiInputGroup>
              </UiField>
            </UiFieldGroup>
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
          {courts.map((court) => (
            <div
              key={court.id}
              className={cn("court-visual-card", !court.active && "off")}
            >
              <button
                type="button"
                className="court-open court-surface"
                aria-label={`${court.name} umbenennen`}
                disabled={!editable}
                onClick={() => {
                  setEditingId(court.id);
                  setEditingName(court.name);
                }}
              >
                <span className="court-diagram" aria-hidden="true">
                  <span className="court-net" />
                </span>
                <span className="court-card-label">
                  <strong>{court.name}</strong>
                  <small>{court.active ? "Aktiv" : "Inaktiv"}</small>
                </span>
                {editable && <PencilSimple />}
              </button>
              <div className="court-card-actions">
                <UiBadge variant={court.active ? "secondary" : "outline"}>
                  {court.active ? "Aktiv" : "Aus"}
                </UiBadge>
                <UiSwitch
                  aria-label={`${court.name} aktiv`}
                  checked={!!court.active}
                  disabled={!editable}
                  onCheckedChange={(active) =>
                    mutate(`/admin/courts/${court.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ active }),
                    }).catch(() => {})
                  }
                />
              </div>
            </div>
          ))}
          {courts.length === 0 && (
            <p className="court-empty">
              Noch keine Plätze. Lege den ersten Spielort oben an.
            </p>
          )}
        </div>
      </UiCardContent>
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
                void mutate(
                  `/admin/courts/${editingCourt.id}`,
                  {
                    method: "PATCH",
                    body: JSON.stringify({ name: editingName }),
                  },
                  "Platz umbenannt.",
                ).then(() => setEditingId(""));
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

function EventAdmin() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const routeLocation = useLocation();
  const requestedTab =
    routeLocation.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const activeTab: EventTab = isEventTab(requestedTab)
    ? requestedTab
    : "dashboard";
  const [data, setData] = useState<EventData | null>(null),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const [duration, setDuration] = useState(20);
  const [correctionPlayerId, setCorrectionPlayerId] = useState("");
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
    if (!isEventTab(requestedTab)) {
      nav(`/admin/events/${id}/dashboard`, { replace: true });
      return;
    }
  }, [id, nav, requestedTab]);
  async function mutate(path: string, init: RequestInit, message?: string) {
    setError("");
    setNote("");
    try {
      await api(path, init);
      if (message) setNote(message);
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
    perfectActiveCount = activePlayers >= 4 && activePlayers % 4 === 0,
    nextSitOutCount = activePlayers >= 4 ? activePlayers % 4 : 0,
    rankedPlayers = data.leaderboard,
    lobbyOpen = !round || round.state === "completed",
    visibleLobbySlots = Math.max(
      8,
      Math.min(16, Math.max(activeCourts * 4, data.players.length + 4)),
    ),
    completedResults = countCompletedResults(round?.matches ?? []),
    roundCanComplete = canCompleteRound(round?.state, round?.matches ?? []);
  const generate = () =>
    mutate(
      `/admin/events/${id}/generate`,
      {
        method: "POST",
        body: JSON.stringify({ durationMinutes: duration }),
      },
      "Doppel ausgelost und veröffentlicht.",
    );
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    await mutate(
      `/admin/events/${id}/players`,
      {
        method: "POST",
        body: JSON.stringify({ name: new FormData(f).get("name") }),
      },
      "Teilnehmer hinzugefügt.",
    );
    f.reset();
  }
  return (
    <UiTooltipProvider>
      <div className="control-page">
        <UiCard className="control-header">
          <UiCardHeader>
            <UiCardTitle>
              <UiButton variant="ghost" size="sm" onClick={() => nav("/admin")}>
                Zur Übersicht
              </UiButton>
              <span>{data.event.name}</span>
            </UiCardTitle>
            <UiCardDescription>
              {round ? `Runde ${round.round_number}` : "Lobby geöffnet"}
              {" · "}
              {participantCount} Teilnehmer · {activeCourts} aktive Plätze ·{" "}
              {duration} Minuten
            </UiCardDescription>
            <UiCardAction>
              <div className="control-header-actions">
                <UiBadge variant={lobbyOpen ? "outline" : "secondary"}>
                  {lobbyOpen
                    ? "Vorbereitung"
                    : round?.state === "results"
                      ? "Ergebnisse"
                      : round?.state === "published"
                        ? "Bereit"
                        : round?.state === "paused"
                          ? "Pausiert"
                          : "Läuft"}
                </UiBadge>
                <details className="event-menu">
                  <summary aria-label="Veranstaltungsaktionen öffnen">
                    <DotsThreeVertical />
                  </summary>
                  <div className="event-menu-content">
                    <UiButton
                      variant="ghost"
                      onClick={() =>
                        mutate(
                          `/admin/events/${id}`,
                          {
                            method: "PATCH",
                            body: JSON.stringify({ status: "archived" }),
                          },
                          "Veranstaltung archiviert.",
                        )
                      }
                    >
                      <Archive data-icon="inline-start" /> Archivieren
                    </UiButton>
                    <DeleteEventDialog
                      event={data.event}
                      onDeleted={() => nav("/admin")}
                    />
                  </div>
                </details>
              </div>
            </UiCardAction>
          </UiCardHeader>
          <UiCardFooter>
            <QR
              url={`${window.location.origin}/event/${data.event.public_slug}`}
            />
            {activeTab === "dashboard" &&
              round &&
              round.state !== "completed" && (
                <Clock round={round} mutate={mutate} />
              )}
          </UiCardFooter>
        </UiCard>
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
        {note && (
          <UiAlert className="control-success">
            <Check />
            <UiAlertTitle>Erledigt</UiAlertTitle>
            <UiAlertDescription>{note}</UiAlertDescription>
          </UiAlert>
        )}
        <div
          className={cn(
            "control-desk",
            activeTab === "dashboard" && "control-dashboard",
          )}
        >
          {activeTab === "dashboard" && (
            <UiCard
              className={cn("control-stage", lobbyOpen && "is-draw-stage")}
            >
              <UiCardHeader>
                <UiCardTitle>
                  {!round || round.state === "completed"
                    ? "Nächste Runde auslosen"
                    : round.state === "results"
                      ? "Ergebnisse eintragen"
                      : round.state === "published"
                        ? "Doppel veröffentlicht"
                        : "Runde läuft"}
                </UiCardTitle>
                <UiCardDescription>
                  {round && round.state !== "completed"
                    ? "Die aktuelle Runde ist für die Teilnehmer sichtbar."
                    : "Wer spielt als Nächstes zusammen?"}
                </UiCardDescription>
                {round?.state === "results" && (
                  <UiCardAction>
                    <UiBadge variant="outline">
                      {completedResults}/{round.matches.length} erfasst
                    </UiBadge>
                  </UiCardAction>
                )}
              </UiCardHeader>
              <UiCardContent>
                {(!round || round.state === "completed") && (
                  <UiFieldGroup className="control-settings">
                    <UiField orientation="horizontal">
                      <UiFieldLabel htmlFor="round-duration">
                        Rundendauer
                      </UiFieldLabel>
                      <div className="duration-stepper">
                        <UiButton
                          type="button"
                          size="icon-lg"
                          variant="outline"
                          aria-label="Rundendauer um 5 Minuten verringern"
                          disabled={duration <= 1}
                          onClick={() =>
                            setDuration((current) => Math.max(1, current - 5))
                          }
                        >
                          <Minus />
                        </UiButton>
                        <UiInput
                          id="round-duration"
                          className="duration-stepper-input"
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="240"
                          value={duration}
                          aria-label="Rundendauer in Minuten"
                          onChange={(e) => setDuration(+e.target.value)}
                        />
                        <UiButton
                          type="button"
                          size="icon-lg"
                          variant="outline"
                          aria-label="Rundendauer um 5 Minuten erhöhen"
                          disabled={duration >= 240}
                          onClick={() =>
                            setDuration((current) => Math.min(240, current + 5))
                          }
                        >
                          <Plus />
                        </UiButton>
                      </div>
                    </UiField>
                  </UiFieldGroup>
                )}
                {round?.state === "published" && (
                  <div className="control-actions">
                    <UiButton
                      size="lg"
                      data-primary-round-action
                      onClick={() =>
                        mutate(
                          `/admin/rounds/${round.id}/action`,
                          {
                            method: "POST",
                            body: JSON.stringify({ action: "start" }),
                          },
                          "Runde gestartet.",
                        )
                      }
                    >
                      <Play data-icon="inline-start" weight="fill" /> Runde
                      starten
                    </UiButton>
                    <UiButton
                      className="redraw-action"
                      size="sm"
                      variant="ghost"
                      onClick={generate}
                    >
                      <img
                        className="raffle-box-inline-icon"
                        src={raffleBox}
                        alt=""
                        aria-hidden="true"
                        data-icon="inline-start"
                      />
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
                          result={round.state === "results"}
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
              <UiCardFooter className="control-stage-footer">
                {(!round || round.state === "completed") && (
                  <UiButton
                    className="draw-action"
                    size="lg"
                    disabled={activePlayers < 4 || activeCourts === 0}
                    onClick={generate}
                  >
                    <span className="draw-action-icon" aria-hidden="true">
                      <img className="raffle-box-icon" src={raffleBox} alt="" />
                    </span>
                    <span className="draw-action-label">Doppel auslosen</span>
                  </UiButton>
                )}
                {round?.state === "results" && (
                  <UiButton
                    size="lg"
                    disabled={!roundCanComplete}
                    onClick={() => {
                      void mutate(
                        `/admin/rounds/${round.id}/complete`,
                        {
                          method: "POST",
                          body: JSON.stringify({ allowMissing: false }),
                        },
                        "Runde abgeschlossen.",
                      ).catch(() => {});
                    }}
                  >
                    Runde abschließen
                  </UiButton>
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
              />
            )}
            {activeTab === "teilnehmer" && (
              <UiCard className="control-participants">
                <UiCardHeader>
                  <UiCardTitle>Teilnehmer</UiCardTitle>
                  <UiCardDescription>
                    {activePlayers} aktiv von {participantCount}
                  </UiCardDescription>
                  <UiCardAction>
                    <Users />
                  </UiCardAction>
                </UiCardHeader>
                <UiCardContent>
                  {configurationLocked && (
                    <UiAlert className="configuration-lock">
                      <LockKey />
                      <UiAlertTitle>Spielerverwaltung gesperrt</UiAlertTitle>
                      <UiAlertDescription>
                        Während der offenen Runde können Teilnehmer und ihre
                        Spielhistorie angesehen werden. Änderungen sind nach dem
                        Rundenabschluss wieder möglich.
                      </UiAlertDescription>
                    </UiAlert>
                  )}
                  {!configurationLocked && (
                    <form onSubmit={add}>
                      <UiFieldGroup>
                        <UiField>
                          <UiFieldLabel
                            className="sr-only"
                            htmlFor="participant-name"
                          >
                            Vorname oder Spitzname
                          </UiFieldLabel>
                          <UiInputGroup>
                            <UiInputGroupInput
                              id="participant-name"
                              name="name"
                              placeholder="Vorname oder Spitzname"
                              required
                            />
                            <UiInputGroupAddon align="inline-end">
                              <UiInputGroupButton
                                type="submit"
                                size="icon-xs"
                                aria-label="Teilnehmer hinzufügen"
                              >
                                <Plus />
                              </UiInputGroupButton>
                            </UiInputGroupAddon>
                          </UiInputGroup>
                        </UiField>
                      </UiFieldGroup>
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
                          : perfectActiveCount
                            ? `Perfekt: ${activePlayers} aktive Teilnehmer, niemand setzt aus.`
                            : `${activePlayers} aktiv: ${nextSitOutCount} ${
                                nextSitOutCount === 1 ? "setzt" : "setzen"
                              } bei der nächsten Runde aus.`}
                    </span>
                  </div>
                  <UiScrollArea className="participant-scroll">
                    <div className="players control-players">
                      {rankedPlayers.map((p) => (
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
                            aria-label={`${p.display_name} bearbeiten`}
                          >
                            <i>{p.emoji}</i>
                            <span>
                              <strong>{p.display_name}</strong>
                            </span>
                          </button>
                          <UiSwitch
                            aria-label={`${p.display_name} aktiv`}
                            checked={!!p.active}
                            disabled={configurationLocked}
                            onCheckedChange={(active) =>
                              mutate(`/admin/players/${p.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ active }),
                              }).catch(() => {})
                            }
                          />
                        </div>
                      ))}
                      {Array.from({
                        length: Math.max(
                          0,
                          visibleLobbySlots - rankedPlayers.length,
                        ),
                      }).map((_, i) => (
                        <div key={`empty-${i}`} className="slot-empty">
                          <i>+</i>
                          <span>Leer</span>
                          <small>Wartet auf Teilnehmer</small>
                        </div>
                      ))}
                    </div>
                  </UiScrollArea>
                </UiCardContent>
                <UiDialog
                  open={Boolean(correctionPlayer)}
                  onOpenChange={(open) => {
                    if (!open) setCorrectionPlayerId("");
                  }}
                >
                  <UiDialogContent className="correction-dialog sm:max-w-3xl">
                    <UiDialogHeader>
                      <UiDialogTitle>Teilnehmer bearbeiten</UiDialogTitle>
                    </UiDialogHeader>
                    {correctionPlayer && (
                      <>
                        <PlayerEditorHeader
                          player={correctionPlayer}
                          matchCount={correctionMatches.length}
                          editable={!configurationLocked}
                          save={(name) =>
                            mutate(
                              `/admin/players/${correctionPlayer.id}`,
                              {
                                method: "PATCH",
                                body: JSON.stringify({ name }),
                              },
                              "Name geändert.",
                            )
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
                                  mutate(
                                    `/admin/matches/${match.id}/result`,
                                    {
                                      method: "PUT",
                                      body: JSON.stringify({
                                        teamAGames: a,
                                        teamBGames: b,
                                      }),
                                    },
                                    "Spielstand korrigiert.",
                                  )
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
    [selected, setSelected] = useState(""),
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
    if (!data || data.rounds.length > 0) return;
    const timer = window.setInterval(() => {
      void load(true);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [slug, data?.rounds.length]);
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
        <header className="public-court-header">
          <div>
            <span>Du spielst auf</span>
            <strong>{courtName(match)}</strong>
          </div>
          <TennisBall aria-hidden="true" />
        </header>
        <div
          className="public-court-board"
          aria-label={`${courtName(match)}: ${p(selected).display_name} und ${partner.display_name} gegen ${opps[0].display_name} und ${opps[1].display_name}`}
        >
          <div className="public-court-lines" aria-hidden="true">
            <span className="court-line court-line-service-top" />
            <span className="court-line court-line-service-bottom" />
            <span className="court-line court-line-service-center" />
            <span className="court-line court-line-net" />
          </div>
          <section className="public-court-team public-court-team-own">
            <span className="public-court-team-label">Dein Team</span>
            <div className="public-court-players">
              <div className="public-court-player is-you">
                <i>{p(selected).emoji}</i>
                <strong>{p(selected).display_name}</strong>
                <small>Du</small>
              </div>
              <div className="public-court-player">
                <i>{partner.emoji}</i>
                <strong>{partner.display_name}</strong>
                <small>Partner</small>
              </div>
            </div>
          </section>
          <div className="public-court-versus" aria-hidden="true">
            <span>vs</span>
          </div>
          <section className="public-court-team public-court-team-opponents">
            <div className="public-court-players">
              {opps.map((opponent) => (
                <div className="public-court-player" key={opponent.id}>
                  <i>{opponent.emoji}</i>
                  <strong>{opponent.display_name}</strong>
                  <small>Gegner</small>
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
          <Button
            className={cn("public-refresh", refreshing && "is-refreshing")}
            variant="soft"
            disabled={refreshing}
            aria-busy={refreshing}
            onClick={() => void refresh()}
          >
            <ArrowClockwise
              className="public-refresh-icon"
              aria-hidden="true"
            />
            <span>{refreshing ? "Aktualisiere…" : "Aktualisieren"}</span>
          </Button>
        </div>
        <div className="heading public-hero">
          <div>
            <p className="kicker">
              {currentRound ? `Runde ${currentRound.round_number}` : "Lobby"}
            </p>
            <h1>{data.event.name}</h1>
            <p>
              {selectedPlayer
                ? `${selectedPlayer.emoji} ${selectedPlayer.display_name}`
                : "Namen antippen, Zuweisung sehen"}
            </p>
          </div>
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
              <span className="public-lobby-live">
                <i aria-hidden="true" />
                Aktualisiert automatisch
              </span>
            </header>
            {lobbyPlayers.length ? (
              <div className="public-lobby-grid">
                {lobbyPlayers.map((player) => (
                  <button
                    type="button"
                    key={player.id}
                    className={selected === player.id ? "selected" : ""}
                    aria-pressed={selected === player.id}
                    onClick={() => setSelected(player.id)}
                  >
                    <i>{player.emoji}</i>
                    <strong>{player.display_name}</strong>
                    {selected === player.id && (
                      <span>
                        <Check aria-hidden="true" /> Du
                      </span>
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
                onSelect={setSelected}
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
                <Route path="events/:id/*" element={<EventAdmin />} />
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
