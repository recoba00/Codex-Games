const MAX_CASCADE_WAVES = 32;
const MAX_PATH_CELLS = 117;
const COLOR_COUNT = 5;

export const DEFAULT_BOARD = Object.freeze({ cols: 6, rows: 5 });

function clone(value) {
  return structuredClone(value);
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function xorshift(state) {
  let value = state >>> 0 || 0x9e3779b9;
  value ^= (value << 13) >>> 0;
  value ^= value >>> 17;
  value ^= (value << 5) >>> 0;
  return value >>> 0;
}

function randomBelow(holder, maximum) {
  holder.state = xorshift(holder.state);
  return Math.floor((holder.state / 0x100000000) * maximum);
}

function shuffle(values, holder) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = randomBelow(holder, index + 1);
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}

export function adjacent(a, b, dimensions) {
  const total = dimensions.cols * dimensions.rows;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= total || b >= total) return false;
  return Math.abs((a % dimensions.cols) - (b % dimensions.cols)) +
    Math.abs(Math.floor(a / dimensions.cols) - Math.floor(b / dimensions.cols)) === 1;
}

export function moved(board, a, b) {
  const result = [...board];
  [result[a], result[b]] = [result[b], result[a]];
  return result;
}

function neighbors(cell, dimensions) {
  return [cell - dimensions.cols, cell - 1, cell + 1, cell + dimensions.cols]
    .filter((candidate) => adjacent(cell, candidate, dimensions));
}

export function findGroups(board, dimensions, wave = 0) {
  const matched = new Set();
  for (let cell = 0; cell < board.length; cell += 1) {
    const x = cell % dimensions.cols;
    const y = Math.floor(cell / dimensions.cols);
    for (const [step, available] of [[1, dimensions.cols - x], [dimensions.cols, dimensions.rows - y]]) {
      if (available < 3) continue;
      let count = 1;
      while (count < available && board[cell + count * step] === board[cell]) count += 1;
      if (count >= 3) for (let offset = 0; offset < count; offset += 1) matched.add(cell + offset * step);
    }
  }
  const ordered = [...matched].sort((a, b) => a - b);
  const result = [];
  for (const cell of ordered) {
    if (!matched.has(cell)) continue;
    const color = board[cell];
    const cells = [];
    const pending = [cell];
    matched.delete(cell);
    while (pending.length) {
      const current = pending.pop();
      cells.push(current);
      for (const candidate of neighbors(current, dimensions)) {
        if (matched.has(candidate) && board[candidate] === color) {
          matched.delete(candidate);
          pending.push(candidate);
        }
      }
    }
    cells.sort((a, b) => a - b);
    result.push({ color, cells, wave });
  }
  return result.sort((a, b) => a.color - b.color || a.cells[0] - b.cells[0]);
}

function hasMove(board, dimensions) {
  for (let cell = 0; cell < board.length; cell += 1) {
    for (const candidate of neighbors(cell, dimensions)) {
      if (candidate > cell && board[cell] !== board[candidate] && findGroups(moved(board, cell, candidate), dimensions).length) return true;
    }
  }
  return false;
}

function simpleMatch(board, dimensions, choice = 0) {
  const candidates = [];
  let leastGroups = Number.MAX_SAFE_INTEGER;
  let leastCells = Number.MAX_SAFE_INTEGER;
  for (let cell = 0; cell < board.length; cell += 1) {
    for (const candidate of neighbors(cell, dimensions)) {
      if (candidate <= cell || board[cell] === board[candidate]) continue;
      const groups = findGroups(moved(board, cell, candidate), dimensions);
      if (!groups.length) continue;
      const cellCount = groups.reduce((sum, group) => sum + group.cells.length, 0);
      if (groups.length < leastGroups || (groups.length === leastGroups && cellCount < leastCells)) {
        candidates.length = 0;
        leastGroups = groups.length;
        leastCells = cellCount;
      }
      if (groups.length === leastGroups && cellCount === leastCells) candidates.push([cell, candidate]);
    }
  }
  return candidates.length ? candidates[(choice >>> 0) % candidates.length] : [];
}

