# Tennis Doubles Tournament Organizer — Specification

## Executive Summary

This project is a German-language web application for organizing a live, timed tennis doubles tournament. A single organizer registers up to 50 players, generates fair court assignments, controls synchronized rounds, enters results, and publishes a read-only mobile view through a QR code.

The application prioritizes fresh partner combinations, minimizes repeated opponents, rotates sit-outs fairly, and uses the live leaderboard for secondary skill-based matchmaking. It will be publicly hosted on Cloudflare's free tier without an automatically activated paid plan.

## Problem Statement

The tournament is currently difficult to coordinate manually. The two main problems are:

1. Players repeatedly receive the same doubles partners or opponents.
2. Players forget their partner, opponents, or assigned court.

The organizer needs one authoritative interface for registrations, rounds, results, and event history. Participants need a simple public view that works without accounts, installation, or mandatory phone use.

## Success Criteria

- The organizer can create and operate an event from a laptop or tablet without technical knowledge.
- A participant can scan a QR code, select any player, and see that player's current partner, opponents, and court.
- Every published match contains exactly four distinct active players, and no player appears in more than one match in a round.
- The matcher avoids repeated partnerships whenever a non-repeating solution exists.
- Sit-outs remain balanced: selection first favors players who have already sat out more often.
- A round with 50 registered players is generated within two seconds under normal production conditions.
- Result writes are atomic and visibly confirmed; a failed write never appears saved.
- Rankings are calculated consistently from immutable completed-round results.
- The event can be run on Cloudflare's free tier at the defined scale.

## Users and Access

### Organizer

- One organizer operates the application, normally from a laptop or tablet.
- The organizer authenticates with one application-wide password.
- The organizer can create, run, archive, privately review, and permanently delete events.
- Only the organizer can register players, change player availability, generate rounds, control the timer, and enter results.

### Participant

- Participants do not authenticate and never modify data.
- Participants open an opaque public event URL, normally through a QR code.
- Participants see the leaderboard and may select any player to inspect their current assignment.
- Public player names should be first names or nicknames, not full names.
- A participant does not need a phone; the organizer remains the authoritative source.

## Language and Terminology

- All user-facing interface text is German.
- Internal code, database identifiers, and developer documentation may use English.
- A win is represented visually by a hair-bow symbol, preferably `🎀`, one per win.
- The visual bow representation must also have an accessible numeric label, such as `3 Siege`, for screen readers and non-visual contexts.

## Core User Journey

### 1. Create an event

The organizer signs in and creates an event with:

- Event name
- Event date
- Default round duration
- Initial number of available courts, from 1 through 13

The application creates an opaque public link and QR code. The organizer can copy the link or open a print-friendly QR view.

### 2. Manage the lobby

The organizer adds players by first name or nickname. Each player receives:

- A stable internal identifier
- A randomly assigned emoji that is unique within that event
- An active status

Duplicate display names are allowed because the unique emoji distinguishes them. The organizer can rename or remove a player while no played-round history depends on that player. Once history exists, the player may be renamed or marked inactive but not removed.

### 3. Publish a round

The organizer selects the available court count and round duration, then chooses `Paarungen erstellen`.

- Matchmaking runs immediately.
- Assignments are published immediately; there is no preview or manual editing step.
- Publishing the first round closes the initial lobby, but the organizer may still add late arrivals for later rounds.
- The public page shows the newly published assignments after a manual refresh.
- The timer does not start automatically.

### 4. Start and control the round

The organizer starts the synchronized round separately.

- The server records the authoritative start time and duration.
- The organizer can pause and resume the timer, for example during rain.
- While paused, elapsed time stops accumulating.
- When time expires, the organizer interface automatically switches to result entry.
- Participants who refresh can see the current round state and remaining time.

### 5. Enter results

For every court, the organizer enters non-negative integer games for Team A and Team B.

- A played match cannot end level. If time expires at a draw, the players decide the winner through a golden point and report a non-drawn final result.
- A normal submitted score must therefore have different team scores.
- An unreported result may be converted to the special `0–0` missing-result outcome.
- Before continuing, the application warns about every missing result and requires explicit confirmation.
- A `0–0` missing result awards no win and contributes zero to game difference for all four players.
- Results may be corrected until the next round is published.
- Publishing the next round permanently locks all results from the previous round.

### 6. Continue or finish

The organizer may repeat matchmaking for as many rounds as desired. The expected event normally has four to seven rounds, but the application imposes no fixed round count.

