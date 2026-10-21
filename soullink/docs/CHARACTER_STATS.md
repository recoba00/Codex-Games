# Extensible Character Stats

Implemented for the local Godot prototype on 2026-10-20. The current three
characters keep their existing HP/attack, zero defense/crit chance/all-damage
reduction, so this adds an extension path without enabling random balance changes.

## Data Contract

`data/stats.json` is the shared registry: stable ID, Korean label, default, bounds,
step, integer flag and display unit. Godot reads it; admin generates numeric
controls and validates saves from it. Rates are stored as decimals and displayed
as percentages. New character registration takes its defaults from this registry.

| ID | Meaning | Default |
| --- | --- | --- |
| `max_hp` | Maximum health; current HP is separate runtime state | 1000 |
| `attack` | Scales final-strike and active base damage against attack 100 | 100 |
| `defense` | Direct-damage mitigation using a diminishing-return formula | 0 |
| `crit_chance` | Probability per eligible hit, 0 to 1 | 0 |
| `crit_damage` | TOTAL damage multiplier on critical, not additional bonus | 1.5 = 150% |
| `damage_reduction` | Reduction of all incoming damage, including burn | 0 |

Character catalog schema 2 stores these inside `characters.<id>.stats`.
Previous flat `hp`/`attack` fields are accepted on load and normalized to stats.
Canonical stats win if both forms exist. Missing fields use registry defaults;
admin rejects misspelled/unknown stat keys instead of silently losing them.
Raw previous catalog bytes are backed up before a successful save.

## Extension Path

`SoulStats.resolve(base, modifiers)` produces an independent, bounded final
dictionary. Modifiers are records such as `{stat: "attack", flat: 20, percent: 0.1}`.
For each stat: `(base + sum(flat)) * (1 + sum(percent))`, then clamp and floor
integer stats. Percentage-point rate additions use `flat: 0.05`; `percent: 0.1`
means a relative 10% increase. Always resolve from the original base, not an
already modified result. Modifier order does not change the sum-based policy.

Fighters hold final `stats`; current HP and cached `maxHp` are resource state.
Later equipment, growth and buffs can feed the resolver without adding flat
character fields. Those systems are NOT implemented here. A future mid-match
max-HP modifier must also define how current HP/maxHp are synchronized.

Adding a registry entry automatically adds defaults, admin input and validation.
It does not invent gameplay semantics: a genuinely new mechanic still needs a
consumer in the combat model, a damage/preview rule and focused tests.

## Damage Policy

Direct hit pipeline:

1. Base amount and attack scaling; applicable faction/turn/passive bonuses.
2. Eligible critical multiplier.
3. Defense factor `100 / (100 + defense)`; constant lives in registry damage rules.
4. Direct-only guard passive, then `1 - damage_reduction`, multiplicatively.
5. Floor damage, absorb with shield, then enforce remaining HP/turn HP-loss cap.

Final strikes and damaging active skills may crit. Fixed free smite, burn and
recovery cannot. Burn ignores defense/direct-only guard but honors all-damage
reduction; its existing nonlethal rule is retained. Guard and global reduction
are different effects and never simply added to 100% immunity.

Crit rolls use an independent seeded stream, included in battle snapshots. They
never consume puzzle/refill randomness. Invalid/capped/nonpositive-base attempts do
not roll; actual eligible attacks do. Preview queries never roll or mutate the
stream, and show a noncritical-to-critical range when uncertainty exists. Actual
receipts/impact titles record whether the hit was critical. Default 0% crit never
consumes a roll and keeps the earlier damage/refill behavior.

## Admin And Verification

The saved/applied revision includes BOTH catalog bytes and stat-registry bytes.
A registry change therefore invalidates stale saves/build status. Use
`http://localhost:5175/admin/`: save, build preview, reload game. Reboot native
F5 runs to reload data. Authoring bounds are guardrails, not a balance guarantee.

Core tests cover legacy/default migration, additive modifiers, caps, pure range
previews, deterministic critical outcomes, independent RNG, armor, guard/global
reduction composition, shield order and burn receipts. Native GPU input tests
exercise a registered character with critical stats and its labeled impact.
Admin tests use real temporary files/browser numeric inputs, including percent
conversion and registry-revision invalidation. Physical-phone balance is pending.
