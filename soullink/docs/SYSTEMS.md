# Godot Combat Migration

Reference engine: `../soul-link/src/core`, practice-v0.4.0.
`tools/import-reference.cjs` captures the existing canonical content and golden
fixtures. It is a development import tool, never a runtime Node dependency.
The Godot game needs only the included GDScript/data/art/font resources.

`scripts/core/` separates unsigned xorshift32, board matching/adjacency, fair initial
counts, balanced refill bags and battle state. `data/game.json` owns characters,
block rules, practice defaults, base stats, board sizes and existing match limits.
No combat balance was intentionally changed.

Parity includes independent player/AI boards and refill streams, 8Hz drag sampling,
four board dimensions, per-group damage rounding, faction/guardian modifiers,
shared 500 direct-HP-loss cap, shield absorption, per-turn MP/denial/green caps,
special exclusivity/costs, burn, silence, inclusive round expiration, next-turn
boost/haste, simultaneous knockout handling and maximum-round verdicts.

The first Godot runtime has simplified immediate resolution. Its native turn
summary is not a complete port of event schema 2, receipt animation, historical
replay/download or instructional trial. Those must not be claimed migrated just
because final numerical states match. Physical touch/multifinger use is separate
from engine-injected mouse validation.

Golden coverage: 12 initial board cases including uint32 extreme seeds and all
four dimensions; 18 completed character/initiative combinations, 276 turns.
2,878 checks compare board groups, resources/statuses, outcomes, refill bags and
RNG state, plus invalid-input purity. Float comparisons use a 1e-8 tolerance.
