import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Badge,
  Button,
  Dialog,
  Flex,
  IconButton,
  Select,
  Switch,
  TextField,
} from "@radix-ui/themes";
import {
  Archive,
  ArrowClockwise,
  Check,
  Copy,
  Link,
  LockKey,
  Pause,
  Play,
  Plus,
  SkipForward,
  SignOut,
  TennisBall,
  Timer,
  Trophy,
  Users,
} from "@phosphor-icons/react";
import QRCode from "qrcode";
import sgaLogo from "./assets/sga-logo.png";

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
type Match = {
  id: string;
  court_number: number;
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
  default_court_count: number;
  status: string;
};
type EventData = {
  event: EventRow;
  players: Player[];
  leaderboard: Player[];
  rounds: Round[];
  currentRound: Round | null;
};
const scoreValues = [0, 1, 2, 3, 4, 5, 6];
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
          <h1>Sommerfest auf Platz.</h1>
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
              <label>
                Anzahl Plätze
                <TextField.Root
                  name="courtCount"
                  type="number"
                  defaultValue="4"
                  min="1"
                  max="13"
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
            <button key={x.id} onClick={() => nav(`/admin/events/${x.id}`)}>
              <span>
                <strong>{x.name}</strong>
                <small>
                  {x.default_court_count} Plätze,{" "}
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
          className={selected === p.id ? "selected" : ""}
          disabled={!onSelect}
          onClick={() => onSelect?.(p.id)}
        >
          <b>{p.rank}</b>
          <i>{p.emoji}</i>
          <span>
            <strong>{p.display_name}</strong>
            <small aria-label={`${p.wins} Siege`}>
              {p.wins ? "\u{1F380}".repeat(p.wins) : "Noch kein Sieg"}
            </small>
          </span>
          <em>
            {p.gameDifference > 0 ? "+" : ""}
            {p.gameDifference}
          </em>
        </button>
      ))}
    </div>
  );
}

function QR({ url }: { url: string }) {
  const [img, setImg] = useState("");
  return (
    <Dialog.Root
      onOpenChange={(o) =>
        o &&
        QRCode.toDataURL(url, {
          width: 420,
          margin: 2,
          color: { dark: "#0f3d78", light: "#ffffff" },
        }).then(setImg)
      }
    >
      <Dialog.Trigger>
        <Button variant="soft">
          <Link /> Teilnehmeransicht
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="460px">
        <Dialog.Title>Teilnehmeransicht</Dialog.Title>
        <div className="qr">
          {img ? (
            <img src={img} alt="QR-Code zur Teilnehmeransicht" />
          ) : (
            <Loading />
          )}
        </div>
        <Flex gap="3" justify="end">
          <Dialog.Close>
            <Button color="gray" variant="soft">
              Schließen
            </Button>
          </Dialog.Close>
          <Button onClick={() => navigator.clipboard.writeText(url)}>
            <Copy /> Link kopieren
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
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
      !canSave ||
      a === null ||
      b === null ||
      currentKey === lastSaved ||
      currentKey === failedKey ||
      saving
    )
      return;
    setSaving(true);
    save(a, b)
      .then(() => {
        setLastSaved(currentKey);
        setFailedKey("");
      })
      .catch(() => setFailedKey(currentKey))
      .finally(() => setSaving(false));
  }, [a, b, canSave, currentKey, failedKey, lastSaved, save, saving]);
  const n = (id: string) => (
    <span className="player-pill">
      <i>{players.get(id)?.emoji}</i>
      {players.get(id)?.display_name}
    </span>
  );
  return (
    <article className="match court-card">
      <header className="court-label">
        <b>Platz {m.court_number}</b>
        {m.result_type === "played" && <Badge color="blue">Gespeichert</Badge>}
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
          <IconButton
            aria-label="Ergebnis speichern"
            color={canSave ? "blue" : "gray"}
            variant={canSave ? "solid" : "soft"}
            disabled={!canSave || saving}
            onClick={() => {
              if (a !== null && b !== null && canSave)
                void save(a, b)
                  .then(() => {
                    setLastSaved(currentKey);
                    setFailedKey("");
                  })
                  .catch(() => setFailedKey(currentKey));
            }}
          >
            <Check />
          </IconButton>
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
        <TextField.Root
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
      <Badge color={round.state === "results" ? "orange" : "blue"}>
        {round.state === "results" ? "Ergebnisse" : "Bereit"}
      </Badge>
    );
  return (
    <div className="clock">
      <b>
        {String(Math.floor(left / 60)).padStart(2, "0")}:
        {String(left % 60).padStart(2, "0")}
      </b>
      <span>{round.state === "paused" ? "Pausiert" : "Läuft"}</span>
      <Flex gap="2">
        {round.state === "running" ? (
          <IconButton
            variant="soft"
            aria-label="Runde pausieren"
            onClick={() =>
              mutate(`/admin/rounds/${round.id}/action`, {
                method: "POST",
                body: JSON.stringify({ action: "pause" }),
              })
            }
          >
            <Pause />
          </IconButton>
        ) : (
          <IconButton
            variant="soft"
            aria-label="Runde fortsetzen"
            onClick={() =>
              mutate(`/admin/rounds/${round.id}/action`, {
                method: "POST",
                body: JSON.stringify({ action: "resume" }),
              })
            }
          >
            <Play />
          </IconButton>
        )}
        <IconButton
          color="orange"
          variant="soft"
          aria-label="Runde skippen"
          onClick={() =>
            mutate(`/admin/rounds/${round.id}/action`, {
              method: "POST",
              body: JSON.stringify({ action: "skip" }),
            })
          }
        >
          <SkipForward />
        </IconButton>
      </Flex>
    </div>
  );
}

