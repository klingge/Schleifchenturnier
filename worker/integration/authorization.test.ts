import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";
import { base64Url, hmac } from "../crypto";
import type { EventData } from "../../src/domain/tournament";

const csrf = "f60bda28-25f4-44ab-836b-bb4fd34a3b36";
const timestamp = "2026-10-08T12:00:00.000Z";
let organizer: Record<string, string>;
let operator: Record<string, string>;
let loginCounter = 0;

async function signedHeaders(identity: object) {
  const payload = base64Url(
    new TextEncoder().encode(
      JSON.stringify({ exp: Date.now() + 3600000, csrf, ...identity }),
    ),
  );
  return {
    cookie: `sga_session=${payload}.${await hmac(payload, env.SESSION_SECRET)}`,
    "content-type": "application/json",
    "x-csrf-token": csrf,
  };
}

function request(
  path: string,
  method = "GET",
  body?: object,
  headers = organizer,
) {
  return SELF.fetch(`https://example.test/api${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function eventData(id: string) {
  const response = await request(
    `/admin/events/${id}`,
    "GET",
    undefined,
    operator,
  );
  expect(response.status).toBe(200);
  return response.json<EventData>();
}

beforeEach(async () => {
  const login = await request(
    "/auth/login",
    "POST",
    { password: env.ADMIN_PASSWORD },
    {
      "content-type": "application/json",
      "cf-connecting-ip": `192.0.2.${++loginCounter}`,
    },
  );
  const loginBody = await login.json<{ csrf: string; role: string }>();
  expect(loginBody.role).toBe("operator");
  operator = {
    cookie: login.headers.get("set-cookie")!.split(";", 1)[0],
    "content-type": "application/json",
    "x-csrf-token": loginBody.csrf,
  };

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      "DELETE FROM organizer_keys WHERE id IN ('key-a', 'unused-key')",
    ),
    env.DB.prepare("DELETE FROM events WHERE id IN ('event-a', 'event-b')"),
  ];
  for (const name of ["a", "b"]) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO events (id, public_slug, name, event_date,
          default_round_duration_seconds, default_court_count, status, created_at, updated_at)
         VALUES (?, ?, ?, '2026-10-08', 900, 1, 'active', ?, ?)`,
      ).bind(
        `event-${name}`,
        `public-${name}`,
        `Turnier ${name}`,
        timestamp,
        timestamp,
      ),
      env.DB.prepare(
        `INSERT INTO courts (id, event_id, name, position, active, created_at, updated_at)
         VALUES (?, ?, 'Center Court', 1, 1, ?, ?)`,
      ).bind(`court-${name}`, `event-${name}`, timestamp, timestamp),
    );
    for (let i = 1; i <= 4; i++) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO players (id, event_id, display_name, emoji, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(
          `player-${name}-${i}`,
          `event-${name}`,
          `Person ${i}`,
          `${i}`,
          timestamp,
          timestamp,
        ),
      );
    }
    statements.push(
      env.DB.prepare(
        `INSERT INTO rounds (id, event_id, round_number, state, court_count,
          duration_seconds, published_at, matchmaking_seed)
         VALUES (?, ?, 1, 'completed', 1, 900, ?, 0)`,
      ).bind(`round-${name}`, `event-${name}`, timestamp),
      env.DB.prepare(
        `INSERT INTO matches (id, round_id, court_number, team_a_player_1_id,
          team_a_player_2_id, team_b_player_1_id, team_b_player_2_id,
          team_a_games, team_b_games, result_type)
         VALUES (?, ?, 1, ?, ?, ?, ?, 6, 4, 'played')`,
      ).bind(
        `match-${name}`,
        `round-${name}`,
        `player-${name}-1`,
        `player-${name}-2`,
        `player-${name}-3`,
        `player-${name}-4`,
      ),
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO organizer_keys
        (id, key_digest, event_id, used_at, created_at, updated_at)
       VALUES ('key-a', ?, 'event-a', ?, ?, ?)`,
    ).bind("a".repeat(64), timestamp, timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO organizer_keys (id, key_digest, created_at, updated_at)
       VALUES ('unused-key', ?, ?, ?)`,
    ).bind("b".repeat(64), timestamp, timestamp),
  );
  await env.DB.batch(statements);
  organizer = await signedHeaders({
    role: "organizer",
    keyId: "key-a",
    keyVersion: 1,
  });
});

