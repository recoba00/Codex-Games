# Combat Redesign Proposal

Status: first local prototype implemented on 2026-10-20, not balanced.
See `COMBAT_V2.md` for the actual rules and `CHARACTER_ADMIN.md` for registration
and tuning. This original proposal is retained as design rationale; descriptions
of the old rules below refer to the pre-prototype game, not current behavior.

Follow-up research: `COMBAT_RESEARCH.md` compares eight Google Play/Steam cases,
separating official mechanics from proposed Soul Link adaptations. P0 below
remains the first prototype. Limited board reshaping and character color-pair
recipes are P1 candidates; charged tiles/daily challenge are later experiments.
AP/shared-board modes and unlimited extra turns are not part of the first change.

## Current Problems

- `SoulBattle.finish()` deals ordinary match damage only for color 0. Other
  colors can consume a turn without a normal strike, even after a valid match.
- `finish()` resolves MP then changes actor immediately. Newly earned MP cannot
  be spent by the matching actor until their next turn.
- AI automatically spends affordable MP before making its simple swap. There
  is no committed next-action preview to support deliberate disruption.
- Healing currently restores 100 per basic group, potentially 200 per turn.
  Adding free damage without adjusting sustain would not establish good pacing.

## First Prototype

### One Guaranteed Strike Per Completed Turn

Every completed puzzle turn queues exactly one basic strike, regardless of red
tile availability. A legal empty/manual pass can still use this basic strike;
invalid input is rejected and cannot produce damage. Existing timeout assistance
is retained. Both sides follow the same rule.

The strike is not multiplied by cascade count and is not a new button/resource.
Red matches add damage to the strike instead of unlocking the ability to attack.
Shields/defense still mitigate the strike; guaranteed attack does not mean
guaranteed HP damage. A defeated actor cannot strike or heal. Damage limits must
count skill and final-strike contributions together, with exact preview/receipts.

Candidate starting values for simulation, not final tuning:

- Basic strike: 70 attack-power units before faction/defense/shield.
- Red 3-match: +50 units; group-size/limited combo bonuses apply to this bonus,
  not the guaranteed base. Final aggregate strike is capped per turn.
- Gold 3-match: test 40 healing, 80 per-turn cap, versus current 100/200.
- Keep 1000 HP and 40 MP repeatable skills initially to isolate the change.
  These values are hypotheses, not a claim that a match will end at a given round.

### Puzzle Roles

| Color | Role | Reason To Choose |
| --- | --- | --- |
| Red | Increase this turn's final strike | Immediate pressure or finishing a low-HP opponent |
| Blue | Deny opponent MP | Push a declared skill below its required MP |
| Green | Strengthen the next own strike | Prepare damage for a better opening; now useful without red |
| Purple | Gain MP for the post-match action window | Cast now, or save MP for a later opening |
| Gold | Restore HP, with a bounded turn cap | Survive a declared threat without forfeiting all offense |

Do not convert every color into equivalent per-group damage. Conditional effects
remain conditional: full-HP healing or denial against zero MP is wasteful and
must be shown honestly, not secretly converted to free damage/resources.

### Turn Flow

1. Show the opponent's committed intended action and applicable MP requirement.
2. Player rearranges puzzles using the current input/time controls.
3. Apply matched resource/heal/denial effects and queue the final strike.
4. If a skill is affordable, allow a short post-match use/hold decision with the
   existing skill and end-turn controls. No mandatory extra delay when unavailable.
   Skills remain MP-funded and repeatable, not once-per-turn. Resources spent in
   this window cannot be duplicated, and dead/silenced actors cannot cast.
5. Resolve the single final strike, then give the opponent its turn.

The first prototype moves normal skill decisions after matching rather than
supporting two unrestricted skill phases. A free once-per-match spell retains
its distinct limit; the existing ability to use spell and skill in one turn is
preserved. The action window must have a bounded timeout to avoid stalling.

AI uses the same resource/action timing. Intent is chosen before seeing the
player's move and is not replaced by a stronger counter after the player commits.
If blue denial removes enough MP, show "skill interrupted -> basic strike".
Predictions exclude unknown future refills and are labeled as estimates; do not
promise exact future damage when the board can still cascade.

## Later, Separately Tested

- Three readable opponent patterns: burst preparation, guarding, recovery.
- Saving MP must have a tactical reason (declared guard/threat), before adding an
  80-MP overcharge mode or extra skill buttons. Extra mechanics are not required
  for the first test.
- Keep boards, character art and ranking/progression outside this combat change.
- Revisit green strength, skill damage/cost, timer and round limit only after
  basic-strike/denial/healing interactions are measured.

## Acceptance Tests

- Each non-red color, an all-non-red board, empty pass, timeout, player and AI:
  exactly one valid base strike; invalid/repeated submissions cause no extra hit.
- Displayed preview equals actual HP/shield change with defense/faction,
  multiple red groups, zero-HP targets and the existing direct-damage cap.
- Match-earned MP is immediately usable; saving it preserves it next turn;
  repeated skill casts correctly consume MP and respect silence/death.
- Crossing the opponent's declared MP threshold visibly cancels its skill;
  it still has its basic strike. No hidden AI re-planning or extra MP grants.
- Compare red pressure, pure-healing and purple-only strategies across seeded
  boards/character pairs and both first sides. Record turn lengths, deaths,
  HP-judge outcomes, damage/healing and red-free turns rather than announcing
  balance from a few scripted wins.
- Verify actual portrait controls, action-window timeout, attack receipts,
  background/pause/cancel and result transitions locally before any remote QA.
  Dothome remains traffic-blocked; no remote full downloads until recovery and
  an agreed transfer budget.
