export function isConfigurationLocked(state: string | null | undefined) {
  return state !== null && state !== undefined && state !== "completed";
}
