import { describe, expect, it } from "vitest";
import { isConfigurationLocked } from "./admin-policy";

describe("isConfigurationLocked", () => {
  it.each(["published", "running", "paused", "results"])(
    "locks configuration while the latest round is %s",
    (state) => {
      expect(isConfigurationLocked(state)).toBe(true);
    },
  );

  it.each([null, undefined, "completed"])(
    "allows configuration when the latest round is %s",
    (state) => {
      expect(isConfigurationLocked(state)).toBe(false);
    },
  );
});
