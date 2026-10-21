# Duel Art / GODOT-002E

## User Artwork

The first supplied `1024.png` is the Godot app icon and favicon/Apple/home-screen
icon v2. The original character portraits are not replaced by the app icon.
OS-installed home-screen icons may require removal/re-addition to clear the OS
icon cache. Toss console/store branding still requires the separate console upload.

Five supplied 1254px square crystal emblems are delivered as 192px WebP textures,
keeping their complete square composition and original colors. No image generation
or recoloring is used for these new attachments. Input hashes and mappings are in
`USER_ART.json`; `tools/prepare-user-art.cjs` reproduces the delivery conversions.
Original desktop files are untouched; previous app artwork is backed up locally.

GODOT-002F replaces only these five puzzle textures with the newer supplied
sword, lightning, wind leaf, crescent/stars and golden star emblems. Original
alpha is preserved. `--puzzles-only` leaves the app/home-screen icons untouched;
the prior delivery textures and provenance are backed up in
`build/art-backup/puzzles-before-emblems-v2`. Combat rules and portraits are unchanged.

| Puzzle | Supplied Color | Actual Effect |
| --- | --- | --- |
| Attack | Red | Enemy HP damage, shield first; faction/defense/caps apply |
| Lightning | Blue | Enemy MP denial, base 10, turn cap 15 |
| Wind | Green | Next own puzzle attack +10%, turn accumulation cap 30% |
| Mana | Purple | Own MP, base additional 25 |
| Healing | Gold | Own HP, base 100, turn cap 200; no overheal or resurrection |

Match-size/combo multipliers apply. Every match also grants base MP 8, with a
combined puzzle MP cap of 40 per turn and fighter MP maximum 100. Displayed
receipts use the *actual* clamped/faction-adjusted result, never the base promise.
The latest supplied gold emblem supersedes the earlier pink-heart presentation;
there are five puzzle types, not two separate HP recovery types.

## Skills And Feedback

Active skills cost MP 40 and have no count/cooldown/special-slot restriction.
The old cost 60 was lowered after a real-input duel showed the fifth color and
silence could delay the first cast until round seven. Full MP can fund two casts
without artificially refilling MP in a test; insufficient MP still blocks further use.
A spell no longer blocks a skill in the same turn. Insufficient MP and silence
still apply; the distinct free spell remains once per match. Multiple special
damage contributions accumulate correctly in turn receipts and damage caps.

Each matched group now has its own visual receipt: the same bitmap emblem, count,
target and actual effect. Small tile labels, a colored five-item legend, per-item
help and drag previews make the source and target visible before release too.
Already cleared groups remain empty while the other groups in that wave resolve;
only after their receipts do the full wave's surviving/new tiles drop together.
MP/HP recovery resolves through an enlarged source-character cut-in; HP and MP
meters update at the recovery impact rather than jumping to final model values.

Battle portraits grow from 52x70 to at least 96x148 logical pixels with narrower
right-side meters. Attacks zoom the actual character art to about 2x, lunge across
to the opponent, hold at contact, then return with rounded art trails and hit flash.
All character-art surfaces share an aspect-correct rounded-alpha shader: selection,
battle, attack/recovery cut-ins and full-page result art. Backgrounds stay full-bleed.

The result is a dedicated game page with a large intact portrait, victory/defeat/
draw identity, HP comparison, damage/combo/skill statistics and rematch/selection.

## Intro BGM

The movie file remains stripped of its original audio. Existing CC0 menu music
now plays behind the intro through the same audio graph as gameplay, respecting
saved volume/mute. Autoplay is attempted only after stored settings are applied.
Browsers that prohibit it retain an explicit music button and allow the first
intro touch to unlock sound. No insecure-origin/audio-policy bypass is used.
Toss's supported `mediaPlaybackRequiresUserAction` option is false and inline
media playback is explicitly enabled; actual device
WebView audio policy still needs physical Toss validation.

## Safety And Tests

Rules remain in `data/` and `scripts/core/`; UI is separate. Historical four-color
fixtures explicitly exercise the supported four-color configuration without
changing their old evidence. New production defaults and six-item refill bags use
five equally represented colors. Core tests also cover bounded gold healing,
zero-HP/no resurrection, repeated MP-funded skills and damage/healing conservation.

QA-only browser snapshots include read-only engine-computed legal single swaps.
The full-duel browser test uses those paths through real pointer input, not model
mutation, to collect MP, cast repeated skills, heal via gold and reach the result.
No QA snapshots are exposed for normal visits. GPU tests separately exercise
exact recovery cut-ins, impact scale, rounded materials and result actions.

The user explicitly approved removing old Soul Link deployment history after
local backup verification. Only oldest `godot-e4ea82872310c52d` was retired;
45,868,325 bytes / ten files are recoverable from the byte-verified ZIP under
`build/hosting-backup/`. Current `godot-357da2b9d3767709`, immediate recovery
`godot-8f475b442510ea2c`, shared-engine references and all other games were kept.
See `artifacts/prune-godot-e4ea82872310c52d.json` for that recovery ZIP hash and receipt.

## Delivered Build

GODOT-002F delivered release `godot-a6557a24182a8631`, HTTP preview:
`http://recoba00.dothome.co.kr/games/soullink/`.
Core: 5,893 checks; Node: 18 tests; deployment boundary: six tests.
GPU: nine feedback captures rechecked for the new emblems. The 12-layout and
result-action native suite was validated for GODOT-002E; layout code is unchanged.
HTTP browser: full first/second video loops with menu BGM, real drag and AI,
15-second timeout, volume/mute persistence/background silence, three viewports,
and a whole real-input duel: all five colors, two MP-funded skills, gold HP +100,
large original-art result and return to selection. No combat state injection.
The normal (non-QA) startup also passes without exposing debug snapshots.

GODOT-002F Toss artifact: 24,723,751 bytes / 35 entries, raw web 54,496,834 bytes, matched by
the official bundle reader. Devtools remains a mock; no console upload or physical
device validation is claimed. Screenshots/reports live under `artifacts/`.
For the subsequent intro/audio-only GODOT-002G delivery, see `INTRO.md` and
`TOSS.md`; its Godot PCK and combat rules are byte-identical to GODOT-002F.
