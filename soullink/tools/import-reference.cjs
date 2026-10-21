const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
if (JSON.parse(fs.readFileSync(path.join(root, 'data/game.json'), 'utf8')).combat) {
  throw Error('Historical one-time importer is disabled for combat-v2: it would overwrite the live catalog and approved assets. Existing fixtures are preserved.');
}
const web = path.resolve(root, '../soul-link');
const sourceRequire = createRequire(path.join(web, 'package.json'));
sourceRequire('tsx/cjs');
const { Battle, CHARACTERS, PRACTICE_RULES, fighter } = sourceRequire('./src/core/battle.ts');
const { BLOCK_RULES, BLOCKS } = sourceRequire('./src/core/blocks.ts');
const { BOARD_SIZES, createBoard, initialCounts } = sourceRequire('./src/core/board.ts');
const { simpleMatch } = sourceRequire('./src/core/ai.ts');
const { Swords, Zap, Wind, Sparkles, ArrowLeft, ArrowRight, Pause, Play, Settings2, Shield, Flame, RotateCcw, X } = sourceRequire('lucide');

function write(name, value) {
  const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function copy(from, to) {
  const file = path.join(root, to); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.copyFileSync(from, file);
}
copy(path.join(web, 'public/art/arena.webp'), 'assets/backgrounds/arena.webp');
copy(path.join(web, 'public/icons/icon-512-v1.png'), 'assets/app/icon.png');
for (const id of Object.keys(CHARACTERS)) copy(path.join(web, `public/art/cards/${id}-play-v2.webp`), `assets/characters/${id}.webp`);
copy(path.resolve(root, '../cardbattle/assets/fonts/Pretendard-Regular.otf'), 'assets/fonts/Pretendard-Regular.otf');
write('data/game.json', { source_version: 'practice-v0.4.0', characters: CHARACTERS, practice: PRACTICE_RULES, blocks: BLOCKS,
  block_rules: BLOCK_RULES, board_sizes: BOARD_SIZES, base_stats: { hp: fighter('ignis', 'smite').hp, attack: BLOCK_RULES.attack },
  game_limits: { rounds: 8, direct_hp_cap: 500 } });

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
function svg(node) {
  const [tag, attrs, children = []] = node;
  return `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${escape(value)}"`).join(' ')}>${children.map(svg).join('')}</${tag}>`;
}
for (const [name, icon] of Object.entries({ swords: Swords, zap: Zap, wind: Wind, sparkles: Sparkles, back: ArrowLeft, end: ArrowRight, pause: Pause, play: Play, settings: Settings2, shield: Shield, flame: Flame, replay: RotateCcw, close: X })) {
  const file = path.join(root, `assets/icons/${name}.svg`); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, svg([icon[0], { ...icon[1], stroke: '#f4f0e5', width: 24, height: 24 }, icon[2]]) + '\n');
}
copy(path.join(web, 'node_modules/lucide/LICENSE'), 'assets/licenses/Lucide-ISC.txt');
const copyright = fs.readFileSync(path.join(root, 'assets/licenses/Pretendard-COPYRIGHT.txt'), 'utf8');
const ofl = fs.readFileSync(path.join(web, 'public/licenses/SoulSerif-OFL.txt'), 'utf8');
fs.writeFileSync(path.join(root, 'assets/licenses/Pretendard-OFL.txt'), copyright + '\n\n' + ofl.slice(ofl.indexOf('-----------------------------------------------------------')));

function snapshot(battle) {
  return JSON.parse(JSON.stringify({ fighters: battle.fighters, boards: battle.boards, round: battle.round, actor: battle.actor,
    first: battle.first, actionsThisRound: battle.actionsThisRound, turnSeconds: battle.turnSeconds, green: battle.green, boost: battle.boost,
    result: battle.result, special: battle.special ?? '', specialDamage: battle.specialDamage, hpLoss: battle.hpLoss,
    refills: battle.refills.map(refill => ({ bag: refill.bag, state: refill.rng.state })) }));
}
const fixtures = { source_version: 'practice-v0.4.0', board_cases: [], matches: [] };
for (const size of BOARD_SIZES) for (const seed of [1, 2002, 0xffffffff]) {
  fixtures.board_cases.push({ size, seed, counts: initialCounts(size, seed), board: createBoard(size, seed ^ 0x18f61, seed) });
}
let caseIndex = 0;
for (const player of Object.keys(CHARACTERS)) for (const opponent of Object.keys(CHARACTERS)) for (const first of [0, 1]) {
  const size = BOARD_SIZES[caseIndex % BOARD_SIZES.length], seed = 2002 + caseIndex * 17;
  const spell = caseIndex % 2 ? 'smite' : 'barrier';
  const battle = new Battle(seed, size, player, opponent, spell, first);
  const fixture = { seed, size, player, opponent, spell, first, initial: snapshot(battle), turns: [] };
  while (!battle.result) {
    const index = fixture.turns.length;
    let special = '';
    if (battle.canUse('active')) special = 'active';
    else if (index % 3 === 0 && battle.canUse('spell')) special = 'spell';
    if (special) battle.use(special);
    const timeout = battle.actor === 0 && index % 4 === 1;
    const route = timeout ? [] : simpleMatch(battle.boards[battle.actor], size, seed + index).path;
    const record = battle.finish(route, timeout ? 'timeout' : 'release');
    const summary = { actor: record.actor, round: record.round, groups: record.groups, damage: record.damage,
      manaGain: record.manaGain, manaDenied: record.manaDenied, green: record.green, shuffled: record.shuffled };
    fixture.turns.push({ special, path: route, timeout, record: summary, after: snapshot(battle) });
  }
  fixtures.matches.push(fixture); caseIndex++;
}
write('tests/fixtures/web-reference.json', fixtures);
console.log(JSON.stringify({ assets: '3 approved character derivatives + arena + PWA emblem + Pretendard + Lucide', boards: fixtures.board_cases.length, matches: fixtures.matches.length, turns: fixtures.matches.reduce((sum, item) => sum + item.turns.length, 0) }));
