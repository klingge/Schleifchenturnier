import { applyD1Migrations, env } from "cloudflare:test";
import { expect, test } from "vitest";

test("upgrades existing events without changing their planning, status or history", async () => {
  const migrationIndex = env.TEST_MIGRATIONS.findIndex(
    (m) => m.name === "0003_event_completion.sql",
  );
  expect(migrationIndex).toBeGreaterThan(0);
  await applyD1Migrations(
    env.MIGRATION_DB,
    env.TEST_MIGRATIONS.slice(0, migrationIndex),
  );
  await env.MIGRATION_DB.batch([
    env.MIGRATION_DB.prepare(`INSERT INTO events
      (id, public_slug, name, event_date, default_round_duration_seconds, default_court_count, status, created_at, updated_at)
      VALUES ('legacy', 'legacy', 'Bestehendes Turnier', '2026-08-01', 1200, 1, 'archived', '2026-08-01', '2026-08-01')`),
    env.MIGRATION_DB.prepare(`INSERT INTO rounds
      (id, event_id, round_number, state, court_count, duration_seconds, published_at, matchmaking_seed)
      VALUES ('legacy-round', 'legacy', 1, 'completed', 1, 1200, '2026-08-01', 42)`),
  ]);
  await applyD1Migrations(
    env.MIGRATION_DB,
    env.TEST_MIGRATIONS.slice(migrationIndex),
  );
  expect(
    await env.MIGRATION_DB.prepare(
      "SELECT * FROM events WHERE id = 'legacy'",
    ).first(),
  ).toMatchObject({
    name: "Bestehendes Turnier",
    status: "archived",
    planned_round_count: null,
    finished_at: null,
    revision: 0,
  });
  expect(
    await env.MIGRATION_DB.prepare(
      "SELECT * FROM rounds WHERE id = 'legacy-round'",
    ).first(),
  ).toMatchObject({
    state: "completed",
    round_number: 1,
    matchmaking_seed: 42,
  });
});
