import type { Court, Round } from "../src/domain/tournament";
import { mutateEvent } from "./event-mutations";

export type RoundAssignment = {
  court: Court;
  teamA: [string, string];
  teamB: [string, string];
};

export async function publishRound({
  db,
  eventId,
  revision,
  current,
  durationSeconds,
  assignments,
  activePlayerIds,
  matchmakingSeed,
}: {
  db: D1Database;
  eventId: string;
  revision: number;
  current: Round | null;
  durationSeconds: number;
  assignments: RoundAssignment[];
  activePlayerIds: string[];
  matchmakingSeed: number;
}) {
  const timestamp = new Date().toISOString();
  const roundId = crypto.randomUUID();
  const roundNumber =
    current?.state === "published"
      ? current.round_number
      : (current?.round_number ?? 0) + 1;
  const playing = new Set(
    assignments.flatMap(({ teamA, teamB }) => [...teamA, ...teamB]),
  );
  const statements: D1PreparedStatement[] = [];

  if (current?.state === "published")
    statements.push(
      db
        .prepare(
          "UPDATE rounds SET state = 'discarded', discarded_at = ? WHERE id = ?",
        )
        .bind(timestamp, current.id),
    );
  if (current?.state === "completed")
    statements.push(
      db
        .prepare("UPDATE matches SET result_locked_at = ? WHERE round_id = ?")
        .bind(timestamp, current.id),
    );
  statements.push(
    db
      .prepare(
        "INSERT INTO rounds (id, event_id, round_number, state, court_count, duration_seconds, published_at, matchmaking_seed) VALUES (?, ?, ?, 'published', ?, ?, ?, ?)",
      )
      .bind(
        roundId,
        eventId,
        roundNumber,
        assignments.length,
        durationSeconds,
        timestamp,
        matchmakingSeed,
      ),
  );
  for (const { court, teamA, teamB } of assignments)
    statements.push(
      db
        .prepare(
          "INSERT INTO matches (id, round_id, court_number, court_id, court_name_snapshot, team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          roundId,
          court.position,
          court.id,
          court.name,
          ...teamA,
          ...teamB,
        ),
    );
  for (const playerId of activePlayerIds)
    statements.push(
      db
        .prepare(
          "INSERT INTO round_participation (round_id, player_id, status) VALUES (?, ?, ?)",
        )
        .bind(
          roundId,
          playerId,
          playing.has(playerId) ? "playing" : "sitting_out",
        ),
    );
  statements.push(
    db
      .prepare(
        "UPDATE events SET status = 'active', updated_at = ? WHERE id = ?",
      )
      .bind(timestamp, eventId),
  );
  await mutateEvent(db, eventId, revision, statements);
  return roundId;
}