function initialCounts(dimensions, seed) {
  const total = dimensions.cols * dimensions.rows;
  const counts = Array(COLOR_COUNT).fill(Math.floor(total / COLOR_COUNT));
  const order = shuffle([0, 1, 2, 3, 4], { state: seed >>> 0 });
  for (let index = 0; index < total % COLOR_COUNT; index += 1) counts[order[index]] += 1;
  return counts;
}

function createBoard(dimensions, layoutSeed, countSeed) {
  const colors = [];
  const counts = initialCounts(dimensions, countSeed);
  for (let color = 0; color < counts.length; color += 1) {
    for (let index = 0; index < counts[color]; index += 1) colors.push(color);
  }
  const random = { state: layoutSeed >>> 0 };
  for (let attempt = 0; attempt < 20000; attempt += 1) {
    shuffle(colors, random);
    if (!findGroups(colors, dimensions).length && hasMove(colors, dimensions)) return [...colors];
  }
  throw new Error("board_generation_failed");
}

function nextRefill(refill) {
  if (!refill.bag.length) {
    refill.bag = Array.from({ length: COLOR_COUNT * 6 }, (_, index) => index % COLOR_COUNT);
    shuffle(refill.bag, refill);
  }
  return refill.bag.pop();
}

function resolveBoard(board, dimensions, refill) {
  let current = [...board];
  const groups = [];
  for (let wave = 0; wave < MAX_CASCADE_WAVES; wave += 1) {
    const matches = findGroups(current, dimensions, wave);
    if (!matches.length) {
      if (!hasMove(current, dimensions)) {
        for (let attempt = 0; attempt < 20000; attempt += 1) {
          shuffle(current, refill);
          if (!findGroups(current, dimensions).length && hasMove(current, dimensions)) break;
        }
      }
      return { board: current, groups };
    }
    groups.push(...matches);
    const gone = new Set(matches.flatMap((group) => group.cells));
    for (let col = 0; col < dimensions.cols; col += 1) {
      const remaining = [];
      for (let row = dimensions.rows - 1; row >= 0; row -= 1) {
        const cell = row * dimensions.cols + col;
        if (!gone.has(cell)) remaining.push(current[cell]);
      }
      for (let row = dimensions.rows - 1, index = 0; row >= 0; row -= 1, index += 1) {
        current[row * dimensions.cols + col] = index < remaining.length ? remaining[index] : nextRefill(refill);
      }
    }
  }
  throw new Error("cascade_limit_reached");
}

function sizeMultiplier(count) {
  return Math.min(2, 1 + Math.max(0, count - 3) * 0.25);
}

function comboMultiplier(count) {
  return Math.min(1.5, 1 + Math.max(0, count - 1) * 0.1);
}

export function normalizeCatalog(document) {
  if (!document || typeof document !== "object") throw new Error("catalog_invalid");
  const required = ["combat", "characters", "practice", "block_rules", "game_limits"];
  if (required.some((key) => !document[key] || typeof document[key] !== "object")) throw new Error("catalog_invalid");
  return clone(document);
}

function fighter(characterId, catalog) {
  const info = catalog.characters[characterId];
  if (!info?.enabled) throw new Error("character_unavailable");
  const stats = {
    max_hp: clamp(Math.floor(info.stats?.max_hp ?? 1000), 1, 1000000),
    attack: clamp(Number(info.stats?.attack ?? 100), 0, 10000),
    defense: clamp(Number(info.stats?.defense ?? 0), 0, 10000),
    crit_chance: clamp(Number(info.stats?.crit_chance ?? 0), 0, 1),
    crit_damage: clamp(Number(info.stats?.crit_damage ?? 1.5), 1, 10),
    damage_reduction: clamp(Number(info.stats?.damage_reduction ?? 0), 0, 0.95)
  };
  return {
    characterId,
    stats,
    hp: stats.max_hp,
    maxHp: stats.max_hp,
    mana: 0,
    shield: 0,
    burn: 0,
    burnDamage: 0,
    burnExpires: 0,
    silenceTurns: 0,
    nextGreen: 0,
    nextBoost: 0,
    damage: 0,
    maxCombo: 0,
    activeUses: 0
  };
}