When finished, the organizer archives the event:

- Its public link no longer exposes names, assignments, or results.
- Its full history remains available in the authenticated organizer dashboard.
- The organizer can permanently delete it through a destructive action with explicit confirmation.

## Event and Round States

### Event states

- `lobby`: event exists and no round has been published.
- `active`: at least one round has been published and the event is not archived.
- `archived`: inaccessible through the public route; retained for the organizer.

### Round states

- `published`: assignments are public; timer has not started.
- `running`: synchronized timer is counting down.
- `paused`: timer is stopped temporarily and can resume.
- `results`: timer expired or the organizer ended the round; results are being entered.
- `completed`: all results were submitted or explicitly converted to missing `0–0` outcomes.
- `discarded`: a pre-start round was regenerated and is excluded from all statistics and repetition history.

The organizer may regenerate a round only while it is `published`, before its timer has started. Regeneration discards all assignments from that round and creates new ones. Discarded pairings never count as previous partners, opponents, appearances, or sit-outs.

## Player Availability and Sit-Outs

- A player has an organizer-controlled `active` flag.
- New late arrivals can be added at any time and become eligible for the next generated round.
- A player who leaves early is marked inactive and is excluded from future rounds.
- Availability changes never alter a running or completed round.
- A round uses at most `available courts × 4` players.
- The number of playing participants is the largest multiple of four that fits both active-player count and court capacity.
- Everyone else receives a recorded sit-out for that round.
- When sit-outs are necessary, players with fewer previous sit-outs are selected to sit out before players with more previous sit-outs. Equivalent candidates are selected randomly.
- Only rounds in which a player was active at generation time affect that player's sit-out history.

## Matchmaking Requirements

### Inputs

- Active eligible players
- Available court count
- Completed and locked round history
- Per-player sit-out count
- Pairwise partnership counts
- Pairwise opponent counts
- Current leaderboard order

Discarded rounds and the currently regenerated round are excluded.

### Priority order

The matcher compares candidate schedules lexicographically in this exact order:

1. **Sit-out fairness:** apply the sit-out selection rule before creating matches.
2. **Repeated partners:** minimize the total number of prior partnerships represented by the schedule. A zero-repeat schedule must be chosen whenever one is found within the exhaustive or bounded search space.
3. **Repeated opponents:** minimize the total number of previous opponent encounters across all matches.
4. **Leaderboard proximity:** minimize the spread between the highest- and lowest-ranked player in each four-player match group.
5. **Team balance:** within each group, minimize the difference between the two teams' combined current strength.
6. **Random tie-break:** choose randomly among schedules with equivalent scores.

No lower-priority improvement may be accepted if it worsens a higher-priority score.

### Strength representation

- Current leaderboard rank is based on wins and then game difference.
- Players tied on both values share a rank and equal matchmaking strength.
- Before any results exist, all players have equal strength and matchmaking is random after repetition constraints.
- Team strength is the sum of the two players' ordinal leaderboard positions, with tied positions treated equally.

### Search behavior

- The implementation may use constrained randomized search, local improvement, or another deterministic-under-seed optimization technique.
- The search must enforce structural validity as hard constraints: four distinct players per match, one match or sit-out per eligible player, and one match per court.
- The implementation uses a bounded two-second search budget at 50 players and retains the best valid candidate found.
- Repeated partners are permitted only when no zero-repeat solution is found within that search. The organizer receives a non-blocking notice when a repetition was unavoidable.
- Tests must cover cases where a zero-repeat solution exists and where repetition is mathematically unavoidable.

## Leaderboard Rules

Player statistics are derived from match results; `matches won` is not stored as an independently editable value.

For every completed non-missing match:

- Both players on the winning team receive one win.
- Every player's game difference changes by their team's games minus the opposing team's games.

For a missing `0–0` result:

- No player receives a win.
- Every player's game-difference contribution is zero.

Leaderboard ordering:

1. Wins, descending
2. Game difference, descending

Players equal on both measures share the same displayed rank. No additional hidden tie-breaker changes that shared rank. Stable display ordering within a tie may use nickname and emoji without implying a better rank.

## Functional Requirements

### P0 — Required for the first live event

