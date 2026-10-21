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
