import { Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { base64Url, constantTimeEqual, hmac } from "./crypto";

export type WorkerVariables = { csrf: string };

const encoder = new TextEncoder();

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
    !(await constantTimeEqual(signature, await hmac(payload, secret)))
  ) {
    return null;
  }
  try {
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const data = JSON.parse(atob(normalized)) as { exp: number; csrf: string };
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export const requireAdmin: MiddlewareHandler<{
  Bindings: Env;
  Variables: WorkerVariables;
}> = async (c, next) => {
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
};

export function createAuthRoutes() {
  const auth = new Hono<{ Bindings: Env; Variables: WorkerVariables }>();

  auth.post("/login", async (c) => {
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

  auth.post("/logout", (c) => {
    deleteCookie(c, "sga_session", { path: "/" });
    return c.json({ ok: true });
  });

  auth.get("/session", async (c) => {
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

  return auth;
}
