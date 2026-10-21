# Soul Link Godot

This folder is the user's active Godot project for Soul Link, a portrait puzzle
battler, not the earlier Norse idle RPG described in ancestor notes.

- Use Godot 4.7.2, GDScript and Compatibility rendering.
- Target Apps-in-Toss first through a Godot Web export. Steam/Windows and Google
  Play/Android are later native builds of the same project, not separate games.
- Do not embed the old Phaser page inside Godot. Port gameplay into independent
  GDScript models and Godot Control scenes.
- Preserve `../../soul-link` outside this repository as reference; do not delete its original artwork or
  publish that old runtime again as progress on this Godot project.
- Reuse approved character/background assets. Keep their aspect ratios and no
  dialogue text. Use shared 16px content insets and 56px/16px centered headers.
- Keep rules in `data/`, presentation in `scripts/ui/`, and core logic in
  `scripts/core/`. Verify deterministic behavior against captured web fixtures.
- Character/skin collecting is cosmetic, not stat growth or duplicate upgrades.
  Skins never override stats/skills/passives. Preserve the live content boundary,
  last-good fallback and per-battle config freeze; see `docs/LIVE_CONTENT.md`.
- Normal content publishing must not require a Godot rebuild. New runtime code
  still needs a client update. Do not expose the loopback admin publicly or claim
  production live operation before an actual HTTPS content host is configured.
- Read TASKS.md before implementation; keep one milestone active and distinguish
  engine tests, real rendered checks, host integration and live deployment.
- Use `docs/AI_WORKFLOW.md` to route work to the smallest relevant modules/tests.
  Keep one source of truth per rule and avoid duplicating old verification logs.
- Never put hosting credentials in this project. Do not overwrite the current
  public game before the Godot export and its host integration are validated.
- Follow `docs/FREE_TEST_INFRA.md` for all online test resources. The current
  authorization is Free-plan-only: no billing method, paid subscription,
  usage-based add-on, R2 subscription, or paid fallback. When a free quota is
  reached, stop/fail the affected test instead of enabling paid capacity.
- This game lives in `recoba00/Codex-Games` under `soullink/`; see
  `docs/REPOSITORY.md`. The old `my/soul` copy is not synchronized with this
  checkout. Keep game-specific CI paths scoped to `soullink/**`.
