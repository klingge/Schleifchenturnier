import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { base64Url, constantTimeEqual, hmac } from "./crypto";
import { keyDigest } from "./organizer-keys";

const sessionFields = {
  exp: z.number().int().positive(),
  csrf: z.string().uuid(),
};
const sessionSchema = z.discriminatedUnion("role", [
  z.object({ ...sessionFields, role: z.literal("operator") }).strict(),
  z
    .object({
      ...sessionFields,
      role: z.literal("organizer"),
      keyId: z.string().min(1),
      keyVersion: z.number().int().positive(),
    })
    .strict(),
]);
type Session = z.infer<typeof sessionSchema>;
type SessionIdentity =
  | { role: "operator" }
  | { role: "organizer"; keyId: string; keyVersion: number };
export type Principal =
  | { role: "operator" }
  | {
      role: "organizer";
      keyId: string;
      keyVersion: number;
      eventId: string | null;
    };
export type WorkerVariables = { csrf: string; principal: Principal };
type WorkerEnvironment = { Bindings: Env; Variables: WorkerVariables };

const encoder = new TextEncoder();

export async function createSession(secret: string, identity: SessionIdentity) {
  const payload = base64Url(
    encoder.encode(
      JSON.stringify({
        ...identity,
        exp: Date.now() + 12 * 60 * 60 * 1000,
        csrf: crypto.randomUUID(),
      }),
    ),
  );
  return `${payload}.${await hmac(payload, secret)}`;
}

async function signIn(
  c: Context<WorkerEnvironment>,
  identity: SessionIdentity,
  eventId: string | null,
) {
  const token = await createSession(c.env.SESSION_SECRET, identity);
  setCookie(c, "sga_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 43200,
  });
  const session = await readSession(token, c.env.SESSION_SECRET);
  return c.json({
    authenticated: true,
    role: identity.role,
    eventId,
    csrf: session!.csrf,
  });
}

const limitLogin: MiddlewareHandler<WorkerEnvironment> = async (c, next) => {
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin)
    return c.json(
      { error: "Die Anmeldung muss in dieser Anwendung erfolgen." },
      403,
    );
  if (
    c.req.header("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
    "application/json"
  )
    return c.json({ error: "Die Anmeldung erwartet JSON-Daten." }, 415);
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const result = await c.env.AUTH_RATE_LIMIT.limit({ key: `login:${ip}` });
  if (!result.success) {
    c.header("Retry-After", "60");
    return c.json(
      {
        error:
          "Zu viele Anmeldeversuche. Bitte warte eine Minute und versuche es erneut.",
      },
      429,
    );
  }
  await next();
};

async function readSession(token: string | undefined, secret: string) {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (
    !payload ||
    !signature ||
    extra !== undefined ||
    !(await constantTimeEqual(signature, await hmac(payload, secret)))
  ) {
    return null;
  }
  try {
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const data = sessionSchema.safeParse(JSON.parse(atob(normalized)));
    return data.success && data.data.exp > Date.now() ? data.data : null;
  } catch {
    return null;
  }
}

async function resolvePrincipal(
  db: D1Database,
  session: Session,
): Promise<Principal | null> {
  if (session.role === "operator") return { role: "operator" };
  const key = await db
    .prepare(
      "SELECT version, revoked_at, event_id, used_at FROM organizer_keys WHERE id = ?",
    )
    .bind(session.keyId)
    .first<{
      version: number;
      revoked_at: string | null;
      event_id: string | null;
      used_at: string | null;
    }>();
  if (
    !key ||
    key.revoked_at !== null ||
    key.version !== session.keyVersion ||
    (key.used_at !== null && key.event_id === null)
  )
    return null;
  return {
    role: "organizer",
    keyId: session.keyId,
    keyVersion: session.keyVersion,
    eventId: key.event_id,
  };
}

export const requireSession: MiddlewareHandler<{
  Bindings: Env;
  Variables: WorkerVariables;
}> = async (c, next) => {
  c.header("Cache-Control", "no-store");
  const session = await readSession(
    getCookie(c, "sga_session"),
    c.env.SESSION_SECRET,
  );
  const principal = session && (await resolvePrincipal(c.env.DB, session));
  if (!session || !principal) {
    deleteCookie(c, "sga_session", { path: "/" });
    return c.json({ error: "Nicht angemeldet." }, 401);
  }
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
  c.set("principal", principal);
  await next();
};

export function createAuthRoutes() {
  const auth = new Hono<{ Bindings: Env; Variables: WorkerVariables }>();
  auth.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  auth.post("/login", limitLogin, async (c) => {
    const input = z
      .object({ password: z.string().min(1).max(200) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (
      !input.success ||
      !(await constantTimeEqual(input.data.password, c.env.ADMIN_PASSWORD))
    ) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return c.json({ error: "Das Passwort ist nicht korrekt." }, 401);
    }
    return signIn(c, { role: "operator" }, null);
  });

  auth.post("/key-login", limitLogin, async (c) => {
    const input = z
      .object({
        key: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_-]{32}$/),
      })
      .safeParse(await c.req.json().catch(() => null));
    const key = input.success
      ? await c.env.DB.prepare(
          `SELECT id, version, event_id FROM organizer_keys WHERE key_digest = ?
        AND revoked_at IS NULL AND (used_at IS NULL OR event_id IS NOT NULL)`,
        )
          .bind(await keyDigest(input.data.key))
          .first<{ id: string; version: number; event_id: string | null }>()
      : null;
    if (!key) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return c.json(
        {
          error:
            "Der Turnierschlüssel ist ungültig oder nicht mehr freigegeben.",
        },
        401,
      );
    }
    return signIn(
      c,
      { role: "organizer", keyId: key.id, keyVersion: key.version },
      key.event_id,
    );
  });

  auth.post("/logout", (c) => {
    deleteCookie(c, "sga_session", { path: "/" });
    return c.json({ ok: true });
  });

  auth.get("/session", async (c) => {
    const session = await readSession(
      getCookie(c, "sga_session"),
      c.env.SESSION_SECRET,
    );
    const principal = session && (await resolvePrincipal(c.env.DB, session));
    if (!session || !principal) {
      deleteCookie(c, "sga_session", { path: "/" });
      return c.json({ authenticated: false });
    }
    return c.json({
      authenticated: true,
      role: principal.role,
      eventId: principal.role === "organizer" ? principal.eventId : null,
      csrf: session.csrf,
    });
  });

  return auth;
}
