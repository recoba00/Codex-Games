# Soul Link Godot Direction

The user has switched the active implementation from Phaser/TypeScript to the
existing `soul` Godot project. This remains the Soul Link turn-based puzzle battle
game, not the discontinued idle-RPG concept. Existing approved art and combat
rules are migration inputs, not disposable samples.

Milestone GODOT-001 is a real playable loop using Godot Controls and GDScript:
preparation, three character choices, spells, board input, deterministic resolution,
easy AI, skills, eight-round outcome and replay/return. Advanced receipts, tutorial,
gallery and historical logs remain explicit later work. No balance redesign.

Apps-in-Toss is the first destination. Godot development does not remove the
requirement to export web content and integrate Toss's host SDK. Use GDScript,
Compatibility and a single-threaded Web preset; C# Web export is not the path.
Steam/Windows and Google Play/Android are future export/integration targets from
the same engine project. Do not claim a native APK can run inside Toss.

The old web folder/public release stays intact until an actual replacement build
is tested. Godot Web export alone is not a verified .ait integration or approved
Toss release. Engine/build checks and human/device observations are separate.

Reference: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html

## Current Collection And Operations Policy

2026-10-20 user clarification supersedes any earlier duplicate-upgrade proposal:

- Collection is for artwork/skins/ownership appeal, not character stat growth.
  The same character has the same combat strength regardless of card rarity,
  skin or duplicate count. Do not add collection stat bonuses or duplicate power.
- Characters define combat stats/skills/passives. Their `skins` define appearance
  only. Examples: Ignis base, school uniform, swimsuit, office outfit. These are
  requested expansion categories, not already-created costume illustrations.
- Admin image upload + character/skin settings should appear in game without a
  rebuild. Local live publishing/gallery exists; source drafts and public catalog
  are separate. Production HTTPS hosting and initial client distribution remain
  separate requirements. See `CHARACTER_ADMIN.md` and `LIVE_CONTENT.md`.
- The current puzzle runtime stays in place. A card-battle alternative was only
  discussed, not selected. Do not replace combat or add a second full game based
  on that discussion alone.
