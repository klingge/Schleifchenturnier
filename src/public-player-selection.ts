const PUBLIC_PLAYER_STORAGE_PREFIX = "sga-sommerfest:public-player:";

type PlayerSelectionStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export function getPublicPlayerStorageKey(slug: string) {
  return `${PUBLIC_PLAYER_STORAGE_PREFIX}${slug}`;
}

export function getBrowserPlayerStorage(): PlayerSelectionStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readPublicPlayerSelection(
  storage: PlayerSelectionStorage | undefined,
  slug: string,
) {
  if (!storage) return "";

  try {
    return storage.getItem(getPublicPlayerStorageKey(slug)) ?? "";
  } catch {
    return "";
  }
}

export function writePublicPlayerSelection(
  storage: PlayerSelectionStorage | undefined,
  slug: string,
  playerId: string,
) {
  if (!storage) return;

  try {
    if (playerId) {
      storage.setItem(getPublicPlayerStorageKey(slug), playerId);
    } else {
      storage.removeItem(getPublicPlayerStorageKey(slug));
    }
  } catch {
    // The public view remains usable when browser storage is unavailable.
  }
}
