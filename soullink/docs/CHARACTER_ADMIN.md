# Character And Skin Admin

PC: `http://localhost:5175/admin/`
Game: `http://localhost:5175/games/soullink/`

Start from this project with:

```powershell
node tools/serve-local.cjs --lan --port 5175
```

Keep the process/PC running. The game can be opened on the same Wi-Fi using the
LAN address printed by the server; admin requests from LAN are rejected. Native
debug/F5 also checks this local server. Release clients need a configured HTTPS
content endpoint. This is not a public multi-user admin or a hosted backend.

## Register And Tune

1. Open 신규 등록 and choose an immutable English ID, name and starting portrait.
   A new character starts as a disabled draft with valid default values and one
   base skin. Upload its actual artwork in the base skin's 이미지 등록 field.
2. Tune HP/attack, faction/neutral, active name/type/cost/damage, passive type and
   its visible parameters. Enable 대전 활성화 when ready. At least two enabled
   characters are required; up to twelve total entries are supported.
   Shared stat controls also include defense, critical chance/total multiplier,
   and incoming all-damage reduction. `CHARACTER_STATS.md` defines units/formulas.
3. 초안 저장 writes the real `data/game.json`, preserving an earlier catalog under
   `build/config-backups/<revision>.json`. It is not browser-only storage.
   Saving does NOT change the currently published catalog.
4. Press 인게임 공개. The public catalog changes atomically without running Godot,
   changing the PCK, repackaging Toss or reloading a running game. Foreground
   clients poll every ten seconds; network/decoding can add delay. Preparation
   and an open gallery refresh automatically. An ongoing battle keeps its
   previous config/skin until returning to preparation or starting the next match.

The UI separates unsaved changes, saved drafts and the published revision.
Concurrent/stale saves/publications and mutations during a build are rejected.
The collapsed 클라이언트 빌드 section is for code/bundled fallback changes, not
normal content publishing. It does not upload Dothome or Toss automatically.

## Skins

- Each character owns a `skins` dictionary and a `default_skin` ID. Example IDs:
  `base`, `school_uniform`, `swimsuit`, `office`, with names 기본/교복/수영복/오피스룩.
- 스킨 추가 starts a hidden draft. Set its name, upload an image, enable 도감 공개,
  save the draft and publish. Hidden characters/skins/uploads are not exposed
  by the public catalog or image route.
- Images keep their aspect ratio and alpha. The browser re-encodes PNG/JPG/WebP
  to a maximum 1024px long edge; server limits are 3MiB and 64-2048px per axis.
  The upload result shows the original and encoded KiB. Hashed immutable filenames,
  actual raster headers and SHA-256 are verified. This is a fixed-quality WebP pass,
  not an image-by-image visual quality optimizer.
- A skin only contains `name`, `image`, `enabled`. Stats, skills and passives in
  a skin are rejected. Selecting a skin never changes combat strength or RNG.
- The game has a Korean 캐릭터 도감 page separate from battle. Published
  skins appear under their character and 외형 적용 updates preparation, battle
  portraits, cut-ins and results. Local appearance preferences survive reload.
  Removed/hidden selections fall back to the current default skin.
- This is catalog browsing/appearance selection, NOT an account collection,
  paid ownership, purchase validation, draws, duplicate merging or stat growth.
  Unlock rules/entitlements need a separate authenticated player backend.
- Only the original approved base artwork is shipped. Test fixtures reuse it to
  verify alternate skin names/uploads; no actual costume artwork was fabricated.

## Scope And Boundaries

- Original base artwork remains bundled for offline fallback. New artwork is
  served by the content service, not imported into a new Godot build. Arbitrary
  filesystem paths, SVG/scripts and arbitrary third-party image URLs are rejected.
- Skills and passives select tested templates; arbitrary scripts are rejected.
- HP 100–10000, attack 1–1000, MP cost 20–100, faction bonus 0–10%. Other effect
  parameters have server-side bounds; valid values are not necessarily balanced.
- Stats/defaults/bounds come from `data/stats.json`; catalog and registry bytes
  jointly identify the saved/applied revision. New stats do not require another
  hardcoded admin form. New gameplay effects still need runtime implementation.
- Loopback peer + exact localhost Host are required for admin reads. Mutations
  additionally require same-origin JSON/raster and a per-process random token.
  No hosting credentials are involved; requests have a bounded body size.
- Fixed asset routes only, no project-source directory listing. CSP blocks
  external scripts, embeds and framing. The tool is excluded from Godot exports.
- This is not multi-user authentication or a public management portal. Do not
  forward `/admin/` through a public proxy. See `LIVE_CONTENT.md` for the HTTPS
  public endpoint and protected operator access requirements.

## Verification

`node tools/check-admin.cjs` tests validation, actual temporary-file persistence,
conflict/backup handling, network restrictions and browser registration/forms.
Its build runner is a mock. `node tools/check-live-content.cjs` additionally runs
the real exported game while publishing images/characters/skins, without builds
or page reloads, and verifies safe battle boundaries and offline last-good data.
The Web/PCK build is verified separately; existing combat regressions still run.
`powershell -File tools/run-godot.ps1 -Mode combat` tests real engine UI inputs,
reshape, MP choice timing and a registered ID with selected art/template/stats.

No physical phone, real Toss release or public admin deployment is claimed.
Dothome's monthly traffic hold is documented in `DEPLOYMENT.md`.
