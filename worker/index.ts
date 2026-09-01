import { Hono } from "hono";
import { z } from "zod";
import { createAuthRoutes, requireAdmin, type WorkerVariables } from "./auth";
import { base64Url } from "./crypto";
import { generateMatches } from "./matchmaker";
import {
  buildHistory,
  configurationIsLocked,
  loadEvent,
  loadPublicEvent,
  roundLockedBody,
  rows,
  type DbRow,
} from "./event-data";
import { nextPlayerEmoji } from "./player-emojis";

const app = new Hono<{ Bindings: Env; Variables: WorkerVariables }>().basePath(
  "/api",
);
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

const eventInput = z.object({
  name: z.string().trim().min(1).max(100),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  durationMinutes: z.coerce.number().int().min(1).max(240),
});
const playerInput = z.object({ name: z.string().trim().min(1).max(40) });
const courtInput = z.object({ name: z.string().trim().min(1).max(40) });
const durationMinutes = z.coerce.number().int().min(1).max(240);
const generateInput = z.object({
  durationMinutes: durationMinutes.optional(),
});
const eventUpdateInput = z
  .object({
    status: z.enum(["active", "archived"]).optional(),
    durationMinutes: durationMinutes.optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined || value.durationMinutes !== undefined,
  );

export function resolveRoundDurationSeconds(
  requestedMinutes: number | undefined,
  defaultDurationSeconds: number,
) {
  return requestedMinutes === undefined
    ? defaultDurationSeconds
    : requestedMinutes * 60;
}

app.route("/auth", createAuthRoutes());

const admin = new Hono<{ Bindings: Env; Variables: WorkerVariables }>();
admin.use("*", requireAdmin);

admin.get("/events", async (c) => {
  const events = await rows(
    c.env.DB.prepare(
      `SELECT events.*, COUNT(courts.id) AS court_count
       FROM events
       LEFT JOIN courts ON courts.event_id = events.id
       GROUP BY events.id
       ORDER BY events.event_date DESC, events.created_at DESC`,
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
      1,
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
  const body = eventUpdateInput.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success)
    return c.json({ error: "Ungültige Veranstaltungseinstellungen." }, 400);
  const status = body.data.status ?? null;
  const archivedAt = status === "archived" ? now() : null;
  const durationSeconds =
    body.data.durationMinutes === undefined
      ? null
      : body.data.durationMinutes * 60;
  await c.env.DB.prepare(
    `UPDATE events
     SET status = COALESCE(?, status),
         archived_at = CASE WHEN ? IS NULL THEN archived_at ELSE ? END,
         default_round_duration_seconds = COALESCE(?, default_round_duration_seconds),
         updated_at = ?
     WHERE id = ?`,
  )
    .bind(status, status, archivedAt, durationSeconds, now(), c.req.param("id"))
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
  if (await configurationIsLocked(c.env.DB, c.req.param("id")))
    return c.json(roundLockedBody, 409);
  const used = new Set(
    (
      await rows(
        c.env.DB.prepare("SELECT emoji FROM players WHERE event_id = ?").bind(
          c.req.param("id"),
        ),
      )
    ).map((row) => String(row.emoji)),
  );
  const emoji = nextPlayerEmoji(used);
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
  if (await configurationIsLocked(c.env.DB, player.event_id))
    return c.json(roundLockedBody, 409);
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

admin.post("/events/:id/courts", async (c) => {
  const input = courtInput.safeParse(await c.req.json().catch(() => ({})));
  if (!input.success)
    return c.json(
      { error: "Bitte einen Platznamen mit höchstens 40 Zeichen eingeben." },
      400,
    );
  const eventId = c.req.param("id");
  const event = await c.env.DB.prepare("SELECT id FROM events WHERE id = ?")
    .bind(eventId)
    .first();
  if (!event) return c.json({ error: "Veranstaltung nicht gefunden." }, 404);
  if (await configurationIsLocked(c.env.DB, eventId))
    return c.json(roundLockedBody, 409);
  const existing = await rows(
    c.env.DB.prepare(
      "SELECT id, name, position FROM courts WHERE event_id = ? ORDER BY position",
    ).bind(eventId),
  );
  if (existing.length >= 13)
    return c.json(
      { error: "Pro Veranstaltung sind höchstens 13 Plätze möglich." },
      400,
    );
  const duplicate = await c.env.DB.prepare(
    "SELECT id FROM courts WHERE event_id = ? AND name = ? COLLATE NOCASE",
  )
    .bind(eventId, input.data.name)
    .first();
  if (duplicate)
    return c.json({ error: "Dieser Platzname ist bereits vergeben." }, 409);
  const timestamp = now();
  await c.env.DB.prepare(
    "INSERT INTO courts (id, event_id, name, position, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
  )
    .bind(
      id(),
      eventId,
      input.data.name,
      existing.length + 1,
      timestamp,
      timestamp,
    )
    .run();
  return c.json(await loadEvent(c.env.DB, eventId), 201);
});

admin.patch("/courts/:id", async (c) => {
  const input = z
    .object({
      name: z.string().trim().min(1).max(40).optional(),
      active: z.boolean().optional(),
    })
    .refine((value) => value.name !== undefined || value.active !== undefined)
    .safeParse(await c.req.json().catch(() => ({})));
  if (!input.success)
    return c.json({ error: "Platzdaten sind ungültig." }, 400);
  const court = await c.env.DB.prepare(
    "SELECT id, event_id FROM courts WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ id: string; event_id: string }>();
  if (!court) return c.json({ error: "Platz nicht gefunden." }, 404);
  if (await configurationIsLocked(c.env.DB, court.event_id))
    return c.json(roundLockedBody, 409);
  if (input.data.name !== undefined) {
    const duplicate = await c.env.DB.prepare(
      "SELECT id FROM courts WHERE event_id = ? AND name = ? COLLATE NOCASE AND id <> ?",
    )
      .bind(court.event_id, input.data.name, court.id)
      .first();
    if (duplicate)
      return c.json({ error: "Dieser Platzname ist bereits vergeben." }, 409);
  }
  await c.env.DB.prepare(
    "UPDATE courts SET name = COALESCE(?, name), active = COALESCE(?, active), updated_at = ? WHERE id = ?",
  )
    .bind(
      input.data.name ?? null,
      input.data.active === undefined ? null : Number(input.data.active),
      now(),
      court.id,
    )
    .run();
  return c.json(await loadEvent(c.env.DB, court.event_id));
});

admin.delete("/courts/:id", async (c) => {
  return c.json(
    {
      error:
        "Plätze können nicht gelöscht werden. Deaktiviere den Platz stattdessen.",
      code: "court_deletion_disabled",
    },
    405,
  );
});

admin.post("/events/:id/generate", async (c) => {
  const input = generateInput.safeParse(await c.req.json().catch(() => ({})));
  if (!input.success)
    return c.json({ error: "Die Rundendauer ist ungültig." }, 400);
  const eventId = c.req.param("id");
  const data = await loadEvent(c.env.DB, eventId);
  if (!data) return c.json({ error: "Veranstaltung nicht gefunden." }, 404);
  const roundDurationSeconds = resolveRoundDurationSeconds(
    input.data.durationMinutes,
    Number(data.event.default_round_duration_seconds),
  );
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
  const activeCourts = data.courts.filter(
    (court) => Number(court.active) === 1,
  );
  if (activeCourts.length === 0)
    return c.json(
      { error: "Für eine Auslosung muss mindestens ein Platz aktiv sein." },
      400,
    );
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const result = generateMatches(
    active.map((player) => ({
      id: String(player.id),
      rank: Number(player.rank),
      sitOuts: Number(player.sitOuts),
    })),
    activeCourts.length,
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
      activeCourts.length,
      roundDurationSeconds,
      timestamp,
      seed,
    ),
  );
  for (const match of result.matches) {
    const court = activeCourts[match.court - 1];
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO matches (id, round_id, court_number, court_id, court_name_snapshot, team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        id(),
        roundId,
        match.court,
        court.id,
        court.name,
        ...match.teamA,
        ...match.teamB,
      ),
    );
  }
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
  if (!["running", "paused", "results", "completed"].includes(match.state))
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
  if (!input.success)
    return c.json({ error: "Ung\u00fcltige Abschlussanfrage." }, 400);

  const roundId = c.req.param("id");
  const round = await c.env.DB.prepare("SELECT state FROM rounds WHERE id = ?")
    .bind(roundId)
    .first<{ state: string }>();
  if (!round) return c.json({ error: "Runde nicht gefunden." }, 404);
  if (!["running", "paused", "results"].includes(round.state))
    return c.json(
      {
        error:
          "Diese Runde kann im aktuellen Status nicht abgeschlossen werden.",
      },
      409,
    );

  const pending = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM matches WHERE round_id = ? AND result_type = 'pending'",
  )
    .bind(roundId)
    .first<{ count: number }>();
  if (Number(pending?.count) > 0)
    return c.json(
      { error: "missing_results", count: Number(pending?.count) },
      409,
    );
  const timestamp = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE matches SET team_a_games = 0, team_b_games = 0, result_type = 'missing' WHERE round_id = ? AND result_type = 'pending'",
    ).bind(roundId),
    c.env.DB.prepare(
      "UPDATE rounds SET state = 'completed', completed_at = ? WHERE id = ? AND state IN ('running', 'paused', 'results')",
    ).bind(timestamp, roundId),
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
  console.error(
    JSON.stringify({
      message: "Unhandled request error",
      error: error.message,
      method: c.req.method,
      path: c.req.path,
    }),
  );
  return c.json({ error: "Ein unerwarteter Fehler ist aufgetreten." }, 500);
});

export default app;
