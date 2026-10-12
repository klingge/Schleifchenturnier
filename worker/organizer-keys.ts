import { Hono } from "hono";
import { z } from "zod";
import type { WorkerVariables } from "./auth";
import { base64Url } from "./crypto";
import { rows } from "./event-data";

export type OrganizerKeySummary = {
  id: string;
  label: string;
  version: number;
  revoked_at: string | null;
  event_id: string | null;
  event_name: string | null;
  used_at: string | null;
  created_at: string;
  updated_at: string;
};

const summaryQuery = `SELECT organizer_keys.id, organizer_keys.label,
  organizer_keys.version, organizer_keys.revoked_at, organizer_keys.event_id,
  events.name AS event_name, organizer_keys.used_at, organizer_keys.created_at,
  organizer_keys.updated_at
  FROM organizer_keys LEFT JOIN events ON events.id = organizer_keys.event_id`;

export async function keyDigest(key: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function summary(db: D1Database, id: string) {
  return db
    .prepare(`${summaryQuery} WHERE organizer_keys.id = ?`)
    .bind(id)
    .first<OrganizerKeySummary>();
}

export function createKeyRoutes() {
  const keys = new Hono<{ Bindings: Env; Variables: WorkerVariables }>();

  keys.get("/", async (c) => {
    const keys = await rows<OrganizerKeySummary>(
      c.env.DB.prepare(
        `${summaryQuery} ORDER BY organizer_keys.created_at DESC, organizer_keys.id`,
      ),
    );
    return c.json({ keys });
  });

  keys.post("/", async (c) => {
    const input = z
      .object({ label: z.string().trim().max(100).default("") })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json(
        { error: "Bitte eine Bezeichnung mit höchstens 100 Zeichen eingeben." },
        400,
      );
    const id = crypto.randomUUID();
    const key = base64Url(crypto.getRandomValues(new Uint8Array(24)));
    const timestamp = new Date().toISOString();
    await c.env.DB.prepare(
      "INSERT INTO organizer_keys (id, key_digest, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(id, await keyDigest(key), input.data.label, timestamp, timestamp)
      .run();
    return c.json({ key, organizerKey: await summary(c.env.DB, id) }, 201);
  });

  keys.post("/:id/rotate", async (c) => {
    const id = c.req.param("id");
    const current = await summary(c.env.DB, id);
    if (!current) return c.json({ error: "Schlüssel nicht gefunden." }, 404);
    if (current.used_at !== null && current.event_id === null)
      return c.json(
        {
          error:
            "Die zugehörige Veranstaltung wurde gelöscht. Erzeuge einen neuen Schlüssel.",
        },
        409,
      );
    const key = base64Url(crypto.getRandomValues(new Uint8Array(24)));
    const result = await c.env.DB.prepare(
      `UPDATE organizer_keys SET key_digest = ?, version = version + 1,
        revoked_at = NULL, updated_at = ?
       WHERE id = ? AND version = ? AND (used_at IS NULL OR event_id IS NOT NULL)`,
    )
      .bind(await keyDigest(key), new Date().toISOString(), id, current.version)
      .run();
    if (result.meta.changes !== 1)
      return c.json(
        { error: "Der Schlüssel wurde inzwischen geändert. Bitte neu laden." },
        409,
      );
    return c.json({ key, organizerKey: await summary(c.env.DB, id) });
  });

  keys.post("/:id/revoke", async (c) => {
    const timestamp = new Date().toISOString();
    const result = await c.env.DB.prepare(
      "UPDATE organizer_keys SET revoked_at = COALESCE(revoked_at, ?), updated_at = ? WHERE id = ? RETURNING id",
    )
      .bind(timestamp, timestamp, c.req.param("id"))
      .first<{ id: string }>();
    return result
      ? c.json({ ok: true })
      : c.json({ error: "Schlüssel nicht gefunden." }, 404);
  });

  return keys;
}