export function createMatch(seed, selections, catalogDocument, dimensions = DEFAULT_BOARD, now = Date.now()) {
  const catalog = normalizeCatalog(catalogDocument);
  if (!Array.isArray(selections) || selections.length !== 2) throw new Error("players_required");
  if (![6, 8].includes(dimensions.cols) || ![5, 6, 8].includes(dimensions.rows) || dimensions.cols * dimensions.rows > 48) {
    throw new Error("board_size_invalid");
  }
  const first = seed & 1;
  const fighters = selections.map((selection) => fighter(selection.characterId, catalog));
  fighters[1 - first].mana = Math.min(100, Number(catalog.practice.openingMana ?? 0) + Number(catalog.practice.secondMana ?? 10));
  const match = {
    version: 1,
    seed: seed >>> 0,
    dimensions: clone(dimensions),
    catalog,
    catalogRevision: selections[0].catalogRevision ?? 0,
    selections: clone(selections),
    fighters,
    boards: [
      createBoard(dimensions, seed ^ 0x18f61, seed),
      createBoard(dimensions, seed ^ 0x35c97, seed)
    ],
    refills: [{ state: (seed ^ 0x716c1) >>> 0, bag: [] }, { state: (seed ^ 0x84ac3) >>> 0, bag: [] }],
    combatRandom: (seed ^ 0x4cf1d) >>> 0,
    round: 1,
    first,
    actor: first,
    actionsThisRound: 0,
    turnGreen: 0,
    turnBoost: 0,
    stage: "puzzle",
    pending: null,
    result: null,
    startedAt: now,
    turnDeadline: now + Number(catalog.practice.turnSeconds ?? 15) * 1000,
    processedActions: []
  };
  beginTurn(match, now);
  return match;
}

function beginTurn(match, now) {
  const source = match.fighters[match.actor];
  match.turnGreen = source.nextGreen;
  match.turnBoost = source.nextBoost;
  source.nextGreen = 0;
  source.nextBoost = 0;
  match.stage = "puzzle";
  match.turnDeadline = now + Number(match.catalog.practice.turnSeconds ?? 15) * 1000;
}

function assertActor(match, seat) {
  if (match.result) throw new Error("match_finished");
  if (match.actor !== seat) throw new Error("not_your_turn");
}

function mitigate(amount, target, guard = 0, direct = true) {
  const defense = direct ? 100 / (100 + target.stats.defense) : 1;
  const directGuard = direct ? 1 - clamp(guard, 0, 0.95) : 1;
  return Math.floor(Math.max(0, amount * defense * directGuard * (1 - target.stats.damage_reduction)));
}

function applyDamage(match, amount, canCrit = true, faction = true) {
  const source = match.fighters[match.actor];
  const target = match.fighters[1 - match.actor];
  const sourceInfo = match.catalog.characters[source.characterId];
  const targetInfo = match.catalog.characters[target.characterId];
  const advantage = (sourceInfo.faction === 0 && targetInfo.faction === 2) ||
    (sourceInfo.faction === 2 && targetInfo.faction === 1) ||
    (sourceInfo.faction === 1 && targetInfo.faction === 0);
  const guard = targetInfo.passive_config?.type === "guard" ? Number(targetInfo.passive_config.value ?? 0) : 0;
  let critical = false;
  if (canCrit && source.stats.crit_chance > 0) {
    match.combatRandom = xorshift(match.combatRandom);
    critical = match.combatRandom / 0x100000000 < source.stats.crit_chance;
  }
  const factor = (faction && advantage ? 1 + Number(match.catalog.combat.elementBonus ?? 0) : 1) *
    (critical ? source.stats.crit_damage : 1);
  const value = mitigate(amount * factor, target, guard, true);
  const absorbed = Math.min(target.shield, value);
  const remainingCap = Math.max(0, Number(match.catalog.game_limits.direct_hp_cap ?? 500) - (match.pending?.hpLoss ?? 0));
  const actual = Math.min(target.hp, remainingCap, Math.max(0, value - absorbed));
  target.shield -= absorbed;
  target.hp -= actual;
  source.damage += actual;
  if (match.pending) match.pending.hpLoss += actual;
  if (target.hp <= 0) finishMatch(match, match.actor, "completed");
  return { damage: actual, shield: absorbed, critical };
}

