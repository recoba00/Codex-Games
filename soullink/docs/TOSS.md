# Apps-in-Toss Preparation

## Current State

- User-confirmed console appName: `soullink`.
- Isolated host project: `platform/toss/`, SDK/Devtools 3.8.1, Vite 8.3.4;
  Node 24.12.0 was used. Lockfile is retained. No React game rewrite.
- Godot engine/PCK are packaged directly into the same origin; no iframe, remote
  Dothome game embedding, external game redirects or migration of Phaser runtime.
- `platform/toss/soullink.ait`: 24,735,902 bytes, official reader preflight passed.
  Deployment ID `01a1592c-9fc7-76b6-b437-3ac1e8b326d8`.
  Includes GODOT-002E gold healing, user puzzle/app art, enlarged rounded portrait
  effects/results and intro BGM. Matches the current Godot output, 15 verified
  audio sidecars and five intro assets (35 bundle entries). Inline media is
  explicitly enabled; autoplay user-action requirement is disabled in host config.
  GODOT-002F updates only the five supplied transparent puzzle emblems; the
  approved character app icon, portraits and combat rules are unchanged.
  GODOT-002G fits the complete video on all screen ratios and bootstraps always-on
  intro BGM before Godot loads. Decoded music loops without media-element seeks;
  gameplay mute/volume is restored on entry. Browser autoplay policy still applies.
  COMBAT-ADMIN-001 includes combat-v2 baseline strikes/post-match skill choice,
  configurable passive templates and reshape. Local admin itself is NOT shipped.
  Official Devtools mock safe-area/back/AI/audio checks passed on this output;
  the Dothome public preview remains held for exhausted monthly traffic.
  STATS-001 adds schema-2 character stats, shared definitions and neutral-default
  defense/crit/all-damage reduction; current character balance stays unchanged.
  `CHARACTER_STATS.md` records the formulas and future growth/equipment hooks.
- Official Devtools runs the game and exercises SDK SafeArea/back subscriptions.
  This is a mock environment. No console upload, QR launch, approval or real
  iPhone/Android startup/memory claim has been made.

## Rebuild

From the Godot project root, after making changes:

```powershell
powershell -NoProfile -File tools/run-godot.ps1 -Mode web
node tools/package-toss.cjs
npm --prefix platform/toss ci
npm --prefix platform/toss run build
node tools/toss-preflight.cjs
node tools/toss-check.cjs
```

For manual local development: `npm --prefix platform/toss run dev`, then open
`http://127.0.0.1:5174/`. Godot still owns the game rules/UI and F5 workflow; this
project only prepares its Web output for the host. Browser automation starts an
ephemeral Vite server and closes it afterward.

`build` includes an unsigned-artifact path fix: CLI 3.8.1 on Windows uses native
backslashes in nested ZIP entries. `tools/finalize-toss.cjs` uses the official
Reader/Writer to normalize separators, preserving metadata/deployment identity/
permissions. It refuses signed artifacts. Do not upload an unfinalized Windows
CLI output or edit SDK node_modules. Preflight re-reads all important assets
and rejects backslashes, `.import`, docs/tests/secrets and external game origins.

The 24MiB compressed and 64MiB raw preflight budgets are OUR provisional budgets,
not official Toss upload limits. Check console acceptance and actual device
download/compilation/memory before expanding the asset set.
GODOT-002D increases the compressed project target from 20 to 24 MiB to include
the user's optimized 8-second silent intro, logo and poster locally. See `INTRO.md`.
GODOT-002E additionally includes the user's puzzle art/app icon and enlarged
rounded portrait/result presentation; the current `.ait` is about 24.7 MB.
The first film is skippable immediately; playback is not a fabricated loading
duration. Engine startup proceeds concurrently and entry still waits for readiness.
The original film audio remains removed, while CC0 menu BGM now accompanies the
intro. WebView `mediaPlaybackRequiresUserAction` is false; a normal browser may
still require the music button/first touch. Saved mute/volume remain respected.

## Host Contract

- Common `web/host-bridge.js` is loaded before Godot. Native builds are unchanged.
- GDScript connects one retained JavaScriptBridge callback; it consumes only
  JSON visibility/back/close-error messages. QA snapshots use a direct method
  and JSON, not JavaScript eval of incoming strings.
- `SafeArea.get/subscribe` updates CSS custom properties. CSS takes the maximum
  of SDK and environment safe areas; Web skips Godot's native inset pass.
- `graniteEvent.backEvent` opens/cancels game leave confirmation, or asks to exit
  from preparation. `homeEvent` and page visibility suspend game time. Manual
  pause is independent and survives back cancellation.
- During the startup cinematic, back skips to the title instead of opening a
  hidden game modal. From the title it requests host close. After entry the
  existing game confirmation flow applies. Hidden host/page pauses the movie.
- Exit confirmation calls `Screen.close` once, with an 8-second local timeout
  and no automatic retry. SDK subscriptions are released when leaving; bfcache
  preserves them. No polling, login, personal data, permissions, ads or payments
  are added in this milestone.
- SDK code is bundled only for Toss. The Dothome HTTP preview does not attempt
  native SDK calls and remains online-only; it is not the Toss release host.
  Both Web hosts use the same gesture-unlocked audio bridge, not the engine
  AudioWorklet mixer. The official mock verifies audio signal, volume/mute
  persistence and hidden-context silence; device audio focus is still unverified.

## Next: GODOT-003C

The current bundle includes the live character/skin loader and gallery, but
`data/live.json.catalog_url` is intentionally empty until an actual HTTPS content
host is selected. Preflight explicitly reports this as unconfigured, not ready
for production live operations. The official Devtools mock tests cross-origin
catalog loading against a temporary local endpoint and native back from gallery.
Configure/test the real HTTPS URL and rebuild the client once before relying on
later no-build content publications. Remote content remains subject to platform
policies/review; new runtime logic still needs an app update. `LIVE_CONTENT.md`
defines this boundary. Foreground content polling is separate from the event-
driven SDK host integration described above.

1. Upload the verified `.ait` to the `soullink` app's version/testing page.
2. Use its generated QR/private link to open it in the actual Toss app. Do not
   assume SDK 2.x sandbox instructions apply to SDK 3.x.
3. Verify first usable screen within the current official 10-second guideline
   on target devices; measure cold/warm starts and low-end memory separately.
4. Test native close, system back, cancel, home/background/foreground, full-screen
   safe areas, portrait/rotation and pointer/touch release while interrupted.
5. Audit user identity/save, sound controls, SDK/license notices, approved content
   and the entire release checklist before requesting publication. No real
   payments/ads or production release are authorized by this build procedure.

## Official References (2026-10-20)

- SDK 3.x config/Devtools:
  https://developers-apps-in-toss.toss.im/documentation/integration/sdk-3.x.md
- WebView configuration:
  https://developers-apps-in-toss.toss.im/documentation/integration/props.md
- SafeArea API:
  https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/safearea/getsafeareainsets.md
  https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/safearea/safearea.subscribe.md
- Native back/home:
  https://developers-apps-in-toss.toss.im/documentation/sdk/events/graniteevent.md
- Game checklist (first screen, safe area, saving, secure APIs, exit):
  https://developers-apps-in-toss.toss.im/checklist/app-game.md

Evidence is local under `artifacts/`: `toss-preflight-report.json`,
`toss-devtools-report.json`, `toss-devtools-back.png`, `toss-devtools-battle.png`.
