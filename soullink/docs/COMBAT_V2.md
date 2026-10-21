# Combat V2 Local Prototype

Implemented on 2026-10-20. This is a playable balance prototype, not a claim of
competitive balance or proven fun. Historical board generation/refill fixtures
are preserved; the old combat damage fixtures deliberately no longer define the
rules. `COMBAT_REDESIGN.md` and `COMBAT_RESEARCH.md` record the rationale.

## Turn Contract

1. Declare AI intent before player input: normal strike/MP holding, or a skill
   with its MP threshold. A declared skill can become unavailable after denial
   or silence. AI does not invent a stronger intent in response to the move.
2. Rearrange the current board using the same drag controls, 15-second clock and
   existing timeout assistance. No new action-point resource or extra turns.
3. Apply matching resources, denial, recovery and next-turn bonuses. Red queues
   damage; it does not hit independently for each cascading group.
4. Use MP skills or confirm the final strike with the existing arrow. This
   choice lasts at most 6 active seconds. Animations, pause and host hiding
   freeze that budget; another cast never resets it. Expiry holds MP and strikes.
   Skip this window if no skill or usable non-reshape spell is available.
5. Apply exactly one final strike, then advance the actor. KO stops further
   actions immediately. The same core rules and costs apply to both sides.

AI intentionally uses one adjacent swap and at most one declared skill per turn.
It may hold newly earned MP until a later declared attack. This is the easy AI
policy, not a different resource rule or hidden MP grant.

## Starting Values

- Final strike: `(70 + summed red bonus) * attack / 100 * (1 + bonuses)`.
- Red: base +50 per 3-match. Existing size/combo multipliers affect the red bonus
  only, not the baseline. A legal pass still produces the baseline.
- Blue: opposing MP -10 per basic match, turn cap -15.
- Green: next own final strike +10%, turn cap +30%.
- Purple: +25 additional MP. All matches grant +8; combined turn gain cap +40.
- Gold: +40 HP, turn cap +80, no overheal or resurrection.
- Advantage: +5% only (fire > wind > moon > fire); neutral has no bonus.
  There is no disadvantage penalty or damage immunity.
- Direct HP loss cap: 500 across spells, skills and the final strike together.
  Shields/mitigation may make a strike deal no HP damage.
- Maximum 8 rounds. HP judgment uses remaining HP percentage if maximum HP
  differs; equal percentages draw. No real-time PvP/ranking server is implied.

## Characters

| Character | Passive | Active, Default MP 40 |
| --- | --- | --- |
| Ignis | One burn stack after a damaging red-enhanced final strike; max 3, 8 damage/stack at round end | 170 base damage; 220 below 30% enemy HP |
| Selene | Direct incoming damage -8%; not burn | 130 base damage and silence the next opposing action window |
| Sylphi | +25% to this final strike after 3 directly made first-wave groups | 150 base damage and next own final strike +20% |

First-wave groups require a real path of at least two cells. Falling cascades,
preformed pass-only matches and timeout assistance do not earn Sylphi's passive.
Each red final strike adds at most one burn stack regardless of cascades; burn
cannot itself KO. Burn and barrier keep the existing round-based expiry.
Attack scales both normal strikes and active damage, not the fixed free smite.
Repeated boost skills refresh the next-turn bonus, never multiply it endlessly.

`active.type` selects damage/execute/silence/boost. `passive_config.type` selects
none/burn/guard/combo. Rules dispatch on templates, never on a character's ID.
Character-specific HP, attack, MP cost and template parameters come from
`data/game.json`. Preview excludes unknown drops; red match labels show queued
base bonus, and the actual final impact displays mitigated HP/shield damage.
Schema 2 now places character stats in `stats`, with defense/crit/all-damage
reduction defaulting to neutral. `CHARACTER_STATS.md` specifies damage order,
critical RNG/range previews, compatibility and later growth/equipment hooks.

## Reshape Spell

The existing once-per-match slot now offers smite, barrier or reshape. Reshape
is used before dragging: choose an element, then two distinct board cells. The
arrow can confirm a single selected cell. Cancel costs nothing. A completed
reshape consumes the one spell and never deals immediate damage. No separate
meter or extra turn. Two-color recipes/charged tiles are not implemented.

## Next Playtest

Play each character against both opponents and record whether red pressure,
MP denial, MP holding and gold recovery lead to distinct worthwhile choices.
Measure manual combo success on phones before lowering the passive threshold.
Review healing, turn length, initiative and judge outcomes across more strategies;
deterministic regression success is not balance evidence.