function strikeAmount(match, groups, manualCombo) {
  const rules = match.catalog.block_rules;
  const source = match.fighters[match.actor];
  const combo = comboMultiplier(groups.length);
  const extra = groups.filter((group) => group.color === 0)
    .reduce((sum, group) => sum + Number(rules.attack) * sizeMultiplier(group.cells.length) * combo, 0);
  const passive = match.catalog.characters[source.characterId].passive_config ?? {};
  const comboBoost = passive.type === "combo" && manualCombo >= Number(passive.threshold ?? 3) ? Number(passive.value ?? 0) : 0;
  return (Number(match.catalog.combat.baseStrike) + extra) * source.stats.attack / 100 *
    (1 + Math.min(0.8, Number(match.pending?.green ?? 0) + Number(match.pending?.boost ?? 0) + comboBoost));
}

function finishMatch(match, winnerSeat, finishReason) {
  match.result = { winnerSeat, finishReason, endedAt: Date.now() };
  match.stage = "finished";
  match.turnDeadline = 0;
}

export function applyMove(inputMatch, seat, path, timedOut = false, now = Date.now()) {
  const match = clone(inputMatch);
  assertActor(match, seat);
  if (match.stage !== "puzzle") throw new Error("stage_invalid");
  if (!Array.isArray(path) || path.length > MAX_PATH_CELLS || path.some((cell) => !Number.isInteger(cell))) throw new Error("path_invalid");
  for (let index = 0; index < path.length; index += 1) {
    const cell = path[index];
    if (cell < 0 || cell >= match.dimensions.cols * match.dimensions.rows || (index && !adjacent(path[index - 1], cell, match.dimensions))) {
      throw new Error("path_invalid");
    }
  }
  let board = [...match.boards[seat]];
  for (let index = 1; index < path.length; index += 1) board = moved(board, path[index - 1], path[index]);
  let assisted = false;
  if (timedOut && !findGroups(board, match.dimensions).length) {
    let correction = simpleMatch(board, match.dimensions, match.seed ^ match.round);
    if (!correction.length) {
      board = [...match.boards[seat]];
      correction = simpleMatch(board, match.dimensions, match.seed ^ match.round);
    }
    if (correction.length) {
      board = moved(board, correction[0], correction[1]);
      assisted = true;
    }
  }
  const resolution = resolveBoard(board, match.dimensions, match.refills[seat]);
  match.boards[seat] = resolution.board;
  const source = match.fighters[seat];
  const target = match.fighters[1 - seat];
  const rules = match.catalog.block_rules;
  const combo = comboMultiplier(resolution.groups.length);
  let manaGain = 0;
  let manaDenied = 0;
  let healing = 0;
  let green = 0;
  let manualCombo = 0;
  const effects = [];
  for (const group of resolution.groups) {
    if (group.wave === 0 && !assisted && path.length >= 2) manualCombo += 1;
    const multiplier = sizeMultiplier(group.cells.length) * combo;
    const baseMana = Math.min(100 - source.mana, Number(rules.manaCap) - manaGain, Number(match.catalog.practice.matchMana));
    source.mana += baseMana;
    manaGain += baseMana;
    const effect = { color: group.color, cells: group.cells, wave: group.wave, mana: baseMana, denied: 0, green: 0, healed: 0 };
    if (group.color === 1) {
      effect.denied = Math.min(target.mana, Number(rules.denialCap) - manaDenied, Math.floor(Number(rules.denial) * multiplier));
      target.mana -= effect.denied;
      manaDenied += effect.denied;
    } else if (group.color === 2) {
      effect.green = Math.min(Number(rules.greenCap), green + Number(rules.green) * multiplier) - green;
      green += effect.green;
    } else if (group.color === 3) {
      const gained = Math.min(100 - source.mana, Number(rules.manaCap) - manaGain, Math.floor(Number(rules.mana) * multiplier));
      source.mana += gained;
      manaGain += gained;
      effect.mana += gained;
    } else if (group.color === 4 && source.hp > 0) {
      effect.healed = Math.min(source.maxHp - source.hp, Number(rules.healCap) - healing, Math.floor(Number(rules.heal) * multiplier));
      source.hp += effect.healed;
      healing += effect.healed;
    }
    effects.push(effect);
  }
  source.maxCombo = Math.max(source.maxCombo, manualCombo);
  source.nextGreen = Math.max(source.nextGreen, green);
  match.pending = { groups: resolution.groups, effects, manualCombo, manaGain, manaDenied, healing, green: match.turnGreen, boost: match.turnBoost, hpLoss: 0, assisted, timedOut };
  match.stage = "action";
  match.turnDeadline = now + Number(match.catalog.combat.actionSeconds ?? 6) * 1000;
  match.version += 1;
  return match;
}

