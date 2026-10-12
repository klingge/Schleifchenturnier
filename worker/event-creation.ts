import type { Principal } from "./auth";
import { base64Url } from "./crypto";

type NewEvent = {
  name: string;
  eventDate?: string;
  durationMinutes: number;
  plannedRoundCount: number | null;
};

export async function createEvent(
  db: D1Database,
  principal: Principal,
  input: NewEvent,
) {
  const eventId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const slug = base64Url(crypto.getRandomValues(new Uint8Array(12)));
  const values = [
    eventId,
    slug,
    input.name,
    input.eventDate ?? timestamp.slice(0, 10),
    input.durationMinutes * 60,
    1,
    timestamp,
    timestamp,
    input.plannedRoundCount,
  ];
  const insert = `INSERT INTO events (id, public_slug, name, event_date,
    default_round_duration_seconds, default_court_count, created_at, updated_at,
    planned_round_count)`;
  if (principal.role === "operator") {
    await db
      .prepare(`${insert} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(...values)
      .run();
    return eventId;
  }

  // Both writes run in one transaction. A competing creation or a revoked/rotated
  // key makes both statements affect zero rows, so no unassigned event is left.
  const result = await db.batch([
    db
      .prepare(
        `${insert}
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? FROM organizer_keys
      WHERE id = ? AND version = ? AND revoked_at IS NULL
        AND event_id IS NULL AND used_at IS NULL`,
      )
      .bind(...values, principal.keyId, principal.keyVersion),
    db
      .prepare(
        `UPDATE organizer_keys SET event_id = ?, used_at = ?, updated_at = ?
      WHERE id = ? AND version = ? AND revoked_at IS NULL
        AND event_id IS NULL AND used_at IS NULL
        AND EXISTS (SELECT 1 FROM events WHERE id = ?)`,
      )
      .bind(
        eventId,
        timestamp,
        timestamp,
        principal.keyId,
        principal.keyVersion,
        eventId,
      ),
  ]);
  return result[0].meta.changes === 1 && result[1].meta.changes === 1
    ? eventId
    : null;
}
