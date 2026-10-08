import {
  getEventPolicy,
  type EventLifecycle,
  type RoundSummary,
} from "../src/domain/event-rules";

type EventState = EventLifecycle & { id: string; revision: number };

export class EventConflict extends Error {
  constructor() {
    super(
      "Das Turnier wurde inzwischen geändert. Bitte aktualisieren und erneut versuchen.",
    );
  }
}

export async function loadEventState(db: D1Database, eventId: string) {
  const event = await db
    .prepare(
      "SELECT id, status, planned_round_count, finished_at, revision FROM events WHERE id = ?",
    )
    .bind(eventId)
    .first<EventState>();
  if (!event) return null;
  const round = await db
    .prepare(
      "SELECT state, round_number FROM rounds WHERE event_id = ? AND state <> 'discarded' ORDER BY round_number DESC LIMIT 1",
    )
    .bind(eventId)
    .first<RoundSummary>();
  return { event, round, policy: getEventPolicy(event, round) };
}

export function checkRevision(actual: number, expected?: number) {
  if (expected !== undefined && actual !== expected) throw new EventConflict();
}

export async function mutateEvent(
  db: D1Database,
  eventId: string,
  revision: number,
  statements: D1PreparedStatement[],
) {
  try {
    // A failed CHECK aborts the entire D1 batch, including all following writes.
    // A conditional UPDATE alone would silently affect zero rows and let them run.
    await db.batch([
      db
        .prepare(
          "UPDATE events SET revision = CASE WHEN revision = ? THEN revision + 1 ELSE -1 END WHERE id = ?",
        )
        .bind(revision, eventId),
      ...statements,
    ]);
  } catch (cause) {
    if (
      cause instanceof Error &&
      cause.message.includes("event_revision_conflict")
    ) {
      throw new EventConflict();
    }
    throw cause;
  }
}