export function useSkill(inputMatch, seat) {
  const match = clone(inputMatch);
  assertActor(match, seat);
  if (match.stage !== "action" || !match.pending) throw new Error("stage_invalid");
  const source = match.fighters[seat];
  const target = match.fighters[1 - seat];
  const info = match.catalog.characters[source.characterId];
  const skill = info.active;
  if (source.silenceTurns > 0) throw new Error("silenced");
  if (source.mana < Number(skill.cost)) throw new Error("mana_insufficient");
  source.mana -= Number(skill.cost);
  source.activeUses += 1;
  let amount = Number(skill.damage);
  if (skill.type === "execute" && target.hp <= target.maxHp * Number(skill.threshold)) amount = Number(skill.executeDamage);
  const hit = applyDamage(match, amount * source.stats.attack / 100, true, true);
  if (!match.result && skill.type === "silence") target.silenceTurns = 1;
  if (!match.result && skill.type === "boost") source.nextBoost = Math.max(source.nextBoost, Number(skill.boost));
  match.version += 1;
  return { match, receipt: { type: "skill", skill: info.skill, ...hit } };
}

export function commitTurn(inputMatch, seat, now = Date.now()) {
  const match = clone(inputMatch);
  assertActor(match, seat);
  if (match.stage !== "action" || !match.pending) throw new Error("stage_invalid");
  const source = match.fighters[seat];
  let strike = { damage: 0, shield: 0, critical: false };
  if (!match.result) {
    strike = applyDamage(match, strikeAmount(match, match.pending.groups, match.pending.manualCombo), true, true);
    const passive = match.catalog.characters[source.characterId].passive_config ?? {};
    const target = match.fighters[1 - seat];
    if (!match.result && strike.damage > 0 && match.pending.groups.some((group) => group.color === 0) && passive.type === "burn") {
      target.burn = Math.min(Number(passive.cap), target.burn + 1);
      target.burnDamage = Number(passive.value);
      target.burnExpires = match.round + 1;
    }
  }
  const receipt = { type: "turn", seat, round: match.round, pending: clone(match.pending), strike };
  if (source.silenceTurns > 0) source.silenceTurns -= 1;
  match.pending = null;
  if (!match.result) {
    match.actionsThisRound += 1;
    if (match.actionsThisRound === 2) endRound(match);
    else match.actor = 1 - match.actor;
  }
  if (!match.result) beginTurn(match, now);
  match.version += 1;
  return { match, receipt };
}

function endRound(match) {
  for (const unit of match.fighters) {
    if (unit.burn > 0 && unit.hp > 0) unit.hp = Math.max(1, unit.hp - mitigate(unit.burn * unit.burnDamage, unit, 0, false));
    if (unit.burnExpires <= match.round) unit.burn = 0;
  }
  if (match.round >= Number(match.catalog.game_limits.rounds)) {
    const ratios = match.fighters.map((unit) => unit.hp / unit.maxHp);
    finishMatch(match, ratios[0] === ratios[1] ? null : (ratios[0] > ratios[1] ? 0 : 1), "completed");
    return;
  }
  match.round += 1;
  match.actor = match.first;
  match.actionsThisRound = 0;
}

export function forfeit(inputMatch, seat) {
  const match = clone(inputMatch);
  if (match.result) throw new Error("match_finished");
  finishMatch(match, 1 - seat, "forfeit");
  match.version += 1;
  return match;
}

export function timeoutTurn(inputMatch, now = Date.now()) {
  let match = clone(inputMatch);
  if (match.result) return { match, receipt: null };
  if (match.stage === "puzzle") match = applyMove(match, match.actor, [], true, now);
  return commitTurn(match, match.actor, now);
}
