import { describe, expect, it } from "vitest";
import { nextPlayerEmoji, PLAYER_EMOJIS } from "./player-emojis";

describe("player emoji assignment", () => {
  it("provides 64 unique participant emojis", () => {
    expect(PLAYER_EMOJIS).toHaveLength(64);
    expect(new Set(PLAYER_EMOJIS).size).toBe(64);
  });

  it("assigns the first emoji that is not already used", () => {
    expect(nextPlayerEmoji(new Set())).toBe(PLAYER_EMOJIS[0]);
    expect(nextPlayerEmoji(new Set(PLAYER_EMOJIS.slice(0, 3)))).toBe(
      PLAYER_EMOJIS[3],
    );
  });

  it("uses a numbered tennis ball after the pool is exhausted", () => {
    expect(nextPlayerEmoji(new Set(PLAYER_EMOJIS))).toBe("🎾65");
  });
});
