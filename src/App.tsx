import { useEffect, useMemo, useState, type FormEvent } from "react";
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
  SignOut,
  Stop,
  TennisBall,
  Timer,
  Trophy,
  Users,
} from "@phosphor-icons/react";
import QRCode from "qrcode";

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
        <a href={logout ? "/admin" : "/"}>
          <i>
            <TennisBall weight="fill" />
          </i>
          SGA Sommerfest
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
          <Badge color="grass">Turnierleitung</Badge>
          <h1>Alles auf Platz.</h1>
          <p>
            Spieler eintragen, faire Doppel auslosen und Ergebnisse direkt
            festhalten.
          </p>
          <div className="court">
            <TennisBall weight="fill" />
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
                Datum
                <TextField.Root
                  name="eventDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
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
        <Loading />
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
              <time>
                {new Date(x.event_date + "T12:00").toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "short",
                })}
              </time>
              <span>
                <strong>{x.name}</strong>
                <small>
                  {x.default_court_count} Plätze,{" "}
                  {x.default_round_duration_seconds / 60} Minuten
                </small>
              </span>
              <Badge color={x.status === "archived" ? "gray" : "grass"}>
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
          color: { dark: "#17351f", light: "#ffffff" },
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
  save: (a: number, b: number) => void;
}) {
  const [a, setA] = useState(m.team_a_games ?? 0),
    [b, setB] = useState(m.team_b_games ?? 0);
  const n = (id: string) => (
    <span>
      <i>{players.get(id)?.emoji}</i>
      {players.get(id)?.display_name}
    </span>
  );
  return (
    <article className="match">
      <header>
        <b>Platz {m.court_number}</b>
        {m.result_type === "played" && <Badge color="grass">Gespeichert</Badge>}
      </header>
      <div>
        {n(m.team_a_player_1_id)}
        {n(m.team_a_player_2_id)}
      </div>
      <small>gegen</small>
      <div>
        {n(m.team_b_player_1_id)}
        {n(m.team_b_player_2_id)}
      </div>
      {result && (
        <footer>
          <TextField.Root
            type="number"
            min="0"
            value={a}
            onChange={(e) => setA(+e.target.value)}
          />
          <b>:</b>
          <TextField.Root
            type="number"
            min="0"
            value={b}
            onChange={(e) => setB(+e.target.value)}
          />
          <IconButton
            aria-label="Ergebnis speichern"
            disabled={a === b}
            onClick={() => save(a, b)}
          >
            <Check />
          </IconButton>
        </footer>
      )}
    </article>
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
      <Badge color={round.state === "results" ? "orange" : "grass"}>
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
          color="red"
          variant="soft"
          aria-label="Runde beenden"
          onClick={() =>
            mutate(`/admin/rounds/${round.id}/action`, {
              method: "POST",
              body: JSON.stringify({ action: "end" }),
            })
          }
        >
          <Stop />
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
    pm = new Map(data.players.map((p) => [p.id, p]));
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
      "Spieler hinzugefügt.",
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
          <p>
            {new Date(data.event.event_date + "T12:00").toLocaleDateString(
              "de-DE",
              { dateStyle: "long" },
            )}
          </p>
        </div>
        <QR url={`${location.origin}/event/${data.event.public_slug}`} />
      </div>
      {error && <p className="notice error">{error}</p>}
      {note && (
        <p className="notice success">
          <Check /> {note}
        </p>
      )}
      <div className="admin">
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
          {(!round ||
            round.state === "completed" ||
            round.state === "published") && (
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
                        body: JSON.stringify({ teamAGames: a, teamBGames: b }),
                      },
                      "Ergebnis gespeichert.",
                    )
                  }
                />
              ))}
            </div>
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
          <section className="panel">
            <div className="title">
              <h2>Spielerlobby</h2>
              <Users />
            </div>
            <form className="add" onSubmit={add}>
              <TextField.Root
                name="name"
                placeholder="Vorname oder Spitzname"
                required
              />
              <IconButton type="submit" aria-label="Spieler hinzufügen">
                <Plus />
              </IconButton>
            </form>
            <div className="players">
              {data.players.map((p) => (
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
            </div>
          </section>
          <section className="panel">
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
  const load = () =>
    api<EventData>(`/public/events/${slug}`)
      .then(setData)
      .catch((x) => setError(x.message));
  useEffect(() => {
    void load();
  }, [slug]);
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
  const p = (id: string) => data.players.find((x) => x.id === id)!;
  let detail = (
    <Empty
      icon={<TennisBall />}
      title="Spieler auswählen"
      text="Tippe in der Bestenliste auf einen Namen."
    />
  );
  if (selected && !match)
    detail = (
      <Empty
        icon={<Timer />}
        title="Diese Runde aussetzen"
        text="Der Spieler ist in dieser Runde nicht auf einem Platz."
      />
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
        <p>Platz {match.court_number}</p>
        <h2>
          {p(selected).emoji} {p(selected).display_name}
        </h2>
        <span>
          Partner
          <strong>
            {partner.emoji} {partner.display_name}
          </strong>
        </span>
        <span>
          Gegner
          <strong>
            {opps.map((x) => (
              <i key={x.id}>
                {x.emoji} {x.display_name}
              </i>
            ))}
          </strong>
        </span>
      </div>
    );
  }
  return (
    <Shell>
      <div className="heading">
        <div>
          <p className="kicker">
            {data.currentRound
              ? `Runde ${data.currentRound.round_number}`
              : "Lobby"}
          </p>
          <h1>{data.event.name}</h1>
          <p>Bestenliste und aktuelle Platzbelegung</p>
        </div>
        <Button variant="soft" onClick={load}>
          <ArrowClockwise /> Aktualisieren
        </Button>
      </div>
      <div className="public">
        <section className="panel">
          <div className="title">
            <h2>Bestenliste</h2>
            <Trophy />
          </div>
          <Leaderboard
            players={data.leaderboard}
            selected={selected}
            onSelect={setSelected}
          />
        </section>
        <section className="panel detail">{detail}</section>
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
