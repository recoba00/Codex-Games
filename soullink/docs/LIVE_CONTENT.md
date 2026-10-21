# Live Character And Skin Content

## Delivery Contract

One client build must first ship this loader and a fixed HTTPS catalog URL.
After that, names/stats and characters built from supported skill/passive
templates, plus their static skin artwork, can be published as server data.
This does not implement arbitrary remotely supplied code. New effect templates,
UI, mechanics, stats with new behavior or a different network contract still
need a client update. Remote delivery is not an exemption from platform policies.

- Toss: new app bundles go through review/approval/release. Post-release content
  is also subject to review. https://developers-apps-in-toss.toss.im/guide/operation/deploy
- Steam: keep a shared data schema, but prefer shipping new content files through
  Steam updates as Valve instructs. An eventual Steam-specific asset delivery
  policy must be tested; no published Steam integration is claimed here.
  https://partner.steamgames.com/doc/store/updates

## Local Operation

```powershell
node tools/serve-local.cjs --lan --port 5175
```

- Game: `http://localhost:5175/games/soullink/`
- Admin (this PC only): `http://localhost:5175/admin/`
- Public catalog: `http://localhost:5175/content/catalog.json`
- Public images: `/content/assets/<immutable-image-id>`

The local preview automatically discovers this endpoint for localhost/private
LAN origins. F5/debug native builds default to localhost:5175. Catalog data is
available to LAN game clients but the admin remains loopback-only.
The initial public catalog is seeded from source defaults when the content
store is first created. Later draft saves do not modify that public snapshot.

The content service can run independently of the game download server:

```powershell
node tools/serve-content.cjs --port 5180
```

It binds loopback only. For real hosting, run it persistently with an HTTPS
reverse proxy which forwards ONLY `/content/`; deny `/admin/` and every other
path. Keep operator access on a trusted private connection/SSH loopback tunnel.
Use the same forwarded local port as the server port for exact Host checking.
Public/multi-user admin login/roles are deliberately not implemented and the
current admin must never be made public by weakening its Host/peer checks.

`SOUL_CONTENT_DIRECTORY` optionally moves published state/media/history to a
persistent volume for the standalone service. Source drafts and their backups
also need persistent storage and operator backups; this is a single-process
file-backed service, not a horizontally replicated database.

Before the first production client build, set `data/live.json.catalog_url` to
`https://<owned-host>/content/catalog.json`. Web hosts can provide the equivalent
trusted `window.SOUL_CONTENT_URL` setting before engine start. Native test runs
also support `--content-url=<url>`. There is no end-user URL query override.
Public release configuration must not point to localhost or insecure HTTP.
`poll_seconds` is bounded to 5-300 seconds; the default is 10.

**Current state:** no external HTTPS content host has been chosen/deployed.
Dothome's exhausted traffic is NOT repaired by this service. Ordinary shared
hosting must not be assumed to support a persistent Node process. Public HTTPS,
backups, monitoring, real device CORS/TLS and platform deployment remain work.

## Files And Safety

- Draft source: `data/game.json`, normalized schema 3, retaining old schema input
  compatibility. `data/stats.json` is the shared stat registry.
- Published snapshot/media/history: `build/live-content/` by default. These are
  excluded from Godot/PCK/Toss export. Back up the whole directory and drafts.
- `catalog.json` only exposes enabled characters/skins plus a versioned asset
  manifest and combat tuning. Static filenames use a content hash. Public GET
  routes cannot mutate state and never list the project/backups/draft uploads.
  Once-published immutable images remain readable for old snapshots; hiding a
  skin removes it from the current catalog, not from existing client caches.
- Save/publish uses a same-origin per-process admin token, bounded request bodies,
  a single mutation lock and optimistic draft revision. Files are replaced
  atomically. Old public snapshots and old source drafts are retained separately.
- Skin records have exactly `name`, `image`, `enabled`. Gameplay fields are
  rejected on both server and client. A default skin must exist and be enabled.
- Registered images are raster PNG/JPG/WebP. No arbitrary URLs, scripts, SVG or
  animated WebP. Client image load verifies bytes, SHA-256 and decoded dimensions.
  The browser re-encodes uploaded images to remove metadata and bound resolution.
- Public CORS `*` is for non-sensitive catalogs/images only; no credentials or
  player inventory belong in this API. HTTPS/TLS verification is never bypassed.
- Main game metadata validates against supported fields/bounds before applying.
  Bad/unsupported/offline responses preserve the last good or bundled catalog.
  A game cannot start with missing selected player/opponent artwork.
- An ongoing battle uses its own copied catalog and skin selection. New data is
  staged until preparation/next battle; no mid-turn retuning or forced disconnect.
- Last-good catalog and verified image bytes are cached under an endpoint-scoped
  `user://live-content/` directory. Local appearance choices live in
  `user://appearance.cfg`. These caches are not secure account ownership and do
  not make the whole web app available offline: the engine/page must still load.
  Disk image caching is bounded to 64MiB per endpoint, removing oldest images.
  Textures from characters/skins no longer on screen are released from the shared
  cache; currently displayed/preparation/battle artwork is retained.

## Verification

Run the engine/core suite, real Web/PCK export, package the preview, then:

```powershell
node tools/check-admin.cjs
node tools/check-live-content.cjs
```

The latter uses an isolated temporary content store and approved artwork reused
as test uploads. It publishes while the real exported game stays open, checks
the PCK hash/no build/no reload, new character registration, hidden drafts,
uploaded skin selection, four viewport layouts, unchanged combat strength,
mid-battle staging/next-match application, retired skin fallback, rejected schema,
network failure, persistent last-good reload, and the actual admin upload form.
Reports/screenshots are in `artifacts/live-content/`. Test costumes are not actual
new illustrations. External hosting, physical devices and store release are not
covered by this local test.

2026-10-20 evidence: 47 integration checks passed, including native Godot HTTP
transport/image decoding and real cross-origin Web loading. Core: 14,660 checks;
admin: 50 checks; Node: 20 tests. The exported game and PCK smoke, GPU combat,
full Web duel and official Toss Devtools mock passed. Preview release is
`godot-053abd8c30767269`; the `.ait` is 24,758,347 bytes. Production content hosting
is unconfigured and this bundle has not been uploaded to the Toss console.
