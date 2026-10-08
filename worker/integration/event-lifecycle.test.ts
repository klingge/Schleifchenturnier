import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import type { EventData } from "../../src/domain/tournament";
import { EventConflict, mutateEvent } from "../event-mutations";

let auth: Record<string, string>;
beforeAll(async () => {
  const response = await SELF.fetch("https://example.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "integration-test-passwort" }),
  });
  const { csrf } = await response.json<{ csrf: string }>();
  auth = {
    "content-type": "application/json",
    "x-csrf-token": csrf,
    cookie: response.headers.get("set-cookie")!.split(";", 1)[0],
  };
});

const request = (path: string, body?: object, method = "POST") =>
  SELF.fetch(`https://example.test/api/admin${path}`, {
    method,
    headers: auth,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
async function ok(path: string, body: object, method = "POST") {
  const response = await request(path, body, method);
  expect(response.status, await response.clone().text()).toBeLessThan(300);
  return response;
}
async function data(id: string) {
  return (await request(`/events/${id}`, undefined, "GET")).json<EventData>();
}
async function fixture(count: number | null = null) {
  const event = (
    await (
      await ok("/events", {
        name: "Lifecycle-Test",
        durationMinutes: 20,
        plannedRoundCount: count,
      })
    ).json<EventData>()
  ).event;
  await ok(`/events/${event.id}/courts`, { name: "Center Court" });
  for (const name of ["Anna", "Ben", "Caro", "David"])
    await ok(`/events/${event.id}/players`, { name });
  return event.id;
}
async function draw(id: string) {
  const current = await data(id);
  return (
    await (
      await ok(`/events/${id}/generate`, {
        expectedRevision: current.event.revision,
      })
    ).json<EventData>()
  ).currentRound!;
}
async function score(round: NonNullable<EventData["currentRound"]>) {
  await ok(`/rounds/${round.id}/action`, { action: "start" });
  for (const match of round.matches)
    await ok(
      `/matches/${match.id}/result`,
      { teamAGames: 6, teamBGames: 4 },
      "PUT",
    );
}
async function play(id: string) {
  const round = await draw(id);
  await score(round);
  await ok(`/rounds/${round.id}/complete`, {});
  return data(id);
}

describe("Turnierdauer und Abschluss mit D1", () => {
  test.each([0, -1, 1.5, "6"])(
    "rejects invalid planned round count %s",
    async (count) => {
      expect(
        (
          await request("/events", {
            name: "Test",
            durationMinutes: 20,
            plannedRoundCount: count,
          })
        ).status,
      ).toBe(400);
    },
  );

  test("preserves old creation requests as unlimited, unfinished events", async () => {
    const response = await ok("/events", {
      name: "Bestand",
      durationMinutes: 20,
    });
    const result = await response.json<EventData>();
    expect(result.event).toMatchObject({
      planned_round_count: null,
      finished_at: null,
      revision: 0,
    });
  });

  test.each([1, 2])(
    "finishes after exactly %i completed rounds, keeping the public result available",
    async (count) => {
      const id = await fixture(count);
      for (let i = 1; i <= count; i++) {
        const round = await draw(id);
        expect((await request(`/rounds/${round.id}/complete`, {})).status).toBe(
          409,
        );
        await score(round);
        expect((await data(id)).event.finished_at).toBeNull();
        await ok(`/rounds/${round.id}/complete`, {});
        const current = await data(id);
        expect(Boolean(current.event.finished_at)).toBe(i === count);
      }
      const final = await data(id);
      expect((await request(`/events/${id}/generate`, {})).status).toBe(409);
      expect(
        (await request(`/events/${id}/players`, { name: "Später" })).status,
      ).toBe(409);
      expect(
        (
          await request(
            `/players/${final.players[0].id}`,
            { active: false },
            "PATCH",
          )
        ).status,
      ).toBe(409);
      expect(
        (await request(`/events/${id}/courts`, { name: "Später" })).status,
      ).toBe(409);
      expect(
        (
          await request(
            `/courts/${final.courts[0].id}`,
            { active: false },
            "PATCH",
          )
        ).status,
      ).toBe(409);
      expect(
        (await request(`/events/${id}`, { durationMinutes: 30 }, "PATCH"))
          .status,
      ).toBe(409);
      const match = final.currentRound!.matches[0];
      await ok(
        `/matches/${match.id}/result`,
        { teamAGames: 1, teamBGames: 6 },
        "PUT",
      );
      const publicResponse = await SELF.fetch(
        `https://example.test/api/public/events/${final.event.public_slug}`,
      );
      expect(publicResponse.status).toBe(200);
      const publicData = await publicResponse.json<EventData>();
      expect(publicData.event.finished_at).toBe(final.event.finished_at);
      expect(publicData.currentRound!.matches[0].team_a_games).toBe(1);
    },
  );

  test("requires all results and does not finish on timer/end actions", async () => {
    const id = await fixture(1);
    const round = await draw(id);
    await ok(`/rounds/${round.id}/action`, { action: "start" });
    await ok(`/rounds/${round.id}/action`, { action: "end" });
    expect(
      (await request(`/rounds/${round.id}/complete`, { allowMissing: true }))
        .status,
    ).toBe(409);
    expect((await data(id)).event.finished_at).toBeNull();
  });

  test("allows early finishing and reopening with a larger target or no limit", async () => {
    const id = await fixture(3);
    expect((await request(`/events/${id}/finish`, {})).status).toBe(409);
    await play(id);
    await ok(`/events/${id}/finish`, {});
    expect(
      (await request(`/events/${id}/resume`, { plannedRoundCount: 1 })).status,
    ).toBe(400);
    await ok(`/events/${id}/resume`, { plannedRoundCount: 2 });
    expect((await data(id)).event.finished_at).toBeNull();
    await play(id);
    expect((await data(id)).event.finished_at).not.toBeNull();
    await ok(`/events/${id}/resume`, { plannedRoundCount: null });
    await play(id);
    expect((await data(id)).event.finished_at).toBeNull();
  });

  test("permits planning only before publication and between rounds", async () => {
    const id = await fixture();
    await ok(`/events/${id}`, { plannedRoundCount: 3 }, "PATCH");
    const round = await draw(id);
    expect(
      (await request(`/events/${id}`, { plannedRoundCount: 4 }, "PATCH"))
        .status,
    ).toBe(409);
    expect((await request(`/events/${id}/finish`, {})).status).toBe(409);
    await score(round);
    expect((await request(`/events/${id}/finish`, {})).status).toBe(409);
    await ok(`/rounds/${round.id}/complete`, {});
    expect(
      (await request(`/events/${id}`, { plannedRoundCount: 1 }, "PATCH"))
        .status,
    ).toBe(400);
    await ok(`/events/${id}`, { plannedRoundCount: null }, "PATCH");
    const old = (await data(id)).event.revision;
    await ok(
      `/events/${id}`,
      { durationMinutes: 25, expectedRevision: old },
      "PATCH",
    );
    expect(
      (
        await request(
          `/events/${id}`,
          { plannedRoundCount: 2, expectedRevision: old },
          "PATCH",
        )
      ).status,
    ).toBe(409);
    expect((await data(id)).event.planned_round_count).toBeNull();
  });

  test("redraws retain the round number and discarded pairs never enter the result", async () => {
    const id = await fixture(1);
    const old = await draw(id);
    const next = await draw(id);
    expect(next.id).not.toBe(old.id);
    expect(next.round_number).toBe(1);
    expect((await data(id)).rounds).toHaveLength(1);
    expect(
      (await request(`/rounds/${old.id}/action`, { action: "start" })).status,
    ).toBe(409);
    await score(next);
    await ok(`/rounds/${next.id}/complete`, {});
    expect((await data(id)).event.finished_at).not.toBeNull();
  });

  test("a competing start and redraw cannot overwrite each other", async () => {
    const id = await fixture(2);
    const round = await draw(id);
    const { event } = await data(id);
    const responses = await Promise.all([
      request(`/rounds/${round.id}/action`, {
        action: "start",
        expectedRevision: event.revision,
      }),
      request(`/events/${id}/generate`, { expectedRevision: event.revision }),
    ]);
    expect(responses.filter((r) => r.status < 300)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(1);
    const current = await data(id);
    expect(current.rounds).toHaveLength(1);
    expect(current.currentRound!.state).toBe(
      responses[0].status === 200 ? "running" : "published",
    );
  });

  test("a stale revision aborts the full batch, not just the revision update", async () => {
    const id = await fixture();
    const old = (await data(id)).event.revision;
    await ok(`/events/${id}`, { plannedRoundCount: 5 }, "PATCH");
    await expect(
      mutateEvent(env.DB, id, old, [
        env.DB.prepare(
          "UPDATE events SET name = 'Must not persist' WHERE id = ?",
        ).bind(id),
      ]),
    ).rejects.toBeInstanceOf(EventConflict);
    expect((await data(id)).event.name).toBe("Lifecycle-Test");
  });

  test("archive remains distinct and cannot be undone by drawing or resuming", async () => {
    const id = await fixture(1);
    const final = await play(id);
    await ok(`/events/${id}`, { status: "archived" }, "PATCH");
    expect((await request(`/events/${id}/generate`, {})).status).toBe(409);
    expect(
      (await request(`/events/${id}/resume`, { plannedRoundCount: 2 })).status,
    ).toBe(409);
    expect(
      (
        await SELF.fetch(
          `https://example.test/api/public/events/${final.event.public_slug}`,
        )
      ).status,
    ).toBe(404);
    expect((await data(id)).event.status).toBe("archived");
  });
});