- Application-wide organizer login and logout
- Organizer dashboard listing active and archived events
- Event creation, archive, and permanent deletion
- Lobby with player add, rename, active/inactive toggle, and event-unique emoji assignment
- Configuration of 1–13 courts and per-round duration
- Immediate matchmaking using the defined priorities
- Pre-start round regeneration
- Separate publish and timer-start actions
- Server-authoritative timer with pause and resume
- Result entry, validation, missing-result confirmation, and locking
- Derived leaderboard with hair-bow win indicators and game difference
- Public read-only event page optimized for phones
- Player selection showing partner, opponents, court, and round state
- QR generation, link copying, and print-friendly QR display
- Manual refresh on the public page
- Clear save success, pending, and failure states
- German interface and responsive layout

### P1 — Should have after the first operational version

- Organizer event summary showing round-by-round history
- Export of final leaderboard and match history as CSV
- Print-friendly final leaderboard
- Simple diagnostic display for matchmaking repetitions and sit-out counts

### P2 — Possible future additions

- Custom domain
- Multiple organizer accounts
- Participant self-registration
- Live push updates without refreshing
- Installable progressive web application and offline operation
- Notifications or announcements

## Data Model

### `events`

- `id`: UUID
- `public_slug`: cryptographically random, unique, non-sequential slug
- `name`: required display name
- `event_date`: local calendar date
- `default_round_duration_seconds`: positive integer
- `default_court_count`: integer from 1 through 13
- `status`: `lobby | active | archived`
- `created_at`, `updated_at`, `archived_at`

### `players`

- `id`: UUID
- `event_id`: foreign key
- `display_name`: trimmed first name or nickname
- `emoji`: event-unique emoji
- `active`: boolean
- `created_at`, `updated_at`

### `rounds`

- `id`: UUID
- `event_id`: foreign key
- `round_number`: positive integer, unique among non-discarded rounds in an event
- `state`: `published | running | paused | results | completed | discarded`
- `court_count`: snapshot used for this round
- `duration_seconds`: snapshot used for this round
- `published_at`, `started_at`, `expires_at`, `completed_at`, `discarded_at`
- `paused_at`
- `accumulated_paused_seconds`
- `matchmaking_seed`: stored for diagnostics and reproducible tests

### `matches`

- `id`: UUID
- `round_id`: foreign key
- `court_number`: positive integer unique within the round
- `team_a_player_1_id`, `team_a_player_2_id`
- `team_b_player_1_id`, `team_b_player_2_id`
- `team_a_games`, `team_b_games`: nullable non-negative integers
- `result_type`: `pending | played | missing`
- `result_locked_at`: nullable timestamp

### `round_participation`

- `round_id`: foreign key
- `player_id`: foreign key
- `status`: `playing | sitting_out`

This table records eligibility and sit-outs explicitly so late arrival and early departure do not distort historical fairness.

### Derived views or queries

- Player wins and game difference
- Partnership frequency by unordered player pair
- Opponent frequency by unordered player pair
- Sit-out count while eligible
- Current assignment by player

## Technical Architecture

### Runtime

- TypeScript throughout
- React client built with Vite
- Cloudflare Worker providing authenticated and public HTTP APIs and serving static assets
- Cloudflare D1 relational database
- Cloudflare Wrangler for local development, migrations, secrets, and deployment

### API boundaries

- `/api/admin/*`: authenticated organizer operations
- `/api/public/events/:slug/*`: read-only public event data
- Public mutation endpoints do not exist.
- State-changing organizer operations validate both authentication and current event/round state on the server.

### Consistency

- Round generation and insertion of its matches and participation rows occur in one atomic database batch.
- Completing results and locking the previous round before publishing the next round occur atomically.
- Public data is always derived from committed database state.
- Client-side optimistic updates must not display a mutation as saved until the server confirms it.

## Security Model

- The organizer password is supplied as a Cloudflare secret and is never stored in source control or D1.
- Authentication creates a signed, time-limited session in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- Login attempts are rate-limited by IP and progressive delay.
- All organizer mutations require CSRF protection in addition to the authenticated cookie.
- Public event URLs use unguessable slugs and expose only active, non-archived events.
- Archived or unknown slugs return the same generic unavailable response.
- Inputs are length-limited, normalized, validated server-side, and safely rendered to prevent injection.
- Permanent deletion cascades through all event-owned records and requires explicit name confirmation.
- No email address, birth date, phone number, or other personal profile data is collected.

## Reliability and Error Handling

- Full offline operation is explicitly not supported.
- A lost or weak connection produces a clear German error with a retry action.
- Unsaved form values remain in the browser after a failed request so the organizer can retry without retyping.
- Every successful mutation displays a positive saved state.
- Duplicate submissions use idempotency protection or current-state validation.
- Refreshing the organizer page reconstructs the authoritative event, round, and timer state from the server.
- Timer accuracy is based on server timestamps, not on a continuously running browser process.