describe("Rollen und aktuelle Schlüsselrechte", () => {
  test("keeps operator access to all events and filters the organizer overview", async () => {
    const all = await (
      await request("/admin/events", "GET", undefined, operator)
    ).json<{ events: { id: string }[] }>();
    expect(all.events.map((event) => event.id).sort()).toEqual([
      "event-a",
      "event-b",
    ]);
    const own = await request("/admin/events");
    expect(own.headers.get("cache-control")).toBe("no-store");
    expect(
      (await own.json<{ events: { id: string }[] }>()).events.map(
        (event) => event.id,
      ),
    ).toEqual(["event-a"]);
    expect((await request("/admin/events/event-a")).status).toBe(200);
  });

  test("returns the role and current event assignment without key secrets", async () => {
    const response = await request("/auth/session");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      authenticated: true,
      role: "organizer",
      eventId: "event-a",
      csrf,
    });
  });

  test("an unused key sees no events until it creates its one assigned event", async () => {
    const headers = await signedHeaders({
      role: "organizer",
      keyId: "unused-key",
      keyVersion: 1,
    });
    expect(
      await (await request("/admin/events", "GET", undefined, headers)).json(),
    ).toEqual({ events: [], csrf });
    expect(
      (await request("/admin/events/event-a", "GET", undefined, headers))
        .status,
    ).toBe(404);
    expect(
      (
        await request(
          "/admin/events",
          "POST",
          { name: "Neu", durationMinutes: 15 },
          headers,
        )
      ).status,
    ).toBe(201);
  });

  test.each([
    { role: "invalid" },
    {},
    { role: "operator", csrf: "" },
    { role: "operator", exp: 1 },
    { role: "operator", exp: "9999999999999" },
    { role: "organizer" },
    { role: "organizer", keyId: "key-a", keyVersion: 0 },
    { role: "operator", keyId: "key-a", keyVersion: 1 },
  ])("rejects a signed legacy or malformed session: %j", async (identity) => {
    const headers = await signedHeaders(identity);
    expect(
      (await request("/admin/events", "GET", undefined, headers)).status,
    ).toBe(401);
    expect(
      await (await request("/auth/session", "GET", undefined, headers)).json(),
    ).toEqual({ authenticated: false });
  });

  test.each(["revoked", "rotated", "missing", "deleted-event"])(
    "invalidates an existing organizer session when the key is %s",
    async (change) => {
      if (change === "revoked")
        await env.DB.prepare(
          "UPDATE organizer_keys SET revoked_at = ? WHERE id = 'key-a'",
        )
          .bind(timestamp)
          .run();
      if (change === "rotated")
        await env.DB.prepare(
          "UPDATE organizer_keys SET version = 2 WHERE id = 'key-a'",
        ).run();
      if (change === "missing")
        await env.DB.prepare(
          "DELETE FROM organizer_keys WHERE id = 'key-a'",
        ).run();
      if (change === "deleted-event")
        await env.DB.prepare("DELETE FROM events WHERE id = 'event-a'").run();
      expect((await request("/admin/events/event-a")).status).toBe(401);
      expect(await (await request("/auth/session")).json()).toEqual({
        authenticated: false,
      });
    },
  );

  test("requires CSRF even for an authorized organizer action", async () => {
    const headers = { ...organizer, "x-csrf-token": "wrong" };
    expect(
      (
        await request(
          "/admin/players/player-a-1",
          "PATCH",
          { name: "Neu" },
          headers,
        )
      ).status,
    ).toBe(403);
    expect((await eventData("event-a")).players[0].display_name).toBe(
      "Person 1",
    );
  });

  test("the current database assignment wins over the original session", async () => {
    await env.DB.prepare(
      "UPDATE organizer_keys SET event_id = 'event-b' WHERE id = 'key-a'",
    ).run();
    expect((await request("/admin/events/event-a")).status).toBe(404);
    expect((await request("/admin/events/event-b")).status).toBe(200);
    expect(await (await request("/auth/session")).json()).toMatchObject({
      eventId: "event-b",
    });
  });
});

