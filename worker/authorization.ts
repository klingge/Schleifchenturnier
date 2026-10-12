import type { MiddlewareHandler } from "hono";
import type { WorkerVariables } from "./auth";

type Resource = "event" | "player" | "court" | "round" | "match";

// New administrative endpoints stay operator-only unless explicitly granted here.
const organizerRoutes: {
  method: string;
  path: RegExp;
  resource: Resource;
}[] = [
  { method: "GET", path: /^\/events\/([^/]+)$/, resource: "event" },
  { method: "PATCH", path: /^\/events\/([^/]+)$/, resource: "event" },
  {
    method: "POST",
    path: /^\/events\/([^/]+)\/(players|courts|generate|finish|resume|rounds\/manual)$/,
    resource: "event",
  },
  { method: "PATCH", path: /^\/players\/([^/]+)$/, resource: "player" },
  { method: "PATCH", path: /^\/courts\/([^/]+)$/, resource: "court" },
  { method: "DELETE", path: /^\/courts\/([^/]+)$/, resource: "court" },
  {
    method: "POST",
    path: /^\/rounds\/([^/]+)\/(action|complete)$/,
    resource: "round",
  },
  { method: "PUT", path: /^\/matches\/([^/]+)\/result$/, resource: "match" },
];

const ownerQueries: Record<Resource, string> = {
  event: "SELECT id AS event_id FROM events WHERE id = ?",
  player: "SELECT event_id FROM players WHERE id = ?",
  court: "SELECT event_id FROM courts WHERE id = ?",
  round: "SELECT event_id FROM rounds WHERE id = ?",
  match:
    "SELECT rounds.event_id FROM matches JOIN rounds ON rounds.id = matches.round_id WHERE matches.id = ?",
};

export const requireAdministrationAccess: MiddlewareHandler<{
  Bindings: Env;
  Variables: WorkerVariables;
}> = async (c, next) => {
  const principal = c.get("principal");
  if (principal.role === "operator") return next();

  const path = c.req.path.slice("/api/admin".length);
  if (c.req.method === "GET" && path === "/events") return next();
  if (c.req.method === "POST" && path === "/events") return next();
  const route = organizerRoutes.find(
    (route) => route.method === c.req.method && route.path.test(path),
  );
  if (!route)
    return c.json(
      { error: "Diese Aktion ist dem Betreiber vorbehalten." },
      403,
    );

  let resourceId: string;
  try {
    resourceId = decodeURIComponent(route.path.exec(path)![1]);
  } catch {
    return c.json({ error: "Veranstaltung nicht gefunden." }, 404);
  }
  const owner = await c.env.DB.prepare(ownerQueries[route.resource])
    .bind(resourceId)
    .first<{ event_id: string }>();
  if (!owner || owner.event_id !== principal.eventId)
    return c.json({ error: "Veranstaltung nicht gefunden." }, 404);

  if (c.req.method === "PATCH" && route.resource === "event") {
    const body: unknown = await c.req.json().catch(() => null);
    if (body && typeof body === "object" && "status" in body)
      return c.json(
        { error: "Diese Aktion ist dem Betreiber vorbehalten." },
        403,
      );
  }
  await next();
};
