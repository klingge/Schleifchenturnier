import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import type { OrganizerKeySummary } from "../organizer-keys";
import type { EventData } from "../../src/domain/tournament";
import { createEvent } from "../event-creation";

type KeyReply = { key: string; organizerKey: OrganizerKeySummary };
let operator: Record<string, string>;
let loginCount = 0;

function request(
  path: string,
  body?: object,
  method = "POST",
  headers = operator,
) {
  return SELF.fetch(`https://example.test/api${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function login(
  path: string,
  body: object,
  ip = `203.0.113.${++loginCount}`,
) {
  const response = await request(path, body, "POST", {
    "content-type": "application/json",
    "cf-connecting-ip": ip,
  });
  expect(response.status).toBe(200);
  const session = await response.json<{
    role: string;
    eventId: string | null;
    csrf: string;
  }>();
  return {
    response,
    session,
    headers: {
      "content-type": "application/json",
      "x-csrf-token": session.csrf,
      cookie: response.headers.get("set-cookie")!.split(";", 1)[0],
    },
  };
}

beforeAll(async () => {
  operator = (await login("/auth/login", { password: env.ADMIN_PASSWORD }))
    .headers;
});

async function newKey(label?: string) {
  const response = await request(
    "/admin/keys",
    label === undefined ? {} : { label },
  );
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json<KeyReply>();
}

async function assignedKey() {
  const key = await newKey("Mehrere Geräte");
  const device = await login("/auth/key-login", { key: key.key });
  const created = await request(
    "/admin/events",
    { name: "Schlüsselturnier", durationMinutes: 15 },
    "POST",
    device.headers,
  );
  expect(created.status).toBe(201);
  return { key, device, event: await created.json<EventData>() };
}

describe("Schlüsselausgabe und Anmeldung", () => {
  test("generates distinct 192-bit keys, stores only SHA-256 and lists no secrets", async () => {
    const first = await newKey("  TC Musterverein  ");
    const second = await newKey();
    expect(first.key).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(
      atob(first.key.replaceAll("-", "+").replaceAll("_", "/")),
    ).toHaveLength(24);
    expect(second.key).not.toBe(first.key);
    expect(first.organizerKey).toMatchObject({
      label: "TC Musterverein",
      version: 1,
      event_id: null,
      used_at: null,
      revoked_at: null,
    });
    expect(second.organizerKey.label).toBe("");
    const stored = await env.DB.prepare(
      "SELECT * FROM organizer_keys WHERE id = ?",
    )
      .bind(first.organizerKey.id)
      .first<{ key_digest: string }>();
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(first.key),
    );
    const expected = Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    expect(stored?.key_digest).toBe(expected);
    expect(JSON.stringify(stored)).not.toContain(first.key);
    const list = await request("/admin/keys", undefined, "GET");
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("no-store");
    const serialized = await list.text();
    expect(serialized).not.toContain(first.key);
    expect(serialized).not.toContain(second.key);
    expect(serialized).not.toContain("key_digest");
  });

  test("uses protected twelve-hour cookies and allows the same key on two devices", async () => {
    const key = await newKey();
    const first = await login("/auth/key-login", { key: ` ${key.key}\n` });
    const second = await login("/auth/key-login", { key: key.key });
    expect(first.session).toMatchObject({ role: "organizer", eventId: null });
    expect(second.session.csrf).not.toBe(first.session.csrf);
    const cookie = first.response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=43200/i);
    expect(cookie).not.toContain(key.key);
    expect(
      (await request("/auth/session", undefined, "GET", second.headers)).status,
    ).toBe(200);
  });

  test.each([
    { key: "" },
    { key: "wrong" },
    { key: "z".repeat(32) },
    { password: "not-a-key" },
    { key: 42 },
  ])(
    "rejects malformed and unknown keys without issuing a session: %j",
    async (body) => {
      const response = await request("/auth/key-login", body, "POST", {
        "content-type": "application/json",
        "cf-connecting-ip": `203.0.113.${++loginCount}`,
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(await response.json()).toEqual({
        error: "Der Turnierschlüssel ist ungültig oder nicht mehr freigegeben.",
      });
    },
  );

  test("does not allow a key to authenticate as the operator", async () => {
    const key = await newKey();
    const response = await request(
      "/auth/login",
      { password: key.key, role: "operator" },
      "POST",
      {
        "content-type": "application/json",
        "cf-connecting-ip": `203.0.113.${++loginCount}`,
      },
    );
    expect(response.status).toBe(401);
    const organizer = await login("/auth/key-login", {
      key: key.key,
      role: "operator",
    });
    expect(organizer.session.role).toBe("organizer");
  });

  test("requires operator authentication and CSRF for issuing and modifying keys", async () => {
    const key = await newKey();
    const organizer = await login("/auth/key-login", { key: key.key });
    expect(
      (
        await request("/admin/keys", {}, "POST", {
          "content-type": "application/json",
        })
      ).status,
    ).toBe(401);
    for (const [method, path] of [
      ["GET", "/admin/keys"],
      ["POST", "/admin/keys"],
      ["POST", `/admin/keys/${key.organizerKey.id}/rotate`],
      ["POST", `/admin/keys/${key.organizerKey.id}/revoke`],
    ])
      expect(
        (
          await request(
            path,
            method === "GET" ? undefined : {},
            method,
            organizer.headers,
          )
        ).status,
      ).toBe(403);
    for (const path of [
      "/admin/keys",
      `/admin/keys/${key.organizerKey.id}/rotate`,
      `/admin/keys/${key.organizerKey.id}/revoke`,
    ])
      expect(
        (
          await request(path, {}, "POST", {
            ...operator,
            "x-csrf-token": "wrong",
          })
        ).status,
      ).toBe(403);
  });

  test("rejects invalid labels and missing keys", async () => {
    expect(
      (await request("/admin/keys", { label: "x".repeat(101) })).status,
    ).toBe(400);
    expect((await request("/admin/keys", { label: 42 })).status).toBe(400);
    expect((await request("/admin/keys/missing/rotate", {})).status).toBe(404);
    expect((await request("/admin/keys/missing/revoke", {})).status).toBe(404);
  });

  test("rejects cross-site and non-JSON logins before replacing any session", async () => {
    for (const path of ["/auth/login", "/auth/key-login"]) {
      const crossSite = await request(path, {}, "POST", {
        "content-type": "application/json",
        origin: "https://foreign.test",
      });
      expect(crossSite.status).toBe(403);
      expect(crossSite.headers.get("set-cookie")).toBeNull();
      const form = await request(path, {}, "POST", {
        "content-type": "text/plain",
      });
      expect(form.status).toBe(415);
      expect(form.headers.get("set-cookie")).toBeNull();
    }
    const sameSite = await request(
      "/auth/login",
      { password: env.ADMIN_PASSWORD },
      "POST",
      {
        "content-type": "application/json; charset=utf-8",
        origin: "https://example.test",
        "cf-connecting-ip": `203.0.113.${++loginCount}`,
      },
    );
    expect(sameSite.status).toBe(200);
  });
});

describe("Genau ein Turnier pro Schlüssel", () => {
  test("creates the event and binding together and retains access on both devices", async () => {
    const key = await newKey();
    const first = await login("/auth/key-login", { key: key.key });
    const second = await login("/auth/key-login", { key: key.key });
    const response = await request(
      "/admin/events",
      {
        name: "Mein Turnier",
        eventDate: "2026-10-10",
        durationMinutes: 20,
        plannedRoundCount: 6,
      },
      "POST",
      first.headers,
    );
    expect(response.status).toBe(201);
    const data = await response.json<EventData>();
    expect(data.event).toMatchObject({
      name: "Mein Turnier",
      event_date: "2026-10-10",
      default_round_duration_seconds: 1200,
      planned_round_count: 6,
    });
    const stored = await env.DB.prepare(
      "SELECT event_id, used_at FROM organizer_keys WHERE id = ?",
    )
      .bind(key.organizerKey.id)
      .first();
    expect(stored).toMatchObject({
      event_id: data.event.id,
      used_at: expect.any(String),
    });
    for (const device of [first, second]) {
      expect(
        await (
          await request("/auth/session", undefined, "GET", device.headers)
        ).json(),
      ).toMatchObject({ role: "organizer", eventId: data.event.id });
      expect(
        (
          await request(
            `/admin/events/${data.event.id}`,
            undefined,
            "GET",
            device.headers,
          )
        ).status,
      ).toBe(200);
      const overview = await (
        await request("/admin/events", undefined, "GET", device.headers)
      ).json<{ events: { id: string }[] }>();
      expect(overview.events.map((event) => event.id)).toEqual([data.event.id]);
    }
    const relogin = await login("/auth/key-login", { key: key.key });
    expect(relogin.session.eventId).toBe(data.event.id);
    expect(
      (
        await request(
          "/admin/events",
          { name: "Noch eins", durationMinutes: 15 },
          "POST",
          relogin.headers,
        )
      ).status,
    ).toBe(409);
    const list = await (
      await request("/admin/keys", undefined, "GET")
    ).json<{ keys: OrganizerKeySummary[] }>();
    expect(
      list.keys.find((entry) => entry.id === key.organizerKey.id),
    ).toMatchObject({ event_id: data.event.id, event_name: "Mein Turnier" });
  });

  test("concurrent requests from two devices create exactly one event without an orphan", async () => {
    const key = await newKey();
    const first = await login("/auth/key-login", { key: key.key });
    const second = await login("/auth/key-login", { key: key.key });
    const marker = `Gleichzeitig-${crypto.randomUUID()}`;
    const responses = await Promise.all([
      request(
        "/admin/events",
        { name: marker, durationMinutes: 15 },
        "POST",
        first.headers,
      ),
      request(
        "/admin/events",
        { name: marker, durationMinutes: 15 },
        "POST",
        second.headers,
      ),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE name = ?",
      )
        .bind(marker)
        .first(),
    ).toEqual({ count: 1 });
    const winner = await responses
      .find((response) => response.status === 201)!
      .json<EventData>();
    expect(
      await env.DB.prepare("SELECT event_id FROM organizer_keys WHERE id = ?")
        .bind(key.organizerKey.id)
        .first(),
    ).toEqual({ event_id: winner.event.id });
  });

  test("invalid event input leaves the key available", async () => {
    const key = await newKey();
    const device = await login("/auth/key-login", { key: key.key });
    expect(
      (
        await request(
          "/admin/events",
          { name: "", durationMinutes: 0 },
          "POST",
          device.headers,
        )
      ).status,
    ).toBe(400);
    expect(
      await env.DB.prepare(
        "SELECT event_id, used_at FROM organizer_keys WHERE id = ?",
      )
        .bind(key.organizerKey.id)
        .first(),
    ).toEqual({ event_id: null, used_at: null });
    expect(
      (
        await request(
          "/admin/events",
          { name: "Korrigiert", durationMinutes: 15 },
          "POST",
          device.headers,
        )
      ).status,
    ).toBe(201);
  });

  test.each(["revoked", "rotated"])(
    "guards the transaction against a key that became %s after authentication",
    async (change) => {
      const key = await newKey();
      if (change === "revoked")
        await request(`/admin/keys/${key.organizerKey.id}/revoke`, {});
      else await request(`/admin/keys/${key.organizerKey.id}/rotate`, {});
      const name = `Veraltete-Sitzung-${crypto.randomUUID()}`;
      expect(
        await createEvent(
          env.DB,
          {
            role: "organizer",
            keyId: key.organizerKey.id,
            keyVersion: 1,
            eventId: null,
          },
          { name, durationMinutes: 15, plannedRoundCount: null },
        ),
      ).toBeNull();
      expect(
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM events WHERE name = ?",
        )
          .bind(name)
          .first(),
      ).toEqual({ count: 0 });
    },
  );

  test("rolls back the inserted event if storing the key assignment fails", async () => {
    const key = await newKey();
    const name = `Rollback-${crypto.randomUUID()}`;
    await env.DB.prepare(
      `CREATE TRIGGER fail_key_assignment BEFORE UPDATE OF event_id ON organizer_keys
      WHEN OLD.id = '${key.organizerKey.id}' BEGIN SELECT RAISE(ABORT, 'test_assignment_failure'); END;`,
    ).run();
    try {
      await expect(
        createEvent(
          env.DB,
          {
            role: "organizer",
            keyId: key.organizerKey.id,
            keyVersion: 1,
            eventId: null,
          },
          { name, durationMinutes: 15, plannedRoundCount: null },
        ),
      ).rejects.toThrow("test_assignment_failure");
      expect(
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM events WHERE name = ?",
        )
          .bind(name)
          .first(),
      ).toEqual({ count: 0 });
      expect(
        await env.DB.prepare(
          "SELECT event_id, used_at FROM organizer_keys WHERE id = ?",
        )
          .bind(key.organizerKey.id)
          .first(),
      ).toEqual({ event_id: null, used_at: null });
    } finally {
      await env.DB.prepare("DROP TRIGGER fail_key_assignment").run();
    }
  });
});

describe("Ersetzen und Sperren", () => {
  test("rotation retains the event, rejects the old key and invalidates both device sessions", async () => {
    const fixture = await assignedKey();
    const second = await login("/auth/key-login", { key: fixture.key.key });
    const response = await request(
      `/admin/keys/${fixture.key.organizerKey.id}/rotate`,
      {},
    );
    expect(response.status).toBe(200);
    const replacement = await response.json<KeyReply>();
    expect(replacement.key).not.toBe(fixture.key.key);
    expect(replacement.organizerKey).toMatchObject({
      version: 2,
      event_id: fixture.event.event.id,
    });
    for (const device of [fixture.device, second])
      expect(
        (await request("/admin/events", undefined, "GET", device.headers))
          .status,
      ).toBe(401);
    expect(
      (
        await request("/auth/key-login", { key: fixture.key.key }, "POST", {
          "content-type": "application/json",
          "cf-connecting-ip": `203.0.113.${++loginCount}`,
        })
      ).status,
    ).toBe(401);
    const current = await login("/auth/key-login", { key: replacement.key });
    expect(current.session.eventId).toBe(fixture.event.event.id);
    expect(
      (
        await request(
          "/admin/events",
          { name: "Zweites", durationMinutes: 15 },
          "POST",
          current.headers,
        )
      ).status,
    ).toBe(409);
  });

  test("revoke is repeatable, blocks re-login and existing sessions, and does not hide the public result", async () => {
    const fixture = await assignedKey();
    for (let i = 0; i < 2; i++)
      expect(
        (await request(`/admin/keys/${fixture.key.organizerKey.id}/revoke`, {}))
          .status,
      ).toBe(200);
    expect(
      (await request("/admin/events", undefined, "GET", fixture.device.headers))
        .status,
    ).toBe(401);
    expect(
      (
        await request("/auth/key-login", { key: fixture.key.key }, "POST", {
          "content-type": "application/json",
          "cf-connecting-ip": `203.0.113.${++loginCount}`,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          `/public/events/${fixture.event.event.public_slug}`,
          undefined,
          "GET",
          {},
        )
      ).status,
    ).toBe(200);
    const replacement = await (
      await request(`/admin/keys/${fixture.key.organizerKey.id}/rotate`, {})
    ).json<KeyReply>();
    expect(replacement.organizerKey.revoked_at).toBeNull();
    expect(
      (await login("/auth/key-login", { key: replacement.key })).session
        .eventId,
    ).toBe(fixture.event.event.id);
  });

  test("a deleted event never frees its consumed key, including on rotation", async () => {
    const fixture = await assignedKey();
    expect(
      (
        await request(
          `/admin/events/${fixture.event.event.id}`,
          { confirmation: fixture.event.event.name },
          "DELETE",
        )
      ).status,
    ).toBe(200);
    expect(
      (await request(`/admin/keys/${fixture.key.organizerKey.id}/rotate`, {}))
        .status,
    ).toBe(409);
    expect(
      (
        await request("/auth/key-login", { key: fixture.key.key }, "POST", {
          "content-type": "application/json",
          "cf-connecting-ip": `203.0.113.${++loginCount}`,
        })
      ).status,
    ).toBe(401);
    expect(
      (await request("/admin/events", undefined, "GET", fixture.device.headers))
        .status,
    ).toBe(401);
  });
});

test("both login methods share the 20-attempt IP limit while other devices and public views remain usable", async () => {
  const ip = "198.51.100.99";
  for (let i = 0; i < 20; i++)
    await login("/auth/login", { password: env.ADMIN_PASSWORD }, ip);
  const headers = {
    "content-type": "application/json",
    "cf-connecting-ip": ip,
  };
  for (const [path, body] of [
    ["/auth/key-login", { key: "z".repeat(32) }],
    ["/auth/login", { password: env.ADMIN_PASSWORD }],
  ] as const) {
    const response = await request(path, body, "POST", headers);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("set-cookie")).toBeNull();
  }
  expect(
    (
      await login(
        "/auth/login",
        { password: env.ADMIN_PASSWORD },
        "198.51.100.100",
      )
    ).session.role,
  ).toBe("operator");
  expect(
    (await request("/auth/session", undefined, "GET", operator)).status,
  ).toBe(200);
  expect(
    (await request("/public/events/missing", undefined, "GET", headers)).status,
  ).toBe(404);
});
