# Godot Preview Deployment

Public preview: http://recoba00.dothome.co.kr/games/soullink/

**Hold: monthly traffic exhausted.** The current combat-v2/admin work is local
only. Do not run the remote browser/download commands below until the owner
restores traffic and agrees on a transfer budget. Use localhost:5175 instead;
`CHARACTER_ADMIN.md` covers the local build workflow. The public admin is not
deployed. See the 2026-10-20 traffic incident section below for recovery details.

FTP target: `/html/games/soullink/`. Never deploy into the parent game directory
or touch another game's files. Credentials must exist only in process environment
variables `DOTHOME_FTP_USER` and `DOTHOME_FTP_PASSWORD`, never source or artifacts.

## Build And Verify

```powershell
powershell -NoProfile -File tools/run-godot.ps1 -Mode web
powershell -NoProfile -File tools/run-godot.ps1 -Mode pack
node tools/package-web.cjs
node tools/web-check.cjs
```

`build/deploy/release.json` is a LOCAL deployment allowlist, not a public upload.
Only its 36 allowlisted runtime files are uploaded, including the audio bridge
and 15 audio sidecars. Versioned `releases/godot-HASH/` folders
prevent an old running game from mixing with a new pack/engine. The root HTML
selects the release using a base URL. No source, credentials, docs or QA output
are published. Current/backed-up releases are preserved, not recursively pruned.

## Stage Before Publishing

With the environment variables supplied securely, run the Python deployment
helper using the available Python runtime:

```powershell
python tools/deploy-dothome.py stage
node tools/web-check.cjs THE_EXACT_STAGED_URL_PRINTED_BY_STAGE
python tools/deploy-dothome.py publish
node tools/web-check.cjs http://recoba00.dothome.co.kr/games/soullink/
```

The helper validates the exact FTP path, file allowlist and local hashes. It
uploads to temporary files, reads bytes back and renames them. `publish` requires
a successful browser report for the exact staged release and reads runtime
files back again before changing the main HTML last. It also requires the host
visibility/back checks, turn/AI/effect feedback checks and gzip response checks.
Audio decoding, actual combat sounds, persisted settings and hidden silence are
also required. Cinematic full-cycle/loop, no pre-entry audio, SKIP and the real
loading readiness gate are required as of GODOT-002D.
A reload must not replace an original gzip response with cached
304 headers in the transfer evidence.
The old root HTML is kept
as `index.backup-UTCSTAMP.html`. Keep those files for recovery; rollback must
select and verify an existing release, not delete unrelated files.

QA adds `?qa=1` to opt into read-only engine snapshots; normal visits expose no
snapshot. The host bridge accepts fixed visibility/back events and validated
safe insets, not arbitrary commands or executable input. Browser checks include actual input,
AI, central turn banners, visible AI swaps, effect timeline events, a full
15-second timeout, clean-context startup and canvas/safe-area layouts.

## Home Screen And Limits

- Manifest scope/start URL/identity remain `/games/soullink/`, not a release URL.
- Existing approved app icons are reused; standalone and Apple home-screen meta
  tags are included. The shell fits its canvas inside CSS safe-area insets.
- Safari: Share, Add to Home Screen, enable Open as Web App when available, Add,
  then launch the resulting icon. Physical installation is not verified here.
- HTTP remains the user's requested public URL. Chromium correctly rejects
  promoted secure PWA installation on this origin. No service worker, offline
  cache, push, secure-context spoofing or forced browser security flags are used.
- The single-thread Web engine uses Dummy. GODOT-002C uses one ordinary Web Audio
  context after a real gesture for BGM/effects on HTTP and Toss; no secure-only
  AudioWorklet is invoked. This remains an online preview, NOT a production Toss
  or full PWA release. See `docs/AUDIO.md` for sources, storage and playback limits.
- Each release owns an Apache `.htaccess`, raw JS/PCK fallback and checked gzip
  copies. The immutable WASM pair may reuse a byte-identical preserved release
  through internal rewrite (see below). Only that release directory gets changes;
  never change the server root or another game. Actual Dothome responses now
  advertise `application/wasm`, `Content-Encoding: gzip` and `Vary: Accept-Encoding`.
- Engine/pack/JS transfer is 18,054,446 bytes, down from 47,648,785 bytes, about
  62%. Stored bytes are larger because fallback and gzip files are both retained.
  This is not a guarantee of a mobile startup time or memory budget. Actual Toss
  hosting/compression and official upload limits still need console/device checks.
- Audio sidecars total 2,805,099 bytes; BGM is loaded when first needed. The sum
  of all music/effects and gzip engine/pack/JS is 20,859,545 bytes, excluding intro
  and runtime/icon files; it is not a claim that both music tracks block boot.

## Abandoned Stages

An FTP 451 interrupted the audio upload. Before retrying, the unused
`godot-3448ad48963d10a4` staging candidate (64,263,274 bytes) was byte-compared
with its complete local mirror and discarded. No current or backup HTML
referenced it. A failed 32,149,504-byte upload temporary was removed only after
verifying it was an exact prefix of the still-present complete local WASM.
The retry then uploaded all runtime files successfully.