describe("Keine fremden Turnierressourcen", () => {
  test.each([
    ["GET", "/events/event-b", undefined],
    ["PATCH", "/events/event-b", { durationMinutes: 20 }],
    ["POST", "/events/event-b/players", { name: "Fremd" }],
    ["POST", "/events/event-b/courts", { name: "Fremd" }],
    ["POST", "/events/event-b/generate", {}],
    ["POST", "/events/event-b/rounds/manual", {}],
    ["POST", "/events/event-b/finish", {}],
    ["POST", "/events/event-b/resume", { plannedRoundCount: null }],
    ["PATCH", "/players/player-b-1", { name: "Fremd" }],
    ["PATCH", "/courts/court-b", { name: "Fremd" }],
    ["DELETE", "/courts/court-b", undefined],
    ["POST", "/rounds/round-b/action", { action: "start" }],
    ["POST", "/rounds/round-b/complete", {}],
    ["PUT", "/matches/match-b/result", { teamAGames: 8, teamBGames: 2 }],
  ] as const)(
    "rejects %s %s before reading or changing tournament data",
    async (method, path, body) => {
      const before = await eventData("event-b");
      const response = await request(`/admin${path}`, method, body);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "Veranstaltung nicht gefunden.",
      });
      expect(await eventData("event-b")).toEqual(before);
    },
  );

  test("does not distinguish missing resources from foreign ones", async () => {
    const foreign = await request("/admin/players/player-b-1", "PATCH", {
      name: "X",
    });
    const missing = await request("/admin/players/missing", "PATCH", {
      name: "X",
    });
    expect(missing.status).toBe(foreign.status);
    expect(await missing.json()).toEqual(await foreign.json());
  });

  test("authorizes an encoded own ID exactly as the route handler does", async () => {
    expect((await request("/admin/events/event%2Da")).status).toBe(200);
    expect((await request("/admin/events/event%2Db")).status).toBe(404);
  });
});

