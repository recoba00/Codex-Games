const crypto = require('node:crypto');
const statSchema = require('../data/stats.json');

const portraits = ['ignis', 'selene', 'sylphi'];
const imageId = /^(?:ignis|selene|sylphi|asset_[a-f0-9]{64}\.(?:png|jpg|webp))$/;
const identifier = /^[a-z][a-z0-9_]{1,31}$/;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail('알 수 없는 설정 필드입니다.');
}
function number(value, min, max, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(`수치 범위: ${min} ~ ${max}`);
  return value;
}
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x1f\x7f]/.test(value)) fail('이름 또는 설명 길이를 확인하세요.');
  return value.trim();
}
function validId(value) {
  return identifier.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
}
function normalizeCatalog(source, definitions = statSchema.definitions) {
  const document = structuredClone(source);
  document.schema_version = 3;
  const defaults = Object.fromEntries(definitions.map(d => [d.id, d.default]));
  for (const c of Object.values(document.characters)) {
    c.stats = { ...defaults, ...(c.stats === undefined ? { max_hp: c.hp ?? defaults.max_hp, attack: c.attack ?? defaults.attack } : c.stats) };
    delete c.hp;
    delete c.attack;
    if (c.skins === undefined) {
      c.skins = { base: { name: '기본', image: c.portrait, enabled: true } };
      c.default_skin = 'base';
    }
  }
  return document;
}
function validateStats(values, definitions) {
  object(values, definitions.map(d => d.id));
  return Object.fromEntries(definitions.map(d => [d.id, number(values[d.id] === undefined ? d.default : values[d.id], d.min, d.max, d.integer)]));
}
function revisionFor(bytes, schemaBytes) {
  return digest(Buffer.concat([bytes, Buffer.from('\nSOUL_STATS\n'), schemaBytes]));
}
function validateSkins(c) {
  const skins = c.skins ?? { base: { name: '기본', image: c.portrait, enabled: true } };
  if (!skins || typeof skins !== 'object' || Array.isArray(skins) || Object.keys(skins).length < 1 || Object.keys(skins).length > 24) fail('캐릭터별 스킨은 1 ~ 24개까지 등록할 수 있습니다.');
  const result = {};
  for (const [id, skin] of Object.entries(skins)) {
    if (!validId(id)) fail('스킨 ID 형식을 확인하세요.');
    // Cosmetic records deliberately have no gameplay fields.
    object(skin, ['name', 'image', 'enabled']);
    if (typeof skin.enabled !== 'boolean' || !imageId.test(skin.image)) fail('스킨 이미지 또는 공개 상태를 확인하세요.');
    result[id] = { name: text(skin.name, 24), image: skin.image, enabled: skin.enabled };
  }
  const defaultSkin = c.default_skin ?? 'base';
  if (!Object.hasOwn(result, defaultSkin) || !result[defaultSkin].enabled) fail('기본 스킨은 등록되어 있고 공개 상태여야 합니다.');
  return { skins: result, default_skin: defaultSkin };
}
function validate(current, input, definitions = statSchema.definitions) {
  object(input, ['revision', 'characters', 'combat']);
  object(input.combat, ['baseStrike', 'elementBonus', 'actionSeconds']);
  const combat = {
    baseStrike: number(input.combat.baseStrike, 30, 150, true),
    elementBonus: number(input.combat.elementBonus, 0, 0.1),
    actionSeconds: number(input.combat.actionSeconds, 3, 10, true)
  };
  if (!input.characters || typeof input.characters !== 'object' || Array.isArray(input.characters)) fail('캐릭터 목록이 필요합니다.');
  const ids = Object.keys(input.characters);
  if (ids.length < 2 || ids.length > 12) fail('캐릭터는 2 ~ 12명까지 등록할 수 있습니다.');
  const characters = {};
  for (const id of ids) {
    if (!validId(id)) fail('캐릭터 ID 형식을 확인하세요.');
    const c = input.characters[id];
    object(c, ['name', 'english', 'faction', 'color', 'role', 'skill', 'enabled', 'portrait', 'stats', 'active', 'passive_config', 'skins', 'default_skin']);
    if (typeof c.enabled !== 'boolean' || !imageId.test(c.portrait) || !/^#[0-9a-f]{6}$/i.test(c.color || '')) fail('활성화, 원화 또는 색상 값이 올바르지 않습니다.');
    const appearance = validateSkins(c);
    object(c.active, ['type', 'damage', 'cost', 'threshold', 'executeDamage', 'boost']);
    object(c.passive_config, ['type', 'value', 'threshold', 'cap']);
    const a = c.active, p = c.passive_config;
    if (!['damage', 'execute', 'silence', 'boost'].includes(a.type) || !['none', 'burn', 'guard', 'combo'].includes(p.type)) fail('지원하지 않는 스킬/패시브 유형입니다.');
    characters[id] = {
      name: text(c.name, 12), english: text(c.english, 20), faction: number(c.faction, 0, 3, true), color: c.color,
      role: text(c.role, 14), skill: text(c.skill, 12), enabled: c.enabled,
      portrait: appearance.skins[appearance.default_skin].image, ...appearance,
      stats: validateStats(c.stats, definitions),
      active: { type: a.type, damage: number(a.damage, 0, 300, true), cost: number(a.cost, 20, 100, true),
        threshold: number(a.threshold, 0.1, 0.5), executeDamage: number(a.executeDamage, 0, 400, true), boost: number(a.boost, 0, 0.4) },
      passive_config: { type: p.type, value: number(p.value, 0, p.type === 'burn' ? 30 : 0.4, p.type === 'burn'),
        threshold: number(p.threshold, 1, 5, true), cap: number(p.cap, 1, 3, true) }
    };
    if (p.type === 'combo' && p.threshold < 2) fail('콤보 패시브는 직접 만든 2콤보 이상이어야 합니다.');
  }
  if (Object.values(characters).filter(c => c.enabled).length < 2) fail('대전하려면 최소 2명을 활성화해야 합니다.');
  return { ...current, schema_version: 3, combat, characters };
}
module.exports = { portraits, imageId, fail, object, digest, validId, validate, normalizeCatalog, validateStats, revisionFor };
