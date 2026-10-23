# Codex Games

Multi-game source repository: https://github.com/recoba00/Codex-Games

```text
Codex-Games/
  .github/workflows/       Game-specific checks and future deployment workflows
  soullink/               Soul Link Godot source, assets, tools, and documentation
  seongjwa/               성좌 결투 (Seongjwa Duel) server, database, and tools
```

Add future games as sibling folders with their own instructions, tests, build
settings, and hosting resources. 

## Soul Link

- Play: https://recoba00.github.io/Codex-Games/soullink/
- Local checkout: `C:\Users\user\Desktop\my\Codex-Games\soullink`
- Open `soullink/project.godot` with Godot 4.7.2.
- Project instructions: [soullink/README.md](soullink/README.md).
- Repository handoff: [soullink/docs/REPOSITORY.md](soullink/docs/REPOSITORY.md).

Run portable checks from the repository root:

```powershell
node --test soullink/tests/host.test.cjs soullink/tests/audio.test.cjs soullink/tests/intro.test.cjs soullink/tests/catalog-seed.test.cjs
```

## Delivery Boundaries

Matching pushes run the portable checks and export the Godot Web client with
Godot 4.7.2. GitHub Pages publishes only the game artifact to
`/Codex-Games/soullink/`; the local admin, server source, tests and secrets are
not part of that artifact. The Cloudflare match Worker deploys separately from
`soullink/server` and Supabase remains the persistent data service.

Local file saves are not automatically committed. A verified commit pushed to
`main` triggers the free test deployment. Source deployment must not overwrite
live character/skin records or player data.

Generated Godot builds, `.ait` packages, local publication history, backups,
dependencies and secrets remain excluded from Git. App-store and Toss client
releases are separate from the web test deployment.

## 성좌 결투 (Seongjwa Duel)

- Folder: [seongjwa/](seongjwa/) — 상태와 할 일은 [seongjwa/TASKS.md](seongjwa/TASKS.md).
- Soul Link의 서버 구조와 유저 플로우만 가져와 새로 만든다.
