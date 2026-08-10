import { describe, expect, it } from "vitest";
import {
  getPublicPlayerStorageKey,
  readPublicPlayerSelection,
  writePublicPlayerSelection,
} from "./public-player-selection";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("public player selection", () => {
  it("uses a separate storage key for each tournament", () => {
    expect(getPublicPlayerStorageKey("sommerfest-2026")).toBe(
      "sga-sommerfest:public-player:sommerfest-2026",
    );
  });

  it("returns an empty selection when nothing is stored", () => {
    expect(readPublicPlayerSelection(createStorage(), "turnier")).toBe("");
  });

  it("stores, replaces, and removes the selected player", () => {
    const storage = createStorage();

    writePublicPlayerSelection(storage, "turnier", "player-1");
    expect(readPublicPlayerSelection(storage, "turnier")).toBe("player-1");

    writePublicPlayerSelection(storage, "turnier", "player-2");
    expect(readPublicPlayerSelection(storage, "turnier")).toBe("player-2");

    writePublicPlayerSelection(storage, "turnier", "");
    expect(readPublicPlayerSelection(storage, "turnier")).toBe("");
  });

  it("falls back safely when browser storage throws", () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readPublicPlayerSelection(throwingStorage, "turnier")).toBe("");
    expect(() =>
      writePublicPlayerSelection(throwingStorage, "turnier", "player-1"),
    ).not.toThrow();
  });
});
