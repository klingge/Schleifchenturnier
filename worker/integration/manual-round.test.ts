import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import type { EventData } from "../../src/domain/tournament";
import { buildHistory, loadEvent } from "../event-data";
import { pairKey } from "../matchmaker";

let headers: Record<string, string>;
beforeAll(async () => {
  const response = await SELF.fetch("https://example.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "integration-test-passwort" }),
  });
  const { csrf } = await response.json<{ csrf: string }>();
  headers = {
    "content-type": "application/json",
    "x-csrf-token": csrf,
    cookie: response.headers.get("set-cookie")!.split(";", 1)[0],
  };
});

const request = (path: string, body?: object, method = "POST") =>
  SELF.fetch(`https://example.test/api/admin${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

async function ok(path: string, body?: object, method = "POST") {
  const response = await request(path, body, method);
  expect(response.status, await response.clone().text()).toBeLessThan(300);
  return response;
}

async function data(id: string) {
  return (await (
    await ok(`/events/${id}`, undefined, "GET")
  ).json()) as EventData;
}

async function fixture() {
  const created = (await (
    await ok("/events", {
      name: "Manuelle Runde",
      durationMinutes: 20,
    })
  ).json()) as EventData;
  const eventId = created.event.id;
  for (const name of ["Court A", "Court B"])
    await ok(`/events/${eventId}/courts`, { name });
  for (const name of ["Anna", "Ben", "Caro", "David", "Eda", "Fritz"])
    await ok(`/events/${eventId}/players`, { name });
  return data(eventId);
}

function match(data: EventData, court = 0, players = [0, 1, 2, 3]) {
  return {
    courtId: data.courts[court].id,
    teamA: [data.players[players[0]].id, data.players[players[1]].id],
    teamB: [data.players[players[2]].id, data.players[players[3]].id],
  };
}

async function manual(data: EventData, matches = [match(data)]) {
  return ok(`/events/${data.event.id}/rounds/manual`, {
    expectedRevision: data.event.revision,
    matches,
  });
}

describe("manuelle Runden mit D1", () => {
  test("publishes chosen partners, court snapshot and actual sitting out players", async () => {
    const initial = await fixture();
    const response = (await (await manual(initial)).json()) as EventData;
    const round = response.currentRound!;
    expect(round).toMatchObject({ round_number: 1, state: "published" });
    expect(round.matches).toHaveLength(1);
    expect(round.matches[0]).toMatchObject({
      court_id: initial.courts[0].id,
      court_name_snapshot: "Court A",
      team_a_player_1_id: initial.players[0].id,
      team_a_player_2_id: initial.players[1].id,
      team_b_player_1_id: initial.players[2].id,
      team_b_player_2_id: initial.players[3].id,
    });
    expect(round.sitting_out_player_ids.sort()).toEqual(
      initial.players
        .slice(4)
        .map((player) => player.id)
        .sort(),
    );
    await ok(`/rounds/${round.id}/action`, { action: "start" });
    await ok(
      `/matches/${round.matches[0].id}/result`,
      { teamAGames: 6, teamBGames: 4 },
      "PUT",
    );
    await ok(`/rounds/${round.id}/complete`, {});
    const history = await buildHistory(
      await loadEvent(env.DB, initial.event.id),
    );
    expect(
      history.partners.get(
        pairKey(initial.players[0].id, initial.players[1].id),
      ),
    ).toBe(1);
    expect(
      history.opponents.get(
        pairKey(initial.players[0].id, initial.players[2].id),
      ),
    ).toBe(1);
    const next = await data(initial.event.id);
    expect(
      next.leaderboard.find((player) => player.id === initial.players[4].id)
        ?.sitOuts,
    ).toBe(1);
    const auto = (await (
      await ok(`/events/${initial.event.id}/generate`, {
        expectedRevision: next.event.revision,
      })
    ).json()) as EventData;
    expect(auto.currentRound?.round_number).toBe(2);
  });

  test("rejects incomplete, duplicate, inactive and foreign assignments without changing the round", async () => {
    const initial = await fixture();
    const other = await fixture();
    const path = `/events/${initial.event.id}/rounds/manual`;
    const body = (matches: object[]) => ({
      expectedRevision: initial.event.revision,
      matches,
    });
    expect((await request(path, body([]))).status).toBe(400);
    expect(
      (
        await request(
          path,
          body([{ ...match(initial), teamB: [initial.players[2].id] }]),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          path,
          body([
            {
              ...match(initial),
              teamB: [initial.players[2].id, initial.players[0].id],
            },
          ]),
        )
      ).status,
    ).toBe(400);
    expect(
      (await request(path, body([match(initial), match(initial)]))).status,
    ).toBe(400);
    expect(
      (
        await request(
          path,
          body([{ ...match(initial), courtId: other.courts[0].id }]),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          path,
          body([
            {
              ...match(initial),
              teamA: [other.players[0].id, initial.players[1].id],
            },
          ]),
        )
      ).status,
    ).toBe(400);
    await ok(`/players/${initial.players[0].id}`, { active: false }, "PATCH");
    const updated = await data(initial.event.id);
    expect(
      (
        await request(path, {
          expectedRevision: updated.event.revision,
          matches: [match(initial)],
        })
      ).status,
    ).toBe(400);
    await ok(`/courts/${initial.courts[0].id}`, { active: false }, "PATCH");
    const newest = await data(initial.event.id);
    expect(
      (
        await request(path, {
          expectedRevision: newest.event.revision,
          matches: [match(initial, 0, [1, 2, 3, 4])],
        })
      ).status,
    ).toBe(400);
    expect((await data(initial.event.id)).currentRound).toBeNull();
  });

  test("replaces a published draw under the same number and keeps an invalid edit unchanged", async () => {
    const initial = await fixture();
    const drawn = (await (
      await ok(`/events/${initial.event.id}/generate`, {
        expectedRevision: initial.event.revision,
      })
    ).json()) as EventData;
    const original = drawn.currentRound!;
    const invalid = await request(`/events/${initial.event.id}/rounds/manual`, {
      expectedRevision: drawn.event.revision,
      matches: [match(drawn), match(drawn)],
    });
    expect(invalid.status).toBe(400);
    expect((await data(initial.event.id)).currentRound?.id).toBe(original.id);
    const edited = (await (
      await manual(drawn, [match(drawn, 1)])
    ).json()) as EventData;
    expect(edited.currentRound?.round_number).toBe(1);
    expect(edited.currentRound?.id).not.toBe(original.id);
    expect(edited.rounds).toHaveLength(1);
    expect(edited.currentRound?.matches[0].court_name_snapshot).toBe("Court B");
    expect(
      (await request(`/rounds/${original.id}/action`, { action: "start" }))
        .status,
    ).toBe(409);
    expect(
      (
        await request(`/events/${initial.event.id}/rounds/manual`, {
          expectedRevision: drawn.event.revision,
          matches: [match(drawn)],
        })
      ).status,
    ).toBe(409);
  });

  test("concurrent start and manual edit have one winner", async () => {
    const initial = await fixture();
    const drawn = (await (
      await ok(`/events/${initial.event.id}/generate`, {
        expectedRevision: initial.event.revision,
      })
    ).json()) as EventData;
    const old = drawn.currentRound!;
    const [start, edit] = await Promise.all([
      request(`/rounds/${old.id}/action`, {
        action: "start",
        expectedRevision: drawn.event.revision,
      }),
      request(`/events/${initial.event.id}/rounds/manual`, {
        expectedRevision: drawn.event.revision,
        matches: [match(drawn)],
      }),
    ]);
    expect([start.status, edit.status].sort()).toEqual([200, 409]);
    const current = (await data(initial.event.id)).currentRound!;
    expect(current.state).toBe(start.status === 200 ? "running" : "published");
    expect(current.id === old.id).toBe(start.status === 200);
  });
});