function EventAdmin() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<EventData | null>(null),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const [duration, setDuration] = useState(20),
    [courts, setCourts] = useState(4);
  const load = () =>
    api<EventData>(`/admin/events/${id}`)
      .then((x) => {
        setData(x);
        setDuration(x.event.default_round_duration_seconds / 60);
        setCourts(x.event.default_court_count);
      })
      .catch((x) => setError(x.message));
  useEffect(() => {
    void load();
  }, [id]);
  async function mutate(path: string, init: RequestInit, message?: string) {
    setError("");
    setNote("");
    try {
      await api(path, init);
      if (message) setNote(message);
      await load();
    } catch (x) {
      const e = x as Error & { data?: { error?: string; count?: number } };
      if (
        e.data?.error === "missing_results" &&
        confirm(`${e.data.count} Ergebnis(se) fehlen. Als 0:0 werten?`)
      ) {
        await api(path, {
          ...init,
          body: JSON.stringify({ allowMissing: true }),
        });
        setNote("Runde abgeschlossen.");
        await load();
        return;
      }
      setError(e.message);
      throw e;
    }
  }
  if (!data)
    return error ? <p className="notice error">{error}</p> : <Loading />;
  const round = data.currentRound,
    pm = new Map(data.players.map((p) => [p.id, p])),
    sittingOutPlayers =
      round?.sitting_out_player_ids
        .map((playerId) => pm.get(playerId))
        .filter((player): player is Player => Boolean(player)) ?? [],
    participantCount = data.players.length,
    activePlayers = data.players.filter((p) => p.active).length,
    rankedPlayers = data.leaderboard,
    lobbyOpen = !round || round.state === "completed",
    visibleLobbySlots = Math.max(
      8,
      Math.min(16, Math.max(courts * 4, data.players.length + 4)),
    );
  const generate = () =>
    mutate(
      `/admin/events/${id}/generate`,
      {
        method: "POST",
        body: JSON.stringify({ durationMinutes: duration, courtCount: courts }),
      },
      "Paarungen veröffentlicht.",
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
    <>
      <div className="heading">
        <div>
          <Button variant="ghost" color="gray" onClick={() => nav("/admin")}>
            Zur Übersicht
          </Button>
          <h1>{data.event.name}</h1>
        </div>
        <QR url={`${location.origin}/event/${data.event.public_slug}`} />
      </div>
      {error && <p className="notice error">{error}</p>}
      {note && (
        <p className="notice success">
          <Check /> {note}
        </p>
      )}
      <div className={`admin${lobbyOpen ? " lobby-open" : ""}`}>
        <section className="panel stage">
          <div className="roundhead">
            <div>
              <p className="kicker">
                {round ? `Runde ${round.round_number}` : "Lobby geöffnet"}
              </p>
              <h2>
                {!round || round.state === "completed"
                  ? "Nächste Runde vorbereiten"
                  : round.state === "results"
                    ? "Ergebnisse eintragen"
                    : round.state === "published"
                      ? "Paarungen veröffentlicht"
                      : "Runde läuft"}
              </h2>
            </div>
            {round && round.state !== "completed" && (
              <Clock round={round} mutate={mutate} />
            )}
          </div>
          <div className="lobby-status">
            <img src={sgaLogo} alt="" />
            <div>
              <strong>
                {round && round.state !== "completed"
                  ? "Runde ist f\u00fcr die Teilnehmer sichtbar"
                  : "Teilnehmer warten auf Paarungen"}
              </strong>
              <span>
                Teilnehmer {participantCount} · {courts} Pl{"\u00e4"}tze ·{" "}
                {duration} Minuten
              </span>
            </div>
          </div>
          {(!round || round.state === "completed") && (
            <div className="settings">
              <label>
                <span>
                  <Timer /> Minuten
                </span>
                <TextField.Root
                  type="number"
                  min="1"
                  max="240"
                  value={duration}
                  onChange={(e) => setDuration(+e.target.value)}
                />
              </label>
              <label>
                <span>Plätze</span>
                <Select.Root
                  value={String(courts)}
                  onValueChange={(v) => setCourts(+v)}
                >
                  <Select.Trigger />
                  <Select.Content>
                    {Array.from({ length: 13 }, (_, i) => (
                      <Select.Item key={i} value={String(i + 1)}>
                        {i + 1}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </label>
            </div>
          )}
          {(!round || round.state === "completed") && (
            <Button
              size="3"
              disabled={data.players.filter((p) => p.active).length < 4}
              onClick={generate}
            >
              <ArrowClockwise /> Paarungen erstellen
            </Button>
          )}
          {round?.state === "published" && (
            <Flex gap="3">
              <Button
                size="3"
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
                <Play weight="fill" /> Starten
              </Button>
              <Button size="3" variant="soft" onClick={generate}>
                <ArrowClockwise /> Neu auslosen
              </Button>
            </Flex>
          )}{" "}
          {round && round.state !== "completed" && (
            <>
              {sittingOutPlayers.length > 0 && (
                <div className="sitting-out">
                  <strong>Setzen diese Runde aus</strong>
                  <div>
                    {sittingOutPlayers.map((player) => (
                      <span key={player.id}>
                        <i>{player.emoji}</i>
                        {player.display_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="matches">
                {round.matches.map((m) => (
                  <MatchCard
                    key={m.id}
                    m={m}
                    players={pm}
                    result={round.state === "results"}
                    save={(a, b) =>
                      mutate(
                        `/admin/matches/${m.id}/result`,
                        {
                          method: "PUT",
                          body: JSON.stringify({
                            teamAGames: a,
                            teamBGames: b,
                          }),
                        },
                        "Ergebnis gespeichert.",
                      )
                    }
                  />
                ))}
              </div>
            </>
          )}
          {round?.state === "results" && (
            <Button
              size="3"
              onClick={() =>
                mutate(
                  `/admin/rounds/${round.id}/complete`,
                  {
                    method: "POST",
                    body: JSON.stringify({ allowMissing: false }),
                  },
                  "Runde abgeschlossen.",
                ).catch(() => {})
              }
            >
              Runde abschließen
            </Button>
          )}
        </section>
        <aside>
          <section className="panel participants">
            <div className="title">
              <div>
                <h2>Teilnehmer</h2>
                <span className="title-note">
                  Teilnehmer {participantCount}
                </span>
              </div>
              <Users />
            </div>
            <form className="add" onSubmit={add}>
              <TextField.Root
                name="name"
                placeholder="Vorname oder Spitzname"
                required
              />
              <IconButton type="submit" aria-label="Teilnehmer hinzufügen">
                <Plus />
              </IconButton>
            </form>
            <div className="players">
              {rankedPlayers.map((p) => (
                <div key={p.id} className={!p.active ? "off" : ""}>
                  <i>{p.emoji}</i>
                  <span>{p.display_name}</span>
                  <Switch
                    checked={!!p.active}
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
                length: Math.max(0, visibleLobbySlots - rankedPlayers.length),
              }).map((_, i) => (
                <div key={`empty-${i}`} className="slot-empty">
                  <i>+</i>
                  <span>Leer</span>
                  <small>Wartet auf Teilnehmer</small>
                </div>
              ))}
            </div>
          </section>
          <section className="panel leaderboard-panel">
            <div className="title">
              <h2>Bestenliste</h2>
              <Trophy />
            </div>
            <Leaderboard players={data.leaderboard} />
          </section>
          <Button
            color="gray"
            variant="soft"
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
            <Archive /> Archivieren
          </Button>
        </aside>
      </div>
    </>
  );
}

function PublicEvent() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<EventData | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("");
  const detailRef = useRef<HTMLElement>(null);
  const load = () =>
    api<EventData>(`/public/events/${slug}`)
      .then(setData)
      .catch((x) => setError(x.message));
  useEffect(() => {
    void load();
  }, [slug]);
  useEffect(() => {
    if (!selected) return;
    detailRef.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [selected]);
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
      <div className="assignment">
        <div className="assignment-court">
          <span>Platz</span>
          <strong>{match.court_number}</strong>
        </div>
        <div className="assignment-player">
          <span>Du spielst</span>
          <h2>
            {p(selected).emoji} {p(selected).display_name}
          </h2>
        </div>
        <div className="assignment-info">
          <section>
            <span>Partner</span>
            <strong>
              {partner.emoji} {partner.display_name}
            </strong>
          </section>
          <section>
            <span>Gegner</span>
            <strong>
              {opps.map((x) => (
                <i key={x.id}>
                  {x.emoji} {x.display_name}
                </i>
              ))}
            </strong>
          </section>
        </div>
      </div>
    );
  }
  return (
    <Shell>
      <div className="public-screen">
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
          <Button className="public-refresh" variant="soft" onClick={load}>
            <ArrowClockwise /> Aktualisieren
          </Button>
        </div>
        {!currentRound && (
          <div className="public-lobby">
            <img src={sgaLogo} alt="SG Arheilgen Tennis" />
            <div>
              <strong>Lobby ge{"\u00f6"}ffnet</strong>
              <span>Die n{"\u00e4"}chsten Paarungen erscheinen hier.</span>
            </div>
          </div>
        )}
        <div className="public">
          <section className="panel detail" ref={detailRef} aria-live="polite">
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
                <Route path="events/:id" element={<EventAdmin />} />
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
