# Soul Link Match Server

Cloudflare Workers Free + SQLite Durable Objects implementation for the first
private two-player test. It is deliberately separate from the Godot export and
the local admin UI.

## Runtime flow

1. The Godot web client signs in anonymously with Supabase.
2. Authenticated HTTP calls create or join an eight-character invite room.
3. The client requests a 45-second, one-use WebSocket ticket.
4. A room Durable Object owns readiness, turns, boards, HP/MP, skills, timeouts,
   reconnect snapshots and the final result.
5. A new room freezes the currently published `game_catalog` document. Admin
   changes therefore apply to later rooms without changing battles in progress.
6. Completed results are written only when the optional service-role Worker
   secret is configured. The secret never belongs in Git or the game client.

## Required bindings

- `SUPABASE_URL`: Worker variable, configured in Cloudflare only.
- `SUPABASE_PUBLISHABLE_KEY`: Worker secret/variable, configured in Cloudflare only.
- `SUPABASE_SERVICE_ROLE_KEY`: optional Worker secret for result persistence.
- `ALLOWED_ORIGINS`: comma-separated exact origins. Localhost is the checked-in
  development default; add production origins in Cloudflare, not source.

No R2, paid plan, payment method or usage-based fallback is required. The global
admission object caps room creation at 200 per UTC day and applies per-IP request
limits. Reaching a cap fails closed.

## Commands

```powershell
npm install
npm test
npm run dev
```

Do not deploy until `npm test` and the repository checks pass. Cloud deployment
must use the Free plan and the SQLite storage declarations in `wrangler.jsonc`.
