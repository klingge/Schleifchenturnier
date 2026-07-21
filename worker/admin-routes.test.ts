import { describe, expect, it } from "vitest";
import app, { resolveRoundDurationSeconds } from "./index";

type TestEnv = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
};

function mockDb(
  first: (sql: string) => unknown,
  run: (sql: string, bindings: unknown[]) => unknown = () => ({
    success: true,
  }),
  batch: (statements: unknown[]) => unknown = () => [],
) {
  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            first: async () => first(sql),
            run: async () => run(sql, bindings),
          };
        },
      };
    },
    batch: async (statements: unknown[]) => batch(statements),
  } as unknown as D1Database;
}

async function authenticated(env: TestEnv) {
  const response = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
    },
    env,
  );
  const body = await response.json<{ csrf: string }>();
  return {
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    csrf: body.csrf,
  };
}

async function adminRequest(
  env: TestEnv,
  path: string,
  method: string,
  body?: unknown,
) {
  const auth = await authenticated(env);
  return app.request(
    `/api${path}`,
    {
      method,
      headers: {
        cookie: auth.cookie,
        "content-type": "application/json",
        "x-csrf-token": auth.csrf,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
}

const baseEnv = {
  ADMIN_PASSWORD: "test-password",
  SESSION_SECRET: "test-session-secret-with-enough-entropy",
};

describe("admin configuration routes", () => {
  it("uses the persisted duration when generating without an override", () => {
    expect(resolveRoundDurationSeconds(undefined, 1200)).toBe(1200);
    expect(resolveRoundDurationSeconds(25, 1200)).toBe(1500);
  });

  it("persists the default round duration in seconds", async () => {
    let savedDuration: unknown;
    const env: TestEnv = {
      ...baseEnv,
      DB: mockDb(
        () => null,
        (sql, bindings) => {
          if (sql.includes("default_round_duration_seconds"))
            savedDuration = bindings[3];
          return { success: true };
        },
      ),
    };

    const response = await adminRequest(env, "/admin/events/event-1", "PATCH", {
      durationMinutes: 25,
    });

    expect(response.status).toBe(200);
    expect(savedDuration).toBe(1500);
  });

  it("rejects adding a player while a round is open", async () => {
    const env: TestEnv = {
      ...baseEnv,
      DB: mockDb((sql) =>
        sql.includes("SELECT state FROM rounds") ? { state: "running" } : null,
      ),
    };

    const response = await adminRequest(
      env,
      "/admin/events/event-1/players",
      "POST",
      { name: "Kim" },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "round_locked",
    });
  });

  it("rejects adding a court while a round is open", async () => {
    const env: TestEnv = {
      ...baseEnv,
      DB: mockDb((sql) => {
        if (sql.includes("SELECT id FROM events")) return { id: "event-1" };
        if (sql.includes("SELECT state FROM rounds"))
          return { state: "published" };
        return null;
      }),
    };

    const response = await adminRequest(
      env,
      "/admin/events/event-1/courts",
      "POST",
      { name: "Platz 4" },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "round_locked",
    });
  });

  it("rejects changing a court while a round is open", async () => {
    const env: TestEnv = {
      ...baseEnv,
      DB: mockDb((sql) => {
        if (sql.includes("SELECT id, event_id FROM courts"))
          return { id: "court-1", event_id: "event-1" };
        if (sql.includes("SELECT state FROM rounds"))
          return { state: "results" };
        return null;
      }),
    };

    const response = await adminRequest(env, "/admin/courts/court-1", "PATCH", {
      active: false,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "round_locked",
    });
  });

  it("disables court deletion", async () => {
    const env: TestEnv = {
      ...baseEnv,
      DB: mockDb(() => null),
    };

    const response = await adminRequest(env, "/admin/courts/court-1", "DELETE");

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toMatchObject({
      code: "court_deletion_disabled",
    });
  });

  it("allows correcting a completed match during a later round", async () => {
    let updated = false;
    const env: TestEnv = {
      ...baseEnv,
      DB: mockDb(
        (sql) =>
          sql.includes("SELECT rounds.state") ? { state: "completed" } : null,
        (sql) => {
          if (sql.includes("UPDATE matches SET")) updated = true;
          return { success: true };
        },
      ),
    };

    const response = await adminRequest(
      env,
      "/admin/matches/match-1/result",
      "PUT",
      { teamAGames: 6, teamBGames: 4 },
    );

    expect(response.status).toBe(200);
    expect(updated).toBe(true);
  });

  it.each(["running", "paused", "results"])(
    "allows saving results while a round is %s",
    async (state) => {
      let updated = false;
      const env: TestEnv = {
        ...baseEnv,
        DB: mockDb(
          (sql) => (sql.includes("SELECT rounds.state") ? { state } : null),
          (sql) => {
            if (sql.includes("UPDATE matches SET")) updated = true;
            return { success: true };
          },
        ),
      };

      const response = await adminRequest(
        env,
        "/admin/matches/match-1/result",
        "PUT",
        { teamAGames: 6, teamBGames: 4 },
      );

      expect(response.status).toBe(200);
      expect(updated).toBe(true);
    },
  );

  it("rejects saving results while a round is only published", async () => {
    let updated = false;
    const env: TestEnv = {
      ...baseEnv,
      DB: mockDb(
        (sql) =>
          sql.includes("SELECT rounds.state") ? { state: "published" } : null,
        (sql) => {
          if (sql.includes("UPDATE matches SET")) updated = true;
          return { success: true };
        },
      ),
    };

    const response = await adminRequest(
      env,
      "/admin/matches/match-1/result",
      "PUT",
      { teamAGames: 6, teamBGames: 4 },
    );

    expect(response.status).toBe(409);
    expect(updated).toBe(false);
  });

  it.each(["running", "paused", "results"])(
    "completes a fully scored round while it is %s",
    async (state) => {
      let batched = false;
      const env: TestEnv = {
        ...baseEnv,
        DB: mockDb(
          (sql) => {
            if (sql.includes("SELECT state FROM rounds")) return { state };
            if (sql.includes("SELECT COUNT(*)")) return { count: 0 };
            return null;
          },
          undefined,
          () => {
            batched = true;
            return [];
          },
        ),
      };

      const response = await adminRequest(
        env,
        "/admin/rounds/round-1/complete",
        "POST",
        { allowMissing: false },
      );

      expect(response.status).toBe(200);
      expect(batched).toBe(true);
    },
  );

  it("keeps a running round open while results are missing", async () => {
    let batched = false;
    const env: TestEnv = {
      ...baseEnv,
      DB: mockDb(
        (sql) => {
          if (sql.includes("SELECT state FROM rounds"))
            return { state: "running" };
          if (sql.includes("SELECT COUNT(*)")) return { count: 1 };
          return null;
        },
        undefined,
        () => {
          batched = true;
          return [];
        },
      ),
    };

    const response = await adminRequest(
      env,
      "/admin/rounds/round-1/complete",
      "POST",
      { allowMissing: true },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "missing_results",
      count: 1,
    });
    expect(batched).toBe(false);
  });

  it("rejects completing a round that is only published", async () => {
    let batched = false;
    const env: TestEnv = {
      ...baseEnv,
      DB: mockDb(
        (sql) =>
          sql.includes("SELECT state FROM rounds")
            ? { state: "published" }
            : null,
        undefined,
        () => {
          batched = true;
          return [];
        },
      ),
    };

    const response = await adminRequest(
      env,
      "/admin/rounds/round-1/complete",
      "POST",
      { allowMissing: false },
    );

    expect(response.status).toBe(409);
    expect(batched).toBe(false);
  });
});
