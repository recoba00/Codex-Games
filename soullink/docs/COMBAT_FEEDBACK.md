# Combat Feedback

GODOT-002A adds presentation; GODOT-002B strengthens the VFX and tactical HUD.
Neither changes battle rules or the easy AI.

## State And Time

- `main.gd` owns explicit turn-intro, player-input, AI-think, AI-move, resolving,
  special and result phases. Only player-input accepts puzzle or skill commands.
- A 0.5-second central banner identifies the actor. AI waits 0.14 seconds and
  visibly performs the same single adjacent swap over 0.28 seconds.
- Match waves charge/flash for 0.3 seconds, strike for 0.32 when damage or
  absorption occurred, then drop over 0.14 seconds. A full attacking wave is
  0.76 seconds instead of 1.1 (about 31% shorter). Only three waves are expanded; further
  waves share a summary. Every effect still applies to the displayed totals.
- Presentation does not spend the player's 15-second budget. Manual pause and
  host backgrounding freeze both clocks. Preparation/restart cancels the queue,
  restores portraits and clears completion callbacks.

## Exact Receipts

`Battle.finish_turn` commits once and exposes `last_effects` plus separate
`last_round_effects`. Each group records actual HP loss, shield absorption,
MP gain/common gain/denial, next-attack boost and burn added. Caps and target
defeat are recorded so a zero result has a reason instead of a fictitious number.
These fields are presentation metadata; the deterministic snapshot is unchanged.

The UI retains a separate fighter snapshot while the queue runs. MP/boost changes
appear on the match, HP/shield changes at impact, and round-end burns separately.
Previously applied skill damage is not replayed as match damage. Captions name
the player or AI explicitly. Common match MP and extra mana-tile MP are distinct.

`battle_feedback.gd` draws the existing portraits at aspect-preserving bounds;
it temporarily hides their static counterparts, lunges the attacker, shakes and
tints the victim, and overlays actual damage/absorption numbers. A short windup
precedes the fast lunge; impact holds the card for 14% of the strike duration,
then recoils. Damage applies at 38%, matching the strike contact point.
`puzzle_board.gd` draws temporary swap/clear/drop states without changing the
already-resolved core board. No asynchronous tweens are used.

## Tactical HUD And Light

- Charcoal/white controls, square corners, amber actions and red opponent status
  replace the teal/gold chrome. The center banner is a sliding chamfered white
  strip with black typography, phase identifier and colored edge. No NIKKE art,
  logos, fonts or UI files are copied; its military-interface direction is a
  visual reference, not a claimed reproduction.
- One generated transparent 1254x1254 texture atlas supplies ring, burst, slash
  and swirl. `combat_vfx.gd` samples its four quadrants; `vfx_layer.gd` uses
  additive CanvasItem blending, compatible with the existing WebGL2 renderer.
- Every matched tile charges, flashes and ejects sparks. Element-colored rings
  and curved streams travel toward the appropriate card; lightning uses a
  jagged bolt, wind/mana return toward the actor, red transfers toward the enemy.
- Card hits combine afterimages, slash, white core, colored burst, particles and
  a ground ring. Barrier/burn have their own light treatment; active attack tint
  follows character identity. The board-top callout names the actual skill or
  cumulative combo count, never an invented critical hit.
- Per-frame work is bounded to 32 matched tiles and six group streams. The
  shared atlas adds roughly 6MiB of decoded RGBA texture, before engine overhead.
  No continuous full-screen bloom, new renderer or offscreen particle buffers.
- A brief tinted screen pulse peaks at 8% opacity, not a full-white flash. It is
  presentation only; neither timers nor input advance through the animation.

Generation prompt and source provenance: `docs/VFX_ASSETS.md`.

## Verification And Limits

- Core: 4,534 checks, including 276 turns of exact receipt comparison.
- `run-godot.ps1 -Mode feedback`: native GPU screenshots, timer/input locks,
  exact HP/shield caption, AI swap, barrier, background and cancellation. Also
  tests all four elements together, hit-hold timing and light-on/off pixel
  differences so a missing light texture cannot pass as a nonblank game screen.
- `-Mode render` and `-Mode pack`: existing layout/input/full-match regressions.
- `web-check.cjs`: real browser input, timeline events, real timeout, host events,
  mobile/landscape bounds, staged and public HTTP startup.
- `toss-check.cjs`: official Devtools mock, not an actual Toss device.

GODOT-002C now adds synchronized CC0 music/effects and sound settings; see
`docs/AUDIO.md`. A reduced-motion setting is not implemented. The HTTP preview
remains online-only. Phone readability, touch feel, installed-home-screen behavior
and real Toss performance still require physical-device checks.
