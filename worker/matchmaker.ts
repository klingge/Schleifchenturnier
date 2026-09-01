export type MatchPlayer = {
  id: string;
  rank: number;
  sitOuts: number;
};

export type MatchHistory = {
  partners: Map<string, number>;
  opponents: Map<string, number>;
};

type MatchAssignment = {
  court: number;
  teamA: [string, string];
  teamB: [string, string];
};

export type MatchmakingResult = {
  matches: MatchAssignment[];
  sittingOut: string[];
  repeatedPartners: number;
  repeatedOpponents: number;
};

type Score = [number, number, number, number];

export const pairKey = (a: string, b: string) =>
  a < b ? `${a}:${b}` : `${b}:${a}`;

function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: T[], random: () => number) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function compareScore(a: Score, b: Score) {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function teamOptions(group: MatchPlayer[]) {
  return [
    [
      [group[0], group[1]],
      [group[2], group[3]],
    ],
    [
      [group[0], group[2]],
      [group[1], group[3]],
    ],
    [
      [group[0], group[3]],
      [group[1], group[2]],
    ],
  ] as const;
}

function scoreTeams(
  teamA: readonly [MatchPlayer, MatchPlayer],
  teamB: readonly [MatchPlayer, MatchPlayer],
  history: MatchHistory,
): Score {
  const repeatedPartners =
    (history.partners.get(pairKey(teamA[0].id, teamA[1].id)) ?? 0) +
    (history.partners.get(pairKey(teamB[0].id, teamB[1].id)) ?? 0);
  let repeatedOpponents = 0;
  for (const a of teamA) {
    for (const b of teamB)
      repeatedOpponents += history.opponents.get(pairKey(a.id, b.id)) ?? 0;
  }
  const ranks = [...teamA, ...teamB].map((player) => player.rank);
  const rankSpread = Math.max(...ranks) - Math.min(...ranks);
  const balance = Math.abs(
    teamA[0].rank + teamA[1].rank - teamB[0].rank - teamB[1].rank,
  );
  return [repeatedPartners, repeatedOpponents, rankSpread, balance];
}

function buildCandidate(
  players: MatchPlayer[],
  history: MatchHistory,
  random: () => number,
) {
  const groups: MatchPlayer[][] = [];
  const randomized = shuffle(players, random);
  for (let index = 0; index < randomized.length; index += 4)
    groups.push(randomized.slice(index, index + 4));

  const matches: MatchAssignment[] = [];
  const total: Score = [0, 0, 0, 0];
  groups.forEach((group, courtIndex) => {
    let bestOption = teamOptions(group)[0];
    let bestScore = scoreTeams(bestOption[0], bestOption[1], history);
    for (const option of teamOptions(group).slice(1)) {
      const score = scoreTeams(option[0], option[1], history);
      if (compareScore(score, bestScore) < 0) {
        bestOption = option;
        bestScore = score;
      }
    }
    bestScore.forEach((value, index) => (total[index] += value));
    matches.push({
      court: courtIndex + 1,
      teamA: [bestOption[0][0].id, bestOption[0][1].id],
      teamB: [bestOption[1][0].id, bestOption[1][1].id],
    });
  });
  return { matches, score: total };
}

export function generateMatches(
  allPlayers: MatchPlayer[],
  courtCount: number,
  history: MatchHistory,
  seed: number,
  iterations = 2500,
): MatchmakingResult {
  const random = rng(seed);
  const capacity = Math.min(
    courtCount * 4,
    Math.floor(allPlayers.length / 4) * 4,
  );
  const sitOutCount = allPlayers.length - capacity;
  const sittingOut = shuffle(allPlayers, random)
    .sort((a, b) => a.sitOuts - b.sitOuts)
    .slice(0, sitOutCount)
    .map((player) => player.id);
  const sittingOutSet = new Set(sittingOut);
  const playing = allPlayers.filter((player) => !sittingOutSet.has(player.id));

  if (playing.length === 0) {
    return {
      matches: [],
      sittingOut,
      repeatedPartners: 0,
      repeatedOpponents: 0,
    };
  }

  let best = buildCandidate(playing, history, random);
  for (let attempt = 1; attempt < iterations; attempt += 1) {
    const candidate = buildCandidate(playing, history, random);
    if (compareScore(candidate.score, best.score) < 0) best = candidate;
    if (
      best.score[0] === 0 &&
      best.score[1] === 0 &&
      best.score[2] <= 3 &&
      best.score[3] <= 2
    )
      break;
  }

  return {
    matches: best.matches,
    sittingOut,
    repeatedPartners: best.score[0],
    repeatedOpponents: best.score[1],
  };
}