`discard-unused-stage --discard-release ID` is explicit, not an automatic prune:
it rejects current/backed-up/shared-engine identities, unknown files/directories and mismatched
recovery bytes. The local recovery folder and `artifacts/discard-unused-stage.json`
remain. All published versions and root HTML backups are preserved. Future space
pressure may need hosting expansion; never remove published history implicitly.

## Immutable Engine Reuse

The intro upload initially hit FTP 451 after 29,542,961 bytes in the unpublished
`godot-05df6c5f25d30d0d` candidate. Its two complete files and one exact-prefix
temporary, plus known empty staging subdirectories, were validated and removed.
No published release or HTML backup was removed.

`node tools/package-web.cjs --reuse-engine godot-8f475b442510ea2c` produces a full
local recovery mirror but aliases only `index.wasm` and `index.wasm.gz` to the
byte-identical engine in the preserved release. The FTP helper checks both source
files against the new local mirror before skipping duplicate uploads. Per-release
Apache internal rewrite serves the old immutable bytes at the new URLs; browser
QA must still confirm the actual gzip response and functioning engine. This saves
49,668,564 stored bytes without changing download size or deleting any history.
The old engine release is now a required dependency, not disposable history;
the discard helper also checks every release's `.htaccess` dependency references.
Toss remains self-contained and does not use this HTTP-host storage optimization.

References: [Apache internal rewrite](https://httpd.apache.org/docs/2.4/mod/mod_rewrite.html).

2026-10-20 published release: `godot-1b26e8c9a2f9e900`, 41 logical files,
73,204,120 total runtime bytes / 23,535,556 newly stored bytes after WASM reuse.
Engine/pack/JS gzip transfer: 18,074,535 bytes. Intro sidecars: 2,924,242 bytes;
audio remains 2,805,099 bytes. GODOT-002E adds the supplied app icon v2/five puzzle
textures, gold HP healing, MP-funded repeatable skills, enlarged rounded portrait
cut-ins, full-page results and intro menu BGM. Original movie audio stays stripped.
VFX/puzzles/character art stay inside the PCK; audio and cinematic assets are local
sidecars, not third-party media services.
GODOT-002F replaces just the five puzzle textures with the latest supplied
transparent emblems. App/home icons, portraits, effects and rules are unchanged.
GODOT-002G changes only the title video fit and browser audio delivery, with the
same Godot PCK. Intro BGM starts before engine readiness and uses native buffer
looping; gameplay preferences return on entry. The full source video is contained,
not cropped. Previous public `godot-a6557a24182a8631` is retained for recovery.

The user explicitly approved retiring old Soul Link history to free space while
keeping the current and immediate recovery releases. `tools/prune-deployments.py`
retired only oldest `godot-e4ea82872310c52d` and its one root HTML reference after
all ten remote files (45,868,325 bytes) matched the local mirror and a verified
recovery ZIP. Shared-engine references and other games are protected. Recovery:
`build/hosting-backup/godot-e4ea82872310c52d.zip`, hash/receipt:
`artifacts/prune-godot-e4ea82872310c52d.json`. Previous public `godot-357da2b9d3767709` and
engine source `godot-8f475b442510ea2c` remain. Two unpublished intermediate
GODOT-002E candidates were also byte-verified and discarded, not published history.
For GODOT-002G, one further old release `godot-085ad0356729c55b` and its root
backup were retired under the same user approval after byte comparison and ZIP
verification: 61,725,566 bytes / 15 files, recovery
`build/hosting-backup/godot-085ad0356729c55b.zip`, receipt
`artifacts/prune-godot-085ad0356729c55b.json`. Current/previous public releases,
the shared engine and other games were untouched.
Evidence: `artifacts/deploy-publish.json`, `web-staging-report.json` and
`web-live-report.json`; these are local verification artifacts, not public assets.
## Hosting Hold: 2026-10-20

At 09:20 UTC, the public origin returned HTTP 302 to Dothome's monthly-traffic
exhaustion guide. The game path was appended incorrectly by the host:
`https://guide-page.dothome.co.kr/traffic_monthly.htmlgames/soullink/`, which
explains the mobile Not Found screenshot. The root redirects to the valid
`https://guide-page.dothome.co.kr/traffic_monthly.html` guide. This is a hosting
quota block, not evidence of a missing Godot file; do not rebuild/reupload or
delete releases to try to reset monthly transfer usage.

Remote full-browser validation repeatedly downloads the engine/media and consumes
the account's transfer allowance. Stop those runs while blocked. Prefer full QA
locally; after account recovery, establish the remaining allowance and obtain
agreement on a bounded staging/live download budget before running remote suites.
Small header-only probes are sufficient to identify this redirect. Do not switch
to an uncompressed origin or bypass the provider's account restriction.

Dothome's guide says the allowance resets on the first of each month at 00:00;
earlier recovery requires the owner to add/charge traffic or change the hosting
service in My Dothome. No purchase or account change has been made.
The last verified upload remains `godot-1b26e8c9a2f9e900`; its earlier live test
passed before this subsequent host-wide block. Current public access is unavailable.

