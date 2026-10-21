# Codex Games

- Repository: https://github.com/recoba00/Codex-Games
- Keep each game in its own top-level folder. Soul Link is in `soullink/`.
- Read the target game's AGENTS.md and TASKS.md before editing it.
- Scope changes, tests, staging, and deployment to the requested game. Never
  sweep unrelated games into a commit or deploy every game on every push.
- Keep build outputs, dependencies, caches, local backups, user data, and secrets
  out of Git. Do not copy the whole local build folder into a release.
- The initial workflow only runs portable Soul Link Node tests. It does not
  deploy a server, run Godot, migrate a database, or publish to an app store.
- Do not install an automatic save/commit/push watcher. Finish a change and run
  its checks before committing/pushing the intended files.
- Cloud hosting credentials belong in protected CI/hosting secrets, never in
  source files, generated clients, workflow literals, logs, or Git history.
- Keep database content and R2 media independent from source deployments. Never
  reset production data as part of deploying application code.
