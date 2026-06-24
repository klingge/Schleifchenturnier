# SGA Sommerfest

German web application for running a timed tennis doubles tournament. The organizer controls registration, matchmaking, rounds, results, and event history. Participants use a public read-only link or QR code.

## Local development

Requirements: Node.js 20 or newer and npm.

```powershell
npm install
npm run db:migrate:local
npm run dev
```

Open the URL printed by Vite. The checked-in local development password is `sommerfest-local`. It is only used by `.dev.vars`, which is ignored by Git.

## Checks

```powershell
npm run typecheck
npm test
npm run build
```

## Cloudflare deployment

1. Create a free Cloudflare account and authenticate Wrangler:

   ```powershell
   npx wrangler login
   ```

2. Create the D1 database:

   ```powershell
   npx wrangler d1 create sga-sommerfest
   ```

3. Copy the returned database ID into `wrangler.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`.

4. Configure production secrets. Use a strong organizer password and a random session secret of at least 32 characters:

   ```powershell
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SESSION_SECRET
   ```

5. Apply migrations and deploy:

   ```powershell
   npm run db:migrate:remote
   npm run deploy
   ```

Cloudflare prints the public `workers.dev` address after deployment. No paid plan is required for the expected tournament usage.

## Architecture

- React 19 and Radix Themes client
- Cloudflare Worker API with Hono
- Cloudflare D1 database and SQL migrations
- Signed HTTP-only organizer sessions with CSRF validation
- Seeded, lexicographically scored doubles matcher
- Vitest unit tests

The confirmed product specification is in [`thoughts/shared/specs/2026-06-24-tennis-doubles-tournament.md`](thoughts/shared/specs/2026-06-24-tennis-doubles-tournament.md).
