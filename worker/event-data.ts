import { isConfigurationLocked } from "./admin-policy";
import { pairKey, type MatchHistory } from "./matchmaker";

export type DbRow = Record<string, unknown>;

async function latestRoundState(db: D1Database, eventId: string) {
  const round = await db
    .prepare(
      "SELECT state FROM rounds WHERE event_id = ? AND state <> 'discarded' ORDER BY round_number DESC LIMIT 1",
    )
    .bind(eventId)
    .first<{ state: string }>();
  return round?.state ?? null;
}

export async function configurationIsLocked(db: D1Database, eventId: string) {
  return isConfigurationLocked(await latestRoundState(db, eventId));
}

export const roundLockedBody = {
  error:
    "Teilnehmer und Plätze können erst nach Abschluss der aktuellen Runde geändert werden.",
  code: "round_locked",
};

export async function rows<T extends DbRow>(statement: D1PreparedStatement) {
  const result = await statement.all<T>();
  return result.results;
}

export async function loadEvent(
  db: D1Database,
  eventId: string,
  publicOnly = false,
) {
  const event = await db
    .prepare(
      `SELECT * FROM events WHERE id = ? ${publicOnly ? "AND status = 'active'" : ""}`,
    )
    .bind(eventId)
    .first<DbRow>();
  if (!event) return null;
  return assembleEvent(db, event);
}

export async function loadPublicEvent(db: D1Database, slug: string) {
  const event = await db
    .prepare(
      "SELECT * FROM events WHERE public_slug = ? AND status IN ('lobby', 'active')",
    )
    .bind(slug)
    .first<DbRow>();
  return event ? assembleEvent(db, event) : null;
}

async function assembleEvent(db: D1Database, event: DbRow) {
  const eventId = String(event.id);
  const players = await rows(
    db
      .prepare("SELECT * FROM players WHERE event_id = ? ORDER BY created_at")
      .bind(eventId),
  );
  const courts = await rows(
    db
      .prepare("SELECT * FROM courts WHERE event_id = ? ORDER BY position")
      .bind(eventId),
  );
  const rounds = await rows(
    db
      .prepare(
        "SELECT * FROM rounds WHERE event_id = ? AND state <> 'discarded' ORDER BY round_number",
      )
      .bind(eventId),
  );
  const roundIds = rounds.map((round) => String(round.id));
  let matches: DbRow[] = [];
  let participation: DbRow[] = [];
  if (roundIds.length) {
    const placeholders = roundIds.map(() => "?").join(",");
    matches = await rows(
      db
        .prepare(
          `SELECT * FROM matches WHERE round_id IN (${placeholders}) ORDER BY court_number`,
        )
        .bind(...roundIds),
    );
    participation = await rows(
      db
        .prepare(
          `SELECT * FROM round_participation WHERE round_id IN (${placeholders})`,
        )
        .bind(...roundIds),
    );
  }

  const stats = new Map(
    players.map((player) => [
      String(player.id),
      { wins: 0, gameDifference: 0, sitOuts: 0 },
    ]),
  );
  for (const item of participation) {
    if (item.status === "sitting_out")
      stats.get(String(item.player_id))!.sitOuts += 1;
  }
  for (const match of matches) {
    if (match.result_type !== "played") continue;
    const aGames = Number(match.team_a_games);
    const bGames = Number(match.team_b_games);
    const teamA = [
      String(match.team_a_player_1_id),
      String(match.team_a_player_2_id),
    ];
    const teamB = [
      String(match.team_b_player_1_id),
      String(match.team_b_player_2_id),
    ];
    for (const playerId of teamA)
      stats.get(playerId)!.gameDifference += aGames - bGames;
    for (const playerId of teamB)
      stats.get(playerId)!.gameDifference += bGames - aGames;
    for (const playerId of aGames > bGames ? teamA : teamB)
      stats.get(playerId)!.wins += 1;
  }
  const leaderboard: DbRow[] = players
    .map<DbRow>((player) => ({
      ...player,
      ...stats.get(String(player.id))!,
    }))
    .sort(
      (a, b) =>
        Number(b.wins) - Number(a.wins) ||
        Number(b.gameDifference) - Number(a.gameDifference) ||
        String(a.display_name).localeCompare(String(b.display_name), "de"),
    );
  let previous:
    { wins: number; gameDifference: number; rank: number } | undefined;
  leaderboard.forEach((player, index) => {
    const rank =
      previous &&
      previous.wins === player.wins &&
      previous.gameDifference === player.gameDifference
        ? previous.rank
        : index + 1;
    Object.assign(player, { rank });
    previous = {
      wins: Number(player.wins),
      gameDifference: Number(player.gameDifference),
      rank,
    };
  });
  const hydratedRounds: DbRow[] = rounds.map((round) => ({
    ...round,
    matches: matches.filter((match) => match.round_id === round.id),
    sitting_out_player_ids: participation
      .filter(
        (item) => item.round_id === round.id && item.status === "sitting_out",
      )
      .map((item) => String(item.player_id)),
  }));
  return {
    event,
    players,
    courts,
    leaderboard,
    rounds: hydratedRounds,
    currentRound: hydratedRounds.at(-1) ?? null,
  };
}

export async function buildHistory(
  data: Awaited<ReturnType<typeof loadEvent>>,
) {
  const history: MatchHistory = { partners: new Map(), opponents: new Map() };
  if (!data) return history;
  for (const round of data.rounds) {
    if (round.state !== "completed") continue;
    for (const match of round.matches as DbRow[]) {
      const teamA = [
        String(match.team_a_player_1_id),
        String(match.team_a_player_2_id),
      ];
      const teamB = [
        String(match.team_b_player_1_id),
        String(match.team_b_player_2_id),
      ];
      for (const team of [teamA, teamB])
        history.partners.set(
          pairKey(team[0], team[1]),
          (history.partners.get(pairKey(team[0], team[1])) ?? 0) + 1,
        );
      for (const a of teamA)
        for (const b of teamB)
          history.opponents.set(
            pairKey(a, b),
            (history.opponents.get(pairKey(a, b)) ?? 0) + 1,
          );
    }
  }
  return history;
}
