import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { generateMatches, pairKey, type MatchHistory } from "./matchmaker";

type Bindings = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
};

type Variables = { csrf: string };
type DbRow = Record<string, unknown>;

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath(
  "/api",
);
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const encoder = new TextEncoder();

const eventInput = z.object({
  name: z.string().trim().min(1).max(100),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  durationMinutes: z.coerce.number().int().min(1).max(240),
  courtCount: z.coerce.number().int().min(1).max(13),
});
const playerInput = z.object({ name: z.string().trim().min(1).max(40) });
const generateInput = z.object({
  durationMinutes: z.coerce.number().int().min(1).max(240),
  courtCount: z.coerce.number().int().min(1).max(13),
});

function base64Url(bytes: ArrayBuffer | Uint8Array) {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of array) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1)
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

async function createSession(secret: string) {
  const payload = base64Url(
    encoder.encode(
      JSON.stringify({
        exp: Date.now() + 12 * 60 * 60 * 1000,
        csrf: crypto.randomUUID(),
      }),
    ),
  );
  return `${payload}.${await hmac(payload, secret)}`;
}

async function readSession(token: string | undefined, secret: string) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (
    !payload ||
    !signature ||
    !constantTimeEqual(signature, await hmac(payload, secret))
  )
    return null;
  try {
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const data = JSON.parse(atob(normalized)) as { exp: number; csrf: string };
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

const admin = new Hono<{ Bindings: Bindings; Variables: Variables }>();
admin.use("*", async (c, next) => {
  const session = await readSession(
    getCookie(c, "sga_session"),
    c.env.SESSION_SECRET,
  );
  if (!session) return c.json({ error: "Nicht angemeldet." }, 401);
  if (
    !["GET", "HEAD"].includes(c.req.method) &&
    c.req.header("x-csrf-token") !== session.csrf
  ) {
    return c.json(
      { error: "Die Sitzung konnte nicht bestätigt werden. Bitte neu laden." },
      403,
    );
  }
  c.set("csrf", session.csrf);
  await next();
});

app.post("/auth/login", async (c) => {
  const input = z
    .object({ password: z.string().min(1).max(200) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (
    !input.success ||
    !constantTimeEqual(input.data.password, c.env.ADMIN_PASSWORD)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return c.json({ error: "Das Passwort ist nicht korrekt." }, 401);
  }
  const token = await createSession(c.env.SESSION_SECRET);
  setCookie(c, "sga_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 43200,
  });
  const session = await readSession(token, c.env.SESSION_SECRET);
  return c.json({ authenticated: true, csrf: session!.csrf });
});

app.post("/auth/logout", async (c) => {
  deleteCookie(c, "sga_session", { path: "/" });
  return c.json({ ok: true });
});

app.get("/auth/session", async (c) => {
  const session = await readSession(
    getCookie(c, "sga_session"),
    c.env.SESSION_SECRET,
  );
  return c.json(
    session
      ? { authenticated: true, csrf: session.csrf }
      : { authenticated: false },
  );
});

async function rows<T extends DbRow>(statement: D1PreparedStatement) {
  const result = await statement.all<T>();
  return result.results;
}

async function loadEvent(db: D1Database, eventId: string, publicOnly = false) {
  const event = await db
    .prepare(
      `SELECT * FROM events WHERE id = ? ${publicOnly ? "AND status = 'active'" : ""}`,
    )
    .bind(eventId)
    .first<DbRow>();
  if (!event) return null;
  return assembleEvent(db, event);
}

async function loadPublicEvent(db: D1Database, slug: string) {
  const event = await db
    .prepare(
      "SELECT * FROM events WHERE public_slug = ? AND status IN ('lobby', 'active')",
    )
    .bind(slug)
    .first<DbRow>();
  return event ? assembleEvent(db, event) : null;
}

async function assembleEvent(db: D1Database, event: DbRow) {
  const eventId = String(event.id);
  const players = await rows(
    db
      .prepare("SELECT * FROM players WHERE event_id = ? ORDER BY created_at")
      .bind(eventId),
  );
  const rounds = await rows(
    db
      .prepare(
        "SELECT * FROM rounds WHERE event_id = ? AND state <> 'discarded' ORDER BY round_number",
      )
      .bind(eventId),
  );
  const roundIds = rounds.map((round) => String(round.id));
  let matches: DbRow[] = [];
  let participation: DbRow[] = [];
  if (roundIds.length) {
    const placeholders = roundIds.map(() => "?").join(",");
    matches = await rows(
      db
        .prepare(
          `SELECT * FROM matches WHERE round_id IN (${placeholders}) ORDER BY court_number`,
        )
        .bind(...roundIds),
    );
    participation = await rows(
      db
        .prepare(
          `SELECT * FROM round_participation WHERE round_id IN (${placeholders})`,
        )
        .bind(...roundIds),
    );
  }

  const stats = new Map(
    players.map((player) => [
      String(player.id),
      { wins: 0, gameDifference: 0, sitOuts: 0 },
    ]),
  );
  for (const item of participation) {
    if (item.status === "sitting_out")
      stats.get(String(item.player_id))!.sitOuts += 1;
  }
  for (const match of matches) {
    if (match.result_type !== "played") continue;
    const aGames = Number(match.team_a_games);
    const bGames = Number(match.team_b_games);
    const teamA = [
      String(match.team_a_player_1_id),
      String(match.team_a_player_2_id),
    ];
    const teamB = [
      String(match.team_b_player_1_id),
      String(match.team_b_player_2_id),
    ];
    for (const playerId of teamA)
      stats.get(playerId)!.gameDifference += aGames - bGames;
    for (const playerId of teamB)
      stats.get(playerId)!.gameDifference += bGames - aGames;
    for (const playerId of aGames > bGames ? teamA : teamB)
      stats.get(playerId)!.wins += 1;
  }
  const leaderboard: DbRow[] = players
    .map<DbRow>((player) => ({
      ...player,
      ...stats.get(String(player.id))!,
    }))
    .sort(
      (a, b) =>
        Number(b.wins) - Number(a.wins) ||
        Number(b.gameDifference) - Number(a.gameDifference) ||
        String(a.display_name).localeCompare(String(b.display_name), "de"),
    );
  let previous:
    | { wins: number; gameDifference: number; rank: number }
    | undefined;
  leaderboard.forEach((player, index) => {
    const rank =
      previous &&
      previous.wins === player.wins &&
      previous.gameDifference === player.gameDifference
        ? previous.rank
        : index + 1;
    Object.assign(player, { rank });
    previous = {
      wins: Number(player.wins),
      gameDifference: Number(player.gameDifference),
      rank,
    };
  });
  const hydratedRounds: DbRow[] = rounds.map((round) => ({
    ...round,
    matches: matches.filter((match) => match.round_id === round.id),
    sitting_out_player_ids: participation
      .filter(
        (item) => item.round_id === round.id && item.status === "sitting_out",
      )
      .map((item) => String(item.player_id)),
  }));
  return {
    event,
    players,
    leaderboard,
    rounds: hydratedRounds,
    currentRound: hydratedRounds.at(-1) ?? null,
  };
}

const emojis = [
  "🎾",
  "🦊",
  "🐯",
  "🐸",
  "🐼",
  "🐨",
  "🦁",
  "🐙",
  "🦋",
  "🐬",
  "🦄",
  "🐝",
  "🦩",
  "🐢",
  "🦜",
  "🐧",
  "🦖",
  "🐳",
  "🐿️",
  "🦔",
  "🐞",
  "🦦",
  "🦥",
  "🐊",
  "🦒",
  "🐘",
  "🦘",
  "🦚",
  "🐓",
  "🦉",
  "🐺",
  "🐗",
  "🐴",
  "🐮",
  "🐵",
  "🐶",
  "🐱",
  "🐰",
  "🐹",
  "🐻",
  "🐠",
  "🦀",
  "🐌",
  "🦎",
  "🐲",
  "🦕",
  "🦭",
  "🦬",
  "🦙",
  "🐐",
];

admin.get("/events", async (c) => {
  const events = await rows(
    c.env.DB.prepare(
      "SELECT * FROM events ORDER BY event_date DESC, created_at DESC",
    ),
  );
  return c.json({ events, csrf: c.get("csrf") });
});

admin.post("/events", async (c) => {
  const input = eventInput.safeParse(await c.req.json().catch(() => ({})));
  if (!input.success)
    return c.json({ error: "Bitte alle Veranstaltungsdaten prüfen." }, 400);
  const eventId = id();
  const timestamp = now();
  const slug = base64Url(crypto.getRandomValues(new Uint8Array(12)));
  await c.env.DB.prepare(
    "INSERT INTO events (id, public_slug, name, event_date, default_round_duration_seconds, default_court_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      eventId,
      slug,
      input.data.name,
      input.data.eventDate ?? timestamp.slice(0, 10),
      input.data.durationMinutes * 60,
      input.data.courtCount,
      timestamp,
      timestamp,
    )
    .run();
  return c.json(await loadEvent(c.env.DB, eventId), 201);
});

admin.get("/events/:id", async (c) => {
  const event = await loadEvent(c.env.DB, c.req.param("id"));
  return event
    ? c.json(event)
    : c.json({ error: "Veranstaltung nicht gefunden." }, 404);
});

admin.patch("/events/:id", async (c) => {
  const body = z
    .object({ status: z.enum(["active", "archived"]) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültiger Status." }, 400);
  await c.env.DB.prepare(
    "UPDATE events SET status = ?, archived_at = ?, updated_at = ? WHERE id = ?",
  )
    .bind(
      body.data.status,
      body.data.status === "archived" ? now() : null,
      now(),
      c.req.param("id"),
    )
    .run();
  return c.json({ ok: true });
});

admin.delete("/events/:id", async (c) => {
  const event = await c.env.DB.prepare("SELECT name FROM events WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ name: string }>();
  const body = z
    .object({ confirmation: z.string() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!event || !body.success || body.data.confirmation !== event.name)
    return c.json(
      { error: "Der Veranstaltungsname stimmt nicht überein." },
      400,
    );
  await c.env.DB.prepare("DELETE FROM events WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

admin.post("/events/:id/players", async (c) => {
  const input = playerInput.safeParse(await c.req.json().catch(() => ({})));
  if (!input.success)
    return c.json(
      { error: "Bitte einen Namen mit höchstens 40 Zeichen eingeben." },
      400,
    );
  const used = new Set(
    (
      await rows(
        c.env.DB.prepare("SELECT emoji FROM players WHERE event_id = ?").bind(
          c.req.param("id"),
        ),
      )
    ).map((row) => String(row.emoji)),
  );
  const emoji =
    emojis.find((candidate) => !used.has(candidate)) ?? `🎾${used.size + 1}`;
  const timestamp = now();
  await c.env.DB.prepare(
    "INSERT INTO players (id, event_id, display_name, emoji, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id(), c.req.param("id"), input.data.name, emoji, timestamp, timestamp)
    .run();
  return c.json(await loadEvent(c.env.DB, c.req.param("id")), 201);
});

admin.patch("/players/:id", async (c) => {
  const input = z
    .object({
      name: z.string().trim().min(1).max(40).optional(),
      active: z.boolean().optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!input.success)
    return c.json({ error: "Spielerdaten sind ungültig." }, 400);
  const player = await c.env.DB.prepare(
    "SELECT event_id FROM players WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ event_id: string }>();
  if (!player) return c.json({ error: "Spieler nicht gefunden." }, 404);
  await c.env.DB.prepare(
    "UPDATE players SET display_name = COALESCE(?, display_name), active = COALESCE(?, active), updated_at = ? WHERE id = ?",
  )
    .bind(
      input.data.name ?? null,
      input.data.active === undefined ? null : Number(input.data.active),
      now(),
      c.req.param("id"),
    )
    .run();
  return c.json(await loadEvent(c.env.DB, player.event_id));
});

async function buildHistory(data: Awaited<ReturnType<typeof loadEvent>>) {
  const history: MatchHistory = { partners: new Map(), opponents: new Map() };
  if (!data) return history;
  for (const round of data.rounds) {
    if (round.state !== "completed") continue;
    for (const match of round.matches as DbRow[]) {
      const teamA = [
        String(match.team_a_player_1_id),
        String(match.team_a_player_2_id),
      ];
      const teamB = [
        String(match.team_b_player_1_id),
        String(match.team_b_player_2_id),
      ];
      for (const team of [teamA, teamB])
        history.partners.set(
          pairKey(team[0], team[1]),
          (history.partners.get(pairKey(team[0], team[1])) ?? 0) + 1,
        );
      for (const a of teamA)
        for (const b of teamB)
          history.opponents.set(
            pairKey(a, b),
            (history.opponents.get(pairKey(a, b)) ?? 0) + 1,
          );
    }
  }
  return history;
}

admin.post("/events/:id/generate", async (c) => {
  const input = generateInput.safeParse(await c.req.json().catch(() => ({})));
  if (!input.success)
    return c.json({ error: "Rundendauer oder Platzanzahl ist ungültig." }, 400);
  const eventId = c.req.param("id");
  const data = await loadEvent(c.env.DB, eventId);
  if (!data) return c.json({ error: "Veranstaltung nicht gefunden." }, 404);
  const current = data.currentRound;
  if (current && !["completed", "published"].includes(String(current.state)))
    return c.json(
      { error: "Die laufende Runde muss zuerst abgeschlossen werden." },
      409,
    );
  const active = data.leaderboard.filter(
    (player) => Number(player.active) === 1,
  );
  if (active.length < 4)
    return c.json(
      {
        error: "Für eine Runde werden mindestens vier aktive Spieler benötigt.",
      },
      400,
    );
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const result = generateMatches(
    active.map((player) => ({
      id: String(player.id),
      rank: Number(player.rank),
      sitOuts: Number(player.sitOuts),
    })),
    input.data.courtCount,
    await buildHistory(data),
    seed,
  );
  const timestamp = now();
  const roundId = id();
  const roundNumber =
    current?.state === "published"
      ? Number(current.round_number)
      : Number(current?.round_number ?? 0) + 1;
  const statements: D1PreparedStatement[] = [];
  if (current?.state === "published")
    statements.push(
      c.env.DB.prepare(
        "UPDATE rounds SET state = 'discarded', discarded_at = ? WHERE id = ?",
      ).bind(timestamp, current.id),
    );
  if (current?.state === "completed")
    statements.push(
      c.env.DB.prepare(
        "UPDATE matches SET result_locked_at = ? WHERE round_id = ?",
      ).bind(timestamp, current.id),
    );
  statements.push(
    c.env.DB.prepare(
      "INSERT INTO rounds (id, event_id, round_number, state, court_count, duration_seconds, published_at, matchmaking_seed) VALUES (?, ?, ?, 'published', ?, ?, ?, ?)",
    ).bind(
      roundId,
      eventId,
      roundNumber,
      input.data.courtCount,
      input.data.durationMinutes * 60,
      timestamp,
      seed,
    ),
  );
  for (const match of result.matches)
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO matches (id, round_id, court_number, team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(id(), roundId, match.court, ...match.teamA, ...match.teamB),
    );
  for (const player of active)
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO round_participation (round_id, player_id, status) VALUES (?, ?, ?)",
      ).bind(
        roundId,
        player.id,
        result.sittingOut.includes(String(player.id))
          ? "sitting_out"
          : "playing",
      ),
    );
  statements.push(
    c.env.DB.prepare(
      "UPDATE events SET status = 'active', updated_at = ? WHERE id = ?",
    ).bind(timestamp, eventId),
  );
  await c.env.DB.batch(statements);
  return c.json(
    {
      ...(await loadEvent(c.env.DB, eventId)),
      matchmaking: {
        repeatedPartners: result.repeatedPartners,
        repeatedOpponents: result.repeatedOpponents,
      },
    },
    201,
  );
});

admin.post("/rounds/:id/action", async (c) => {
  const input = z
    .object({ action: z.enum(["start", "pause", "resume", "end", "skip"]) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!input.success) return c.json({ error: "Ungültige Rundenaktion." }, 400);
  const round = await c.env.DB.prepare("SELECT * FROM rounds WHERE id = ?")
    .bind(c.req.param("id"))
    .first<DbRow>();
  if (!round) return c.json({ error: "Runde nicht gefunden." }, 404);
  const timestamp = now();
  if (input.data.action === "start" && round.state === "published") {
    const expires = new Date(
      Date.now() + Number(round.duration_seconds) * 1000,
    ).toISOString();
    await c.env.DB.prepare(
      "UPDATE rounds SET state = 'running', started_at = ?, expires_at = ? WHERE id = ?",
    )
      .bind(timestamp, expires, round.id)
      .run();
  } else if (input.data.action === "pause" && round.state === "running") {
    await c.env.DB.prepare(
      "UPDATE rounds SET state = 'paused', paused_at = ? WHERE id = ?",
    )
      .bind(timestamp, round.id)
      .run();
  } else if (input.data.action === "resume" && round.state === "paused") {
    const pauseMs = Date.now() - new Date(String(round.paused_at)).getTime();
    const expires = new Date(
      new Date(String(round.expires_at)).getTime() + pauseMs,
    ).toISOString();
    await c.env.DB.prepare(
      "UPDATE rounds SET state = 'running', paused_at = NULL, accumulated_paused_seconds = accumulated_paused_seconds + ?, expires_at = ? WHERE id = ?",
    )
      .bind(Math.round(pauseMs / 1000), expires, round.id)
      .run();
  } else if (
    ["end", "skip"].includes(input.data.action) &&
    ["running", "paused"].includes(String(round.state))
  ) {
    await c.env.DB.prepare(
      "UPDATE rounds SET state = 'results', expires_at = ? WHERE id = ?",
    )
      .bind(timestamp, round.id)
      .run();
  } else
    return c.json(
      { error: "Diese Aktion ist im aktuellen Rundenstatus nicht möglich." },
      409,
    );
  return c.json({ ok: true });
});

admin.put("/matches/:id/result", async (c) => {
  const input = z
    .object({
      teamAGames: z.coerce.number().int().min(0),
      teamBGames: z.coerce.number().int().min(0),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!input.success || input.data.teamAGames === input.data.teamBGames)
    return c.json(
      { error: "Ein gespieltes Match darf nicht unentschieden enden." },
      400,
    );
  const match = await c.env.DB.prepare(
    "SELECT rounds.state FROM matches JOIN rounds ON rounds.id = matches.round_id WHERE matches.id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ state: string }>();
  if (!match) return c.json({ error: "Match nicht gefunden." }, 404);
  if (!["results", "completed"].includes(match.state))
    return c.json(
      {
        error:
          "Dieses Ergebnis kann im aktuellen Rundenstatus nicht ge\u00e4ndert werden.",
      },
      409,
    );
  await c.env.DB.prepare(
    "UPDATE matches SET team_a_games = ?, team_b_games = ?, result_type = 'played' WHERE id = ?",
  )
    .bind(input.data.teamAGames, input.data.teamBGames, c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

admin.post("/rounds/:id/complete", async (c) => {
  const input = z
    .object({ allowMissing: z.boolean().default(false) })
    .safeParse(await c.req.json().catch(() => ({})));
  const pending = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM matches WHERE round_id = ? AND result_type = 'pending'",
  )
    .bind(c.req.param("id"))
    .first<{ count: number }>();
  if (
    Number(pending?.count) > 0 &&
    (!input.success || !input.data.allowMissing)
  )
    return c.json(
      { error: "missing_results", count: Number(pending?.count) },
      409,
    );
  const timestamp = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE matches SET team_a_games = 0, team_b_games = 0, result_type = 'missing' WHERE round_id = ? AND result_type = 'pending'",
    ).bind(c.req.param("id")),
    c.env.DB.prepare(
      "UPDATE rounds SET state = 'completed', completed_at = ? WHERE id = ? AND state = 'results'",
    ).bind(timestamp, c.req.param("id")),
  ]);
  return c.json({ ok: true });
});

app.route("/admin", admin);

app.get("/public/events/:slug", async (c) => {
  const data = await loadPublicEvent(c.env.DB, c.req.param("slug"));
  return data
    ? c.json(data)
    : c.json({ error: "Diese Veranstaltung ist nicht verfügbar." }, 404);
});

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "Ein unerwarteter Fehler ist aufgetreten." }, 500);
});

export default app;