## Performance and Scale

- Maximum 50 registered players per event
- Maximum 13 courts per round
- Expected four to seven rounds, with no fixed software limit
- Approximately one organizer writer and up to 50 concurrent public readers
- Matchmaking target: at most two seconds for 50 players
- Public event API target: server response within 500 ms under expected load, excluding client network latency
- Public mobile view target: usable on current mainstream iOS and Android browsers at 320 px width and above

## Accessibility and UX Requirements

- Organizer workflows support keyboard and touch input.
- Controls have visible labels and cannot rely on color alone.
- Score inputs use large touch targets and clear team/player labels.
- Court and assignment information is visually prominent.
- The timer shows both remaining time and explicit state (`Läuft`, `Pausiert`, `Beendet`).
- Hair-bow icons include textual or accessible numeric equivalents.
- Destructive actions are visually distinct and require confirmation.
- Empty, loading, offline, archived, and error states have explicit German copy.

## Deployment and Cost Constraints

- The initial deployment uses a free `workers.dev` address.
- The application uses Cloudflare Workers Free and D1 Free.
- No paid plan is activated automatically; upgrading requires an explicit owner action.
- The expected event load is far below the documented free limits.
- A custom domain is not required for the initial release.
- Deployment documentation must cover account creation, D1 creation, migrations, secret configuration, deployment, and rollback to the previous Worker version.

## Testing and Acceptance

### Matchmaking tests

- Produces structurally valid matches for all active-player counts from 0 through 50.
- Uses no more than the selected number of courts.
- Balances sit-outs across repeated rounds.
- Never repeats a partner when a zero-repeat solution exists in the tested scenario.
- Minimizes partner repetitions before considering opponent repetitions.
- Minimizes opponent repetitions before leaderboard proximity.
- Uses leaderboard proximity only after repetition priorities are equal.
- Produces reproducible results when given a fixed seed.
- Discarded rounds have no effect on future schedules.

### Scoring tests

- Credits both winning teammates with one win.
- Computes game difference for all four players correctly.
- Rejects negative, fractional, malformed, and drawn played scores.
- Accepts the explicitly confirmed missing `0–0` outcome.
- Preserves shared ranks for equal wins and game difference.
- Locks earlier results when the next round is published.

### Workflow tests

- Covers create event → lobby → publish → start → pause/resume → results → next round → archive.
- Covers late arrival, early departure, insufficient players, excess players, and court-count changes.
- Covers regeneration before start and rejection of regeneration after start.
- Confirms archived events are inaccessible publicly but visible to the organizer.
- Confirms permanent deletion removes the event and all dependent data.
- Confirms failed writes retain user input and can be retried.

## Out of Scope for the Initial Release

- Participant accounts, self-registration, or result submission
- Multiple organizers or role-based permissions
- Full offline operation
- Real-time push updates; public pages refresh manually
- Payments, entry fees, or prizes
- Full tennis sets, tie-break scoring, or point-by-point scoring
- Knockout brackets, fixed teams, singles, or league scheduling
- Automated court hardware or display-board integrations
- Native mobile applications
- Email, SMS, or push notifications

## Confirmed Implementation Decisions

- The first release has no unresolved product decisions.
- Minor visual details, exact German microcopy, and the size of the bounded matchmaking search may be refined during implementation as long as they preserve this specification and its acceptance criteria.

## Research Findings

Hosting options were compared using official provider documentation on 24 June 2026.

- Cloudflare Workers Free documents 100,000 Worker requests per day, with static asset requests free and unlimited.
- Cloudflare D1 Free documents 5 million rows read per day, 100,000 rows written per day, and 5 GB total storage.
- The free limits are sufficient by several orders of magnitude for one organizer, 50 participants, and a small number of rounds.
- Cloudflare's integrated Worker and D1 deployment avoids operating a traditional server or coordinating separate hosting and database providers.
- Vercel Hobby plus Supabase Free is a viable alternative, but it introduces a second provider and Supabase Free projects can pause after a week of inactivity.

Official sources:

- <https://developers.cloudflare.com/workers/platform/pricing/>
- <https://developers.cloudflare.com/d1/platform/pricing/>
- <https://vercel.com/docs/plans/hobby>
- <https://supabase.com/pricing>
