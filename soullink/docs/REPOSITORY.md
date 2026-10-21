# Repository Handoff

## Canonical Checkout

- Remote: `https://github.com/recoba00/Codex-Games.git`
- Game directory: `soullink/`
- Local game: `C:\Users\user\Desktop\my\Codex-Games\soullink`
- Existing source remains at `C:\Users\user\Desktop\my\soul` as a preserved
  pre-import copy. It is not linked or automatically synchronized with Git.
- The abandoned `C:\Users\user\Desktop\my\Games` staging copy was not pushed.
  Do not resume work there or send changes to `recoba00/Games`.

Use this checkout for subsequent Git-managed development. The original Godot
editor/project and any already-running preview keep their original path until
explicitly reopened/restarted from this checkout. A save in the old folder will
not reach this repository. Do not merge the two folders automatically.

The old Phaser reference remains outside this repository at `../../soul-link`.
Historical asset preparation and rendered QA tools may still require the
original desktop sources, local Godot installation, ffmpeg, or bundled Codex
runtime libraries. They are not claimed to be portable CI checks.

## What Is Uploaded

Source, approved runtime assets and their licenses, data defaults, documentation,
test fixtures, tooling, and the Toss dependency lockfile are versioned.
The six currently registered base/school artwork files are preserved by content
hash under `assets/catalog/`. The content store reads these seed files only when
an uploaded media file is absent; later uploads and live data remain independent.
Godot can also display these bundled defaults without the original upload store.
The `.godot`, `build`, `artifacts`, `node_modules`, Toss generated `public` and
`index.html`, `.ait`, credentials, and local backups are excluded. Build scripts
recreate the generated files; this is not a backup of the entire workstation.

From the game directory, prepare a new local preview using the existing tools:

```powershell
powershell -NoProfile -File tools/run-godot.ps1 -Mode import
powershell -NoProfile -File tools/run-godot.ps1 -Mode test
powershell -NoProfile -File tools/run-godot.ps1 -Mode web
node tools/package-web.cjs
node tools/serve-local.cjs --lan --port 5176
```

Do not displace an existing preview server without verifying the replacement.
The current local-only admin must not be exposed publicly.

## First CI Stage

`.github/workflows/soullink-checks.yml` runs the dependency-free host, audio,
intro, and catalog seed Node contract tests on Soul Link changes. Other games do not trigger it.
Manual workflow dispatch is also available. This does not claim engine, rendered
browser, PvP, database, or live-host verification.

Initial source commit `d62413c` was pushed to `main`. Its actual GitHub run passed:
https://github.com/recoba00/Codex-Games/actions/runs/39518756776
Local Godot import and core checks also passed (14,666 assertions / 1,338 turns).
The hosted workflow runs 19 Node checks, not the Godot or rendered suites.

Saving files is not an automatic commit or push. Finish scoped work, test, inspect
the staged diff, commit, and push. Server deployment is not configured yet.

## Next Hosting Stage

1. Create/link Free-plan-only Cloudflare and Supabase resources with the account
   owner. Apply `FREE_TEST_INFRA.md`; paid resources require a separate explicit
   approval and are not a fallback for exhausted free quotas.
2. Add authenticated admin roles, API access controls, and private server secrets.
3. Migrate file-backed catalog publication to persistent DB/media storage without
   overwriting live content on code deploys.
4. Add game-scoped preview/production deployment after successful checks; an
   independent host auto-deploy must not bypass the same validation gate.
5. Validate HTTPS/CORS, backups, restore, and a real client before public release.

Large Godot Web engine files cannot be assumed to fit Pages' per-file limit.
Choose an appropriate artifact/R2 delivery path rather than publishing the whole
local build directory. Toss/Steam/Google client release steps are separate.
