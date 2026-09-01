import { env, SELF } from "cloudflare:test";
import { describe, expect, test } from "vitest";

describe("Worker mit echtem D1-Schema", () => {
  test("erstellt eine signierte Sitzung und liefert sie wieder aus", async () => {
    const login = await SELF.fetch("https://example.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "integration-test-passwort" }),
    });

    expect(login.status).toBe(200);
    const body = await login.json<{ csrf: string }>();
    expect(body.csrf).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    expect(cookie).toMatch(/^sga_session=/);

    const session = await SELF.fetch("https://example.test/api/auth/session", {
      headers: { cookie: cookie ?? "" },
    });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toEqual({
      authenticated: true,
      csrf: body.csrf,
    });
  });

  test("liest eine Veranstaltung aus der migrierten D1-Datenbank", async () => {
    const timestamp = "2026-08-10T10:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO events
          (id, public_slug, name, event_date, default_round_duration_seconds,
           default_court_count, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "event-integration",
        "portfolio-demo",
        "Sommerfest-Demo",
        "2026-08-10",
        900,
        1,
        "lobby",
        timestamp,
        timestamp,
      ),
      env.DB.prepare(
        `INSERT INTO courts
          (id, event_id, name, position, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "court-integration",
        "event-integration",
        "Center Court",
        1,
        1,
        timestamp,
        timestamp,
      ),
    ]);

    const response = await SELF.fetch(
      "https://example.test/api/public/events/portfolio-demo",
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ event: { id: string; name: string } }>();
    expect(body.event).toMatchObject({
      id: "event-integration",
      name: "Sommerfest-Demo",
    });
  });
});
