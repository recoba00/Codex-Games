# Free Test Infrastructure

## Cost Boundary

Soul Link's first online 1:1 test must remain at zero monetary cost.

- Use Cloudflare Workers Free and SQLite-backed Durable Objects Free only.
- Use one Supabase Free development project named `soullink-dev`.
- Do not add or save a payment method for this test.
- Do not enable Workers Paid, Supabase Pro, compute add-ons, R2, paid domains, or
  any marketplace/integration that can create a charge.
- Do not implement an automatic paid fallback. If a free quota is exhausted,
  reject new rooms or pause the test and report the exhausted quota.
- Secrets stay in provider/GitHub secret stores and never enter Git, client
  builds, logs, screenshots, or chat.

These constraints are release blockers. Any future paid resource requires a new,
explicit user approval that names the product and expected cost.

## First Test Scope

The first playable online milestone is a private two-player guest match:

1. One player creates a short-lived invite code and the other joins it.
2. The authoritative room validates readiness, turns, puzzle actions, MP/HP,
   skills, timeouts, reconnects, and the final result.
3. Clients render animations but cannot submit final damage or victory values.
4. Supabase stores the minimum match result and public character configuration;
   it is not queried for every puzzle animation or frame.
5. Local two-browser testing comes first, followed by PC-and-phone testing.

Public matchmaking, ranked tiers, Toss identity linking, ownership/economy, and
large-scale load tests are intentionally outside this first free milestone.

## Guardrails

- Add an application-level room cap and per-IP create/join rate limits before a
  public URL is shared.
- Use WebSocket hibernation and event-driven deadlines. Do not keep one timer or
  continuously running process alive for every idle room.
- Keep catalog polling out of the match hot path and cache public configuration.
- Record daily request/connection/storage usage during tests. Stop expanding the
  test group when a free threshold is close; never switch plans automatically.
- Cloud deployment must run only after the game-scoped GitHub checks pass.
- Database migrations deploy schema only and must not reset live test records.

## Account Checklist

Before creating resources, verify in each dashboard:

- The selected Cloudflare Workers plan is Free.
- The Durable Object namespace uses the SQLite backend.
- The selected Supabase organization and project are Free.
- No paid compute size, add-on, custom domain purchase, or payment confirmation
  is part of the flow.

Stop before any screen that requests payment details or confirms a paid plan.

## Supabase Development Project

- Project: `soullink-dev`
- Plan/compute: Free / Nano
- Region: Northeast Asia (Tokyo), `ap-northeast-1`
- Source migration: `supabase/migrations/20261021010000_initial_online_test.sql`
- Storage bucket: `soullink-content`, public read, server-only write, 8 MiB per image

The migration was applied to the Free project through the SQL Editor on
2026-10-21 and returned success. The dashboard was then checked for all four
tables and the public bucket, including its one read policy, MIME allowlist, and
8 MiB object limit. Because this first application used the SQL Editor, it does
not appear in Supabase's separate CLI migration history. Future schema changes
must use versioned migration files and must not replay or reset live data.

The initial schema keeps profile edits scoped to the signed-in user. Catalog
publication, skin grants, and match result writes are server-only. Match
participants may read their own results. No project password, secret key, project
identifier, or connection string belongs in Git.

Anonymous sign-ins were enabled and saved on 2026-10-21. Anonymous sessions use
the `authenticated` role, so the same RLS policies continue to restrict profile,
skin, and match-result access. The Cloudflare email-verification gate was also
cleared. Catalog schema version 3, revision 1 was published as the current
`game_catalog` document. No service-role key, paid feature, payment method, or
client-side provider credential was added.

## Authoritative Match Worker

The first Worker implementation lives in `server/`. It uses two declarative
SQLite Durable Object exports: one object per invite room and one small global
admission gate. The room owns readiness, deterministic boards, move validation,
repeatable MP skills, strikes, HP/MP, turn alarms, reconnect snapshots, forfeits
and results. WebSockets use the Hibernation API, and clients receive one-use
45-second tickets instead of placing Supabase access tokens in URLs.

New rooms read and freeze the published Supabase catalog, so admin character and
skin changes apply without a game rebuild while active rooms remain stable. The
Worker refuses gameplay until its Supabase URL and publishable key are configured.
Result persistence is separately disabled until a service-role Worker secret is
explicitly approved and added. The checked-in localhost origin list is for local
testing only; production origins belong in Cloudflare configuration.

The Free Worker is live at `https://soullink-match.recoba00.workers.dev` and is
deployed automatically from `main` with repository root `/soullink/server`.
Dashboard runtime variables are retained across Wrangler deployments with
`keep_vars`; only the two SQLite Durable Object bindings and origin/Supabase
runtime variables are configured. No R2 or paid binding is present.

On 2026-10-21, server tests passed 11/11 and the dry-run bundle was 42.54 KiB
(11.14 KiB gzip). A live Godot Web client completed anonymous authentication,
room creation, ticket exchange and the lobby transition from one to two players.
An independent two-socket check then confirmed both seats received the same
`battle` phase after readiness. Commit `66db5f5` deployed automatically and is
the first version with ticket-authenticated WebSocket upgrades routed before
ordinary bearer authentication.

Godot now renders the authoritative room snapshot through a remote-battle
adapter. Regardless of server seat, the local player is visual side 0 and the
opponent is visual side 1. The existing HUD receives server HP, MP, boards,
rounds, deadlines and results. Puzzle paths, repeatable MP skills, turn commits
and forfeits are sent as WebSocket actions; skill and strike receipts drive the
existing impact presentation. The client does not calculate or submit final
damage. The separate one-use spell is explicitly disabled online until it has a
server rule.

The adapter has seat/result/action regression coverage. Godot core checks now
pass 14,681 assertions, alongside the 11 Worker and 5 host checks. A live mobile
Godot Web client and an independent automated socket opponent completed a real
room flow: ready, server-authoritative puzzle match, 41 MP active skill with a
40 MP cost, 156 skill damage, strike receipts, opponent turns and an eight-round
victory result. No browser warnings or errors were observed.

The client persists its room code with the anonymous session, refreshes stale
access tokens while retaining the original room action, and reconnects dropped
sockets with a capped 1/2/4/8-second backoff. A live two-player battle was
reloaded in round 2 and returned to the same room, HP 927/882, local puzzle turn,
and authoritative state with no browser warnings or errors.

The remaining milestone work is durable result persistence. Persistence stays
disabled until a service-role Worker secret is separately approved. A public
game-host URL must also be verified separately; the Worker URL is an API
endpoint, not the game page.