describe("Organisatoraktionen und Betreibergrenzen", () => {
  test("allows managing own players, courts, settings and result corrections", async () => {
    expect(
      (await request("/admin/players/player-a-1", "PATCH", { name: "Anna" }))
        .status,
    ).toBe(200);
    expect(
      (await request("/admin/courts/court-a", "PATCH", { name: "Platz 1" }))
        .status,
    ).toBe(200);
    expect(
      (await request("/admin/events/event-a", "PATCH", { durationMinutes: 20 }))
        .status,
    ).toBe(200);
    expect(
      (await request("/admin/events/event-a/players", "POST", { name: "Ben" }))
        .status,
    ).toBe(201);
    expect(
      (
        await request("/admin/events/event-a/courts", "POST", {
          name: "Platz 2",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request("/admin/matches/match-a/result", "PUT", {
          teamAGames: 7,
          teamBGames: 5,
        })
      ).status,
    ).toBe(200);
    const data = await eventData("event-a");
    expect(
      data.players.find((player) => player.id === "player-a-1")?.display_name,
    ).toBe("Anna");
    expect(data.event.default_round_duration_seconds).toBe(1200);
    expect(data.currentRound?.matches[0].team_a_games).toBe(7);
  });

  test("allows drawing, running, completing, finishing and resuming the own tournament", async () => {
    const draw = await request("/admin/events/event-a/generate", "POST", {});
    expect(draw.status).toBe(201);
    const round = (await draw.json<EventData>()).currentRound!;
    for (const action of ["start", "pause", "resume", "end"]) {
      expect(
        (await request(`/admin/rounds/${round.id}/action`, "POST", { action }))
          .status,
      ).toBe(200);
    }
    for (const match of round.matches)
      expect(
        (
          await request(`/admin/matches/${match.id}/result`, "PUT", {
            teamAGames: 6,
            teamBGames: 2,
          })
        ).status,
      ).toBe(200);
    expect(
      (await request(`/admin/rounds/${round.id}/complete`, "POST", {})).status,
    ).toBe(200);
    expect(
      (await request("/admin/events/event-a/finish", "POST", {})).status,
    ).toBe(200);
    expect(
      (
        await request("/admin/events/event-a/resume", "POST", {
          plannedRoundCount: null,
        })
      ).status,
    ).toBe(200);
  });

  test("allows manual assignments but rejects foreign players within an own round", async () => {
    const matches = [
      {
        courtId: "court-a",
        teamA: ["player-a-1", "player-a-2"],
        teamB: ["player-a-3", "player-b-4"],
      },
    ];
    const before = await eventData("event-a");
    expect(
      (
        await request("/admin/events/event-a/rounds/manual", "POST", {
          expectedRevision: before.event.revision,
          matches,
        })
      ).status,
    ).toBe(400);
    expect(await eventData("event-a")).toEqual(before);
    matches[0].teamB[1] = "player-a-4";
    expect(
      (
        await request("/admin/events/event-a/rounds/manual", "POST", {
          expectedRevision: before.event.revision,
          matches,
        })
      ).status,
    ).toBe(201);
  });

  test.each([
    ["PATCH", "/events/event-a", { status: "archived" }],
    ["PATCH", "/events/event-a", { status: "active" }],
    ["DELETE", "/events/event-a", { confirmation: "Turnier a" }],
    ["GET", "/keys", undefined],
    ["POST", "/keys", {}],
    ["POST", "/keys/key-a/rotate", {}],
    ["POST", "/keys/key-a/revoke", {}],
    ["GET", "/future-admin-feature", undefined],
  ] as const)("keeps %s %s operator-only", async (method, path, body) => {
    const before = await eventData("event-a");
    expect((await request(`/admin${path}`, method, body)).status).toBe(403);
    expect(await eventData("event-a")).toEqual(before);
  });

  test("operator deletion revokes the key without freeing it for another event", async () => {
    expect(
      (
        await request(
          "/admin/events/event-a",
          "DELETE",
          { confirmation: "Turnier a" },
          operator,
        )
      ).status,
    ).toBe(200);
    expect(
      await env.DB.prepare(
        "SELECT event_id, used_at, revoked_at FROM organizer_keys WHERE id = 'key-a'",
      ).first(),
    ).toMatchObject({
      event_id: null,
      used_at: timestamp,
      revoked_at: expect.any(String),
    });
    expect((await request("/admin/events")).status).toBe(401);
  });

  test("public responses stay anonymous and contain no key or session data", async () => {
    const response = await request(
      "/public/events/public-b",
      "GET",
      undefined,
      {},
    );
    expect(response.status).toBe(200);
    const body = await response.json<Record<string, unknown>>();
    expect(Object.keys(body).sort()).toEqual([
      "courts",
      "currentRound",
      "event",
      "leaderboard",
      "players",
      "rounds",
    ]);
    expect(JSON.stringify(body)).not.toMatch(
      /key_digest|keyVersion|keyId|organizer_keys|csrf/,
    );
  });
});

test("the key migration preserves existing event data and grants no organizer access", async () => {
  const index = env.TEST_MIGRATIONS.findIndex(
    (migration) => migration.name === "0004_organizer_keys.sql",
  );
  expect(index).toBeGreaterThan(0);
  await applyD1Migrations(
    env.MIGRATION_DB,
    env.TEST_MIGRATIONS.slice(0, index),
  );
  await env.MIGRATION_DB.prepare(
    `INSERT INTO events (id, public_slug, name, event_date, default_round_duration_seconds,
      default_court_count, status, created_at, updated_at)
     VALUES ('legacy-key-test', 'legacy-key-test', 'Bestand', '2026-10-08', 1200, 1, 'active', ?, ?)`,
  )
    .bind(timestamp, timestamp)
    .run();
  const before = await env.MIGRATION_DB.prepare(
    "SELECT * FROM events WHERE id = 'legacy-key-test'",
  ).first();
  await applyD1Migrations(env.MIGRATION_DB, env.TEST_MIGRATIONS.slice(index));
  expect(
    await env.MIGRATION_DB.prepare(
      "SELECT * FROM events WHERE id = 'legacy-key-test'",
    ).first(),
  ).toEqual(before);
  expect(
    await env.MIGRATION_DB.prepare(
      "SELECT COUNT(*) AS count FROM organizer_keys",
    ).first(),
  ).toEqual({ count: 0 });
});
