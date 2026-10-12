import { Hono } from "hono";
import { z } from "zod";
import { getEventPolicy, validRoundPlan } from "../src/domain/event-rules";
import {
  checkRevision,
  EventConflict,
  loadEventState,
  mutateEvent,
} from "./event-mutations";
import {
  getRoundPolicy,
  getRoundTransition,
  roundActions,
  type RoundState,
} from "../src/domain/round-rules";
import { createAuthRoutes, requireSession, type WorkerVariables } from "./auth";
import { requireAdministrationAccess } from "./authorization";
import { createEvent } from "./event-creation";
import { createKeyRoutes } from "./organizer-keys";
import { generateMatches } from "./matchmaker";
import {
  buildHistory,
  loadEvent,
  loadPublicEvent,
  roundLockedBody,
  rows,
  type DbRow,
} from "./event-data";
import { nextPlayerEmoji } from "./player-emojis";
import { publishRound } from "./round-publication";
import type { EventData } from "../src/domain/tournament";

const app = new Hono<{ Bindings: Env; Variables: WorkerVariables }>().basePath(
  "/api",
);
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const plannedRoundCount = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
  .nullable();
const expectedRevision = z.number().int().nonnegative().optional();

const eventInput = z.object({
  name: z.string().trim().min(1).max(100),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  durationMinutes: z.coerce.number().int().min(1).max(240),
  plannedRoundCount: plannedRoundCount.default(null),
});
const playerInput = z.object({ name: z.string().trim().min(1).max(40) });
const courtInput = z.object({ name: z.string().trim().min(1).max(40) });
const durationMinutes = z.coerce.number().int().min(1).max(240);
const generateInput = z.object({
  durationMinutes: durationMinutes.optional(),
  expectedRevision,
});
const manualRoundInput = z.object({
  expectedRevision: z.number().int().nonnegative(),
  matches: z
    .array(
      z.object({
        courtId: z.string().min(1),
        teamA: z.tuple([z.string().min(1), z.string().min(1)]),
        teamB: z.tuple([z.string().min(1), z.string().min(1)]),
      }),
    )
    .min(1)
    .max(13),
});
const eventUpdateInput = z
  .object({
    status: z.enum(["active", "archived"]).optional(),
    durationMinutes: durationMinutes.optional(),
    plannedRoundCount: plannedRoundCount.optional(),
    expectedRevision,
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.durationMinutes !== undefined ||
      value.plannedRoundCount !== undefined,
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
admin.use("*", requireSession, requireAdministrationAccess);
admin.route("/keys", createKeyRoutes());

admin.get("/events", async (c) => {
  const principal = c.get("principal");
  if (principal.role === "organizer" && principal.eventId === null)
    return c.json({ events: [], csrf: c.get("csrf") });
  const query = c.env.DB.prepare(
    `SELECT events.*, COUNT(courts.id) AS court_count
     FROM events
     LEFT JOIN courts ON courts.event_id = events.id
     ${principal.role === "organizer" ? "WHERE events.id = ?" : ""}
     GROUP BY events.id
     ORDER BY events.event_date DESC, events.created_at DESC`,
  );
  const events = await rows(
    principal.role === "organizer" ? query.bind(principal.eventId) : query,
  );
  return c.json({ events, csrf: c.get("csrf") });
});

admin.post("/events", async (c) => {
  const input = eventInput.safeParse(await c.req.json().catch(() => ({})));
  if (!input.success)
    return c.json({ error: "Bitte alle Veranstaltungsdaten prüfen." }, 400);
  const eventId = await createEvent(c.env.DB, c.get("principal"), input.data);
  if (!eventId)
    return c.json(
      {
        error:
          "Mit diesem Schlüssel kann kein weiteres Turnier erstellt werden. Bitte neu laden.",
        code: "key_creation_unavailable",
      },
      409,
    );
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
  const state = await loadEventState(c.env.DB, c.req.param("id"));
  if (!state) return c.json({ error: "Veranstaltung nicht gefunden." }, 404);
  checkRevision(state.event.revision, body.data.expectedRevision);
  if (
    (body.data.durationMinutes !== undefined &&
      (state.policy.finished || state.policy.archived)) ||
    (body.data.plannedRoundCount !== undefined && !state.policy.canPlan)
  )
    return c.json(
      {
        error:
          "Diese Einstellungen können im aktuellen Turnierstatus nicht geändert werden.",
      },
      409,
    );
  if (
    body.data.plannedRoundCount !== undefined &&
    !validRoundPlan(body.data.plannedRoundCount, state.round?.round_number ?? 0)
  )
    return c.json(
      {
        error:
          "Die Rundenanzahl muss über der bereits abgeschlossenen Rundenzahl liegen.",
      },
      400,
    );
  const status = body.data.status ?? null;
  const archivedAt = status === "archived" ? now() : null;
  const durationSeconds =
    body.data.durationMinutes === undefined
      ? null
      : body.data.durationMinutes * 60;
  await mutateEvent(c.env.DB, state.event.id, state.event.revision, [
    c.env.DB.prepare(
      `UPDATE events
     SET status = COALESCE(?, status),
         archived_at = CASE WHEN ? IS NULL THEN archived_at ELSE ? END,
         default_round_duration_seconds = COALESCE(?, default_round_duration_seconds),
         planned_round_count = CASE WHEN ? THEN ? ELSE planned_round_count END,
         updated_at = ?
     WHERE id = ?`,
    ).bind(
      status,
      status,
      archivedAt,
      durationSeconds,
      Number(body.data.plannedRoundCount !== undefined),
      body.data.plannedRoundCount ?? null,
      now(),
      c.req.param("id"),
    ),
  ]);
  return c.json({ ok: true });
});

admin.post("/events/:id/finish", async (c) => {
  const input = z
    .object({ expectedRevision })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!input.success)
    return c.json({ error: "Ungültige Abschlussanfrage." }, 400);
  const state = await loadEventState(c.env.DB, c.req.param("id"));
  if (!state) return c.json({ error: "Veranstaltung nicht gefunden." }, 404);
  checkRevision(state.event.revision, input.data.expectedRevision);
  if (!state.policy.canFinish)
    return c.json(
      {
        error:
          "Das Turnier kann erst nach einer vollständig abgeschlossenen Runde beendet werden.",
      },
      409,
    );
  const timestamp = now();
  await mutateEvent(c.env.DB, state.event.id, state.event.revision, [
    c.env.DB.prepare(
      "UPDATE events SET finished_at = ?, updated_at = ? WHERE id = ?",
    ).bind(timestamp, timestamp, state.event.id),
  ]);
  return c.json({ ok: true });
});

admin.post("/events/:id/resume", async (c) => {
  const input = z
    .object({ plannedRoundCount, expectedRevision })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!input.success)
    return c.json({ error: "Bitte die weitere Rundenplanung prüfen." }, 400);
  const state = await loadEventState(c.env.DB, c.req.param("id"));
  if (!state) return c.json({ error: "Veranstaltung nicht gefunden." }, 404);
  checkRevision(state.event.revision, input.data.expectedRevision);
  if (!state.policy.canResume)
    return c.json(
      { error: "Dieses Turnier kann derzeit nicht fortgesetzt werden." },
      409,
    );
  if (
    !validRoundPlan(
      input.data.plannedRoundCount,
      state.round?.round_number ?? 0,
    )
  )
    return c.json(
      {
        error: "Plane mindestens eine weitere Runde oder wähle Selbst beenden.",
      },
      400,
    );
  await mutateEvent(c.env.DB, state.event.id, state.event.revision, [
    c.env.DB.prepare(
      "UPDATE events SET finished_at = NULL, planned_round_count = ?, updated_at = ? WHERE id = ?",
    ).bind(input.data.plannedRoundCount, now(), state.event.id),
  ]);
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
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE organizer_keys SET revoked_at = ?, updated_at = ? WHERE event_id = ?",
    ).bind(now(), now(), c.req.param("id")),
    c.env.DB.prepare("DELETE FROM events WHERE id = ?").bind(c.req.param("id")),
  ]);
  return c.json({ ok: true });
});

