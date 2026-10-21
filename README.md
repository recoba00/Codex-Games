# Codex Games

Multi-game source repository: https://github.com/recoba00/Codex-Games

```text
Codex-Games/
  .github/workflows/       Game-specific checks and future deployment workflows
  soullink/               Soul Link Godot source, assets, tools, and documentation
```

Add future games as sibling folders with their own instructions, tests, build
settings, and hosting resources. No other local games have been imported.

## Soul Link

- Local checkout: `C:\Users\user\Desktop\my\Codex-Games\soullink`
- Open `soullink/project.godot` with Godot 4.7.2.
- Project instructions: [soullink/README.md](soullink/README.md).
- Repository handoff: [soullink/docs/REPOSITORY.md](soullink/docs/REPOSITORY.md).

Run portable checks from the repository root:

```powershell
node --test soullink/tests/host.test.cjs soullink/tests/audio.test.cjs soullink/tests/intro.test.cjs soullink/tests/catalog-seed.test.cjs
```

## Delivery Boundaries

The Soul Link GitHub Actions workflow runs those checks on matching pushes and
pull requests. It has no deployment credentials and does not deploy anything.
Local file saves are not automatically committed or uploaded.

The intended next stage is verified code -> GitHub -> Cloudflare, with Supabase
for persistent data and R2 for media. Cloud resources and authenticated admin
access still need to be configured and verified. A source deployment must not
overwrite live character/skin records or player data.

Godot builds, `.ait` packages, local publication history, backups, dependencies,
and secrets are not source files. They are excluded from Git. App-store and Toss
client releases remain separate from backend and content publication.
