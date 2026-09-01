import path from "node:path";

import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ADMIN_PASSWORD: "integration-test-passwort",
          SESSION_SECRET:
            "integration-test-session-geheimnis-mit-mindestens-32-zeichen",
          TEST_MIGRATIONS: await readD1Migrations(path.resolve("migrations")),
        },
      },
    })),
  ],
  test: {
    include: ["worker/integration/**/*.test.ts"],
    setupFiles: ["./worker/integration/apply-migrations.ts"],
  },
});