admin.post("/events/:id/players", async (c) => {
  const input = playerInput.safeParse(await c.req.json().catch(() => ({})));
  if (!input.success)
    return c.json(
      { error: "Bitte einen Namen mit höchstens 40 Zeichen eingeben." },
      400,
    );
  const configuration = await loadEventState(c.env.DB, c.req.param("id"));
  if (!configuration)
    return c.json({ error: "Veranstaltung nicht gefunden." }, 404);
  if (configuration.policy.configurationLocked)
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
  await mutateEvent(
    c.env.DB,
    configuration.event.id,
    configuration.event.revision,
    [
      c.env.DB.prepare(
        "INSERT INTO players (id, event_id, display_name, emoji, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(
        id(),
        c.req.param("id"),
        input.data.name,
        emoji,
        timestamp,
        timestamp,
      ),
    ],
  );
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
  const configuration = await loadEventState(c.env.DB, player.event_id);
  if (!configuration)
    return c.json({ error: "Veranstaltung nicht gefunden." }, 404);
  if (configuration.policy.configurationLocked)
    return c.json(roundLockedBody, 409);
  await mutateEvent(
    c.env.DB,
    configuration.event.id,
    configuration.event.revision,
    [
      c.env.DB.prepare(
        "UPDATE players SET display_name = COALESCE(?, display_name), active = COALESCE(?, active), updated_at = ? WHERE id = ?",
      ).bind(
        input.data.name ?? null,
        input.data.active === undefined ? null : Number(input.data.active),
        now(),
        c.req.param("id"),
      ),
    ],
  );
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
  const configuration = await loadEventState(c.env.DB, eventId);
  if (!configuration)
    return c.json({ error: "Veranstaltung nicht gefunden." }, 404);
  if (configuration.policy.configurationLocked)
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
  await mutateEvent(
    c.env.DB,
    configuration.event.id,
    configuration.event.revision,
    [
      c.env.DB.prepare(
        "INSERT INTO courts (id, event_id, name, position, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
      ).bind(
        id(),
        eventId,
        input.data.name,
        existing.length + 1,
        timestamp,
        timestamp,
      ),
    ],
  );
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
  const configuration = await loadEventState(c.env.DB, court.event_id);
  if (!configuration)
    return c.json({ error: "Veranstaltung nicht gefunden." }, 404);
  if (configuration.policy.configurationLocked)
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
  await mutateEvent(
    c.env.DB,
    configuration.event.id,
    configuration.event.revision,
    [
      c.env.DB.prepare(
        "UPDATE courts SET name = COALESCE(?, name), active = COALESCE(?, active), updated_at = ? WHERE id = ?",
      ).bind(
        input.data.name ?? null,
        input.data.active === undefined ? null : Number(input.data.active),
        now(),
        court.id,
      ),
    ],
  );
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
  const tournament = data as unknown as EventData;
  const roundDurationSeconds = resolveRoundDurationSeconds(
    input.data.durationMinutes,
    tournament.event.default_round_duration_seconds,
  );
  const current = tournament.currentRound;
  checkRevision(tournament.event.revision, input.data.expectedRevision);
  const eventPolicy = getEventPolicy(tournament.event, current);
  if (!eventPolicy.canGenerate)
    return c.json(
      {
        error:
          "Im aktuellen Turnierstatus kann keine Runde veröffentlicht werden.",
      },
      409,
    );
  const active = tournament.leaderboard.filter((player) => player.active === 1);
  if (active.length < 4)
    return c.json(
      {
        error: "Für eine Runde werden mindestens vier aktive Spieler benötigt.",
      },
      400,
    );
  const activeCourts = tournament.courts.filter((court) => court.active === 1);
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
  await publishRound({
    db: c.env.DB,
    eventId,
    revision: tournament.event.revision,
    current,
    durationSeconds: roundDurationSeconds,
    assignments: result.matches.map((match) => ({
      court: activeCourts[match.court - 1],
      teamA: match.teamA,
      teamB: match.teamB,
    })),
    activePlayerIds: active.map((player) => player.id),
    matchmakingSeed: seed,
  });
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

admin.post("/events/:id/rounds/manual", async (c) => {
  const input = manualRoundInput.safeParse(
    await c.req.json().catch(() => ({})),
  );
  if (!input.success)
    return c.json(
      { error: "Bitte mindestens einen Platz vollständig besetzen." },
      400,
    );
  const eventId = c.req.param("id");
  const data = await loadEvent(c.env.DB, eventId);
  if (!data) return c.json({ error: "Veranstaltung nicht gefunden." }, 404);
  const tournament = data as unknown as EventData;
  checkRevision(tournament.event.revision, input.data.expectedRevision);
  const current = tournament.currentRound;
  if (!getEventPolicy(tournament.event, current).canGenerate)
    return c.json(
      {
        error:
          "Im aktuellen Turnierstatus kann keine Runde veröffentlicht werden.",
      },
      409,
    );

  const activePlayers = new Set(
    tournament.players
      .filter((player) => player.active)
      .map((player) => player.id),
  );
  const activeCourts = new Map(
    tournament.courts
      .filter((court) => court.active)
      .map((court) => [court.id, court]),
  );
  const chosenPlayers = new Set<string>();
  const chosenCourts = new Set<string>();
  for (const match of input.data.matches) {
    if (!activeCourts.has(match.courtId) || chosenCourts.has(match.courtId))
      return c.json(
        { error: "Ein Platz ist ungültig oder doppelt belegt." },
        400,
      );
    chosenCourts.add(match.courtId);
    for (const playerId of [...match.teamA, ...match.teamB]) {
      if (!activePlayers.has(playerId) || chosenPlayers.has(playerId))
        return c.json(
          { error: "Ein Teilnehmer ist ungültig oder mehrfach eingeteilt." },
          400,
        );
      chosenPlayers.add(playerId);
    }
  }
  await publishRound({
    db: c.env.DB,
    eventId,
    revision: tournament.event.revision,
    current,
    durationSeconds:
      current?.state === "published"
        ? current.duration_seconds
        : tournament.event.default_round_duration_seconds,
    assignments: input.data.matches.map((match) => ({
      court: activeCourts.get(match.courtId)!,
      teamA: match.teamA,
      teamB: match.teamB,
    })),
    activePlayerIds: [...activePlayers],
    matchmakingSeed: 0,
  });
  return c.json(await loadEvent(c.env.DB, eventId), 201);
});

admin.post("/rounds/:id/action", async (c) => {
  const input = z
    .object({ action: z.enum(roundActions), expectedRevision })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!input.success) return c.json({ error: "Ungültige Rundenaktion." }, 400);
  const owner = await c.env.DB.prepare(
    "SELECT event_id FROM rounds WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<{ event_id: string }>();
  if (!owner) return c.json({ error: "Runde nicht gefunden." }, 404);
  const state = await loadEventState(c.env.DB, owner.event_id);
  if (!state || state.policy.finished || state.policy.archived)
    return c.json({ error: "Das Turnier ist geschlossen." }, 409);
  checkRevision(state.event.revision, input.data.expectedRevision);
  const round = await c.env.DB.prepare("SELECT * FROM rounds WHERE id = ?")
    .bind(c.req.param("id"))
    .first<DbRow>();
  if (!round) return c.json({ error: "Runde nicht gefunden." }, 404);
  const nextState = getRoundTransition(
    String(round.state) as RoundState,
    input.data.action,
  );
  if (!nextState)
    return c.json(
      { error: "Diese Aktion ist im aktuellen Rundenstatus nicht möglich." },
      409,
    );
  const timestamp = now();
  let statement: D1PreparedStatement;
  if (input.data.action === "start") {
    const expires = new Date(
      Date.now() + Number(round.duration_seconds) * 1000,
    ).toISOString();
    statement = c.env.DB.prepare(
      "UPDATE rounds SET state = 'running', started_at = ?, expires_at = ? WHERE id = ?",
    ).bind(timestamp, expires, round.id);
  } else if (input.data.action === "pause") {
    statement = c.env.DB.prepare(
      "UPDATE rounds SET state = 'paused', paused_at = ? WHERE id = ?",
    ).bind(timestamp, round.id);
  } else if (input.data.action === "resume") {
    const pauseMs = Date.now() - new Date(String(round.paused_at)).getTime();
    const expires = new Date(
      new Date(String(round.expires_at)).getTime() + pauseMs,
    ).toISOString();
    statement = c.env.DB.prepare(
      "UPDATE rounds SET state = 'running', paused_at = NULL, accumulated_paused_seconds = accumulated_paused_seconds + ?, expires_at = ? WHERE id = ?",
    ).bind(Math.round(pauseMs / 1000), expires, round.id);
  } else {
    statement = c.env.DB.prepare(
      "UPDATE rounds SET state = 'results', expires_at = ? WHERE id = ?",
    ).bind(timestamp, round.id);
  }
  await mutateEvent(c.env.DB, owner.event_id, state.event.revision, [
    statement,
  ]);
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
    .first<{ state: RoundState }>();
  if (!match) return c.json({ error: "Match nicht gefunden." }, 404);
  if (getRoundPolicy(match.state).resultAccess === "closed")
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
    .object({ allowMissing: z.boolean().default(false), expectedRevision })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!input.success)
    return c.json({ error: "Ung\u00fcltige Abschlussanfrage." }, 400);

  const roundId = c.req.param("id");
  const owner = await c.env.DB.prepare(
    "SELECT event_id FROM rounds WHERE id = ?",
  )
    .bind(roundId)
    .first<{ event_id: string }>();
  if (!owner) return c.json({ error: "Runde nicht gefunden." }, 404);
  const state = await loadEventState(c.env.DB, owner.event_id);
  if (!state || state.policy.finished || state.policy.archived)
    return c.json({ error: "Das Turnier ist geschlossen." }, 409);
  checkRevision(state.event.revision, input.data.expectedRevision);
  const round = await c.env.DB.prepare("SELECT state FROM rounds WHERE id = ?")
    .bind(roundId)
    .first<{ state: RoundState }>();
  if (!round) return c.json({ error: "Runde nicht gefunden." }, 404);
  if (!getRoundPolicy(round.state).canComplete)
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
  await mutateEvent(c.env.DB, owner.event_id, state.event.revision, [
    c.env.DB.prepare(
      "UPDATE events SET finished_at = CASE WHEN ? THEN ? ELSE finished_at END, updated_at = ? WHERE id = ?",
    ).bind(
      Number(state.policy.finalRound),
      timestamp,
      timestamp,
      owner.event_id,
    ),
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
  if (error instanceof EventConflict)
    return c.json({ error: error.message, code: "event_conflict" }, 409);
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
