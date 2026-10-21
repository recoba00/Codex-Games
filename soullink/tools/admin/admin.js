'use strict';
const $ = selector => document.querySelector(selector);
let documentData, revision, token, applied, selected, published, dirty = false, working = false, job = { state: 'idle' };
let statDefinitions = [];
const passiveNames = { none: '없음', burn: '화상', guard: '직접 피해 감소', combo: '직접 콤보 타격 강화' };
const skillNames = { damage: '직접 피해', execute: '처형', silence: '침묵', boost: '다음 타격 강화' };
const portraits = { ignis: '이그니스', selene: '셀레네', sylphi: '실피' };
function node(tag, text, className) { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; }
function message(value = '') { $('#message').textContent = value; }
function imageURL(id) { return '/admin/images/' + id; }
function update() {
  $('#state').textContent = working || job.state === 'running' ? '처리 중' : dirty ? '미저장 변경 있음' : `초안 저장됨 · 공개 ${published ? published.slice(0, 8) : '없음'}`;
  for (const id of ['save', 'reload', 'build', 'register', 'publish']) $('#' + id).disabled = working || job.state === 'running' || (['build', 'publish'].includes(id) && dirty);
  $('#save').disabled ||= !dirty;
  $('#editor').inert = working || job.state === 'running';
  $('#roster').inert = working || job.state === 'running';
  $('#global-fields').inert = working || job.state === 'running';
}
function changed() { dirty = true; message(); update(); roster(); summaries(); }
function field(parent, labelText, owner, key, { type = 'number', min, max, step = 1, options, percent = false, maxLength } = {}) {
  const label = node('label', labelText, type === 'checkbox' ? 'toggle' : '');
  const input = node(options ? 'select' : 'input');
  input.dataset.field = key;
  if (options) for (const [value, title] of Object.entries(options)) { const option = node('option', title); option.value = value; input.append(option); }
  else input.type = type;
  if (type === 'checkbox') input.checked = owner[key];
  else input.value = percent ? Math.round(owner[key] * 10000) / 100 : owner[key];
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  input.step = step;
  if (maxLength) input.maxLength = maxLength;
  input.addEventListener('input', () => {
    owner[key] = type === 'checkbox' ? input.checked : options || type === 'text' || type === 'color' ? input.value : Number(input.value) / (percent ? 100 : 1);
    changed();
  });
  label.append(input); parent.append(label); return input;
}
function roster() {
  const list = $('#roster'); list.replaceChildren();
  for (const [id, c] of Object.entries(documentData.characters)) {
    const button = node('button', '', 'roster-item'); button.setAttribute('aria-pressed', id === selected); button.dataset.character = id;
    const img = node('img'); img.src = imageURL(c.skins[c.default_skin].image); img.alt = '';
    const title = node('span', c.name); title.append(node('small', `${id} · ${c.enabled ? '활성' : '초안'}`));
    button.append(img, title); button.onclick = () => { selected = id; render(); }; list.append(button);
  }
}
function section(title) { const element = node('section'); element.append(node('h2', title)); const fields = node('div', '', 'fields'); element.append(fields); $('#editor').append(element); return fields; }
function render() {
  roster();
  const c = documentData.characters[selected];
  $('#editor').replaceChildren();
  const identity = node('div', '', 'identity');
  const art = node('img', '', 'art'); art.src = imageURL(c.skins[c.default_skin].image); art.alt = c.name;
  const details = node('div'); details.append(node('p', selected, 'id')); const fields = node('div', '', 'fields two'); details.append(fields); identity.append(art, details); $('#editor').append(identity);
  field(fields, '이름', c, 'name', { type: 'text', maxLength: 12 });
  field(fields, '영문 이름', c, 'english', { type: 'text', maxLength: 20 });
  field(fields, '역할', c, 'role', { type: 'text', maxLength: 14 });
  field(fields, '포인트 색상', c, 'color', { type: 'color' });
  field(fields, '대전 활성화', c, 'enabled', { type: 'checkbox' });
  renderSkins(c);
  const stats = section('기본 능력');
  for (const definition of statDefinitions) {
    const percent = definition.unit === 'percent', scale = percent ? 100 : 1;
    field(stats, definition.label + (percent ? ' (%)' : ''), c.stats, definition.id,
      { min: definition.min * scale, max: definition.max * scale, step: definition.step * scale, percent });
  }
  field(stats, '진영', c, 'faction', { options: { 0: '화염', 1: '월광', 2: '질풍', 3: '중립' } });
  const skills = section('액티브 스킬');
  field(skills, '스킬 이름', c, 'skill', { type: 'text', maxLength: 12 });
  field(skills, '효과', c.active, 'type', { options: skillNames }).addEventListener('change', render);
  field(skills, 'MP 비용', c.active, 'cost', { min: 20, max: 100 });
  field(skills, '기본 피해', c.active, 'damage', { min: 0, max: 300 });
  if (c.active.type === 'execute') {
    field(skills, '처형 발동 HP (%)', c.active, 'threshold', { min: 10, max: 50, percent: true });
    field(skills, '처형 피해', c.active, 'executeDamage', { min: 0, max: 400 });
  }
  if (c.active.type === 'boost') field(skills, '다음 타격 강화 (%)', c.active, 'boost', { min: 0, max: 40, percent: true });
  const passive = section('패시브');
  field(passive, '효과', c.passive_config, 'type', { options: passiveNames }).addEventListener('change', () => {
    Object.assign(c.passive_config, { value: { none: 0, burn: 8, guard: 0.08, combo: 0.25 }[c.passive_config.type], threshold: c.passive_config.type === 'combo' ? 3 : 1, cap: c.passive_config.type === 'burn' ? 3 : 1 }); render();
  });
  if (c.passive_config.type !== 'none') {
    const burn = c.passive_config.type === 'burn';
    field(passive, burn ? '중첩당 화상 피해' : '효과량 (%)', c.passive_config, 'value', { min: 0, max: burn ? 30 : 40, percent: !burn });
    if (burn) field(passive, '최대 중첩', c.passive_config, 'cap', { min: 1, max: 3 });
    if (c.passive_config.type === 'combo') field(passive, '직접 콤보 조건', c.passive_config, 'threshold', { min: 2, max: 5 });
  }
  const summary = node('p', '', 'summary'); summary.id = 'summary'; $('#editor').append(summary); summaries();
  const globals = $('#global-fields'); globals.replaceChildren();
  field(globals, '기본 타격', documentData.combat, 'baseStrike', { min: 30, max: 150 });
  field(globals, '유리 상성 보너스 (%)', documentData.combat, 'elementBonus', { min: 0, max: 10, percent: true });
  field(globals, '행동 선택 시간 (초)', documentData.combat, 'actionSeconds', { min: 3, max: 10 });
  update();
}
function renderSkins(c) {
  const section = node('section', '', 'skin-section');
  const heading = node('div', '', 'section-title'); heading.append(node('h2', '스킨'));
  const add = node('button', '스킨 추가'); add.id = 'add-skin'; add.onclick = () => { $('#skin-form').reset(); $('#new-skin').showModal(); };
  heading.append(add); section.append(heading);
  const list = node('div', '', 'skin-list');
  for (const [id, skin] of Object.entries(c.skins)) {
    const row = node('article', '', 'skin-row'); row.dataset.skin = id;
    const art = node('img', '', 'skin-art'); art.src = imageURL(skin.image); art.alt = `${c.name} ${skin.name}`;
    const fields = node('div', '', 'fields two');
    field(fields, '스킨 이름', skin, 'name', { type: 'text', maxLength: 24 });
    const defaultLabel = node('label', '기본 스킨', 'toggle');
    const radio = node('input'); radio.type = 'radio'; radio.name = 'default-skin'; radio.value = id; radio.checked = c.default_skin === id; radio.disabled = !skin.enabled;
    radio.onchange = () => { c.default_skin = id; c.portrait = skin.image; changed(); render(); };
    defaultLabel.append(radio); fields.append(defaultLabel);
    const enabled = field(fields, '도감 공개', skin, 'enabled', { type: 'checkbox' });
    enabled.disabled = c.default_skin === id; enabled.addEventListener('change', render);
    const upload = node('label', '이미지 등록');
    const input = node('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; input.dataset.upload = id;
    input.onchange = () => uploadImage(c, skin, input.files[0]); upload.append(input); fields.append(upload);
    const remove = node('button', '삭제'); remove.title = '스킨 삭제'; remove.disabled = c.default_skin === id;
    remove.onclick = () => { if (confirm(`${skin.name} 스킨을 삭제할까요?`)) { delete c.skins[id]; changed(); render(); } };
    row.append(art, fields, remove); list.append(row);
  }
  section.append(list); $('#editor').append(section);
}
async function uploadImage(character, skin, file) {
  if (!file) return;
  working = true; update(); message();
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw Error('20MB 이하 PNG/JPG/WebP 파일을 선택하세요.');
    const bitmap = await createImageBitmap(file);
    if (Math.min(bitmap.width, bitmap.height) < 64 || Math.max(bitmap.width, bitmap.height) > 12000) { bitmap.close(); throw Error('이미지 크기를 확인하세요.'); }
    const ratio = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!blob || blob.size > 3 * 1024 * 1024) throw Error('이미지 변환에 실패했습니다.');
    const response = await fetch('/admin/api/upload', { method: 'POST', headers: { 'Content-Type': blob.type, 'X-Soul-Token': token }, body: blob });
    const result = await response.json(); if (!response.ok) throw Error(result.error);
    skin.image = result.id; character.portrait = character.skins[character.default_skin].image;
    changed(); render(); message(`이미지 등록 완료 · ${result.width} × ${result.height}`);
  } catch (error) { message(error.message); }
  finally { working = false; update(); }
}
function summaries() {
  const c = documentData.characters[selected], p = c.passive_config, a = c.active;
  const passive = p.type === 'burn' ? `빨강 매치 후 타격에 화상 · 중첩당 ${p.value} · 최대 ${p.cap}중첩` : p.type === 'guard' ? `받는 직접 피해 ${p.value * 100}% 감소` : p.type === 'combo' ? `직접 만든 ${p.threshold}콤보부터 이번 타격 +${p.value * 100}% · 낙하 연쇄 제외` : '패시브 없음';
  if ($('#summary')) $('#summary').textContent = `${passive} / 스킬 MP ${a.cost} · 기본 피해 ${Math.floor(a.damage * c.stats.attack / 100)}`;
}
async function api(route, input) {
  const response = await fetch('/admin/api/' + route, input ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Soul-Token': token }, body: JSON.stringify(input) } : undefined);
  const result = await response.json(); if (!response.ok) throw Error(result.error); return result;
}
async function load() {
  working = true; update();
  try {
    const result = await api('config'); documentData = result.document; revision = result.revision; token = result.token; applied = result.applied; job = result.job; statDefinitions = result.statDefinitions; published = result.published;
    if (!selected || !documentData.characters[selected]) selected = Object.keys(documentData.characters)[0];
    dirty = false; render(); message(); if (job.state === 'running') poll();
  } catch (error) { message(error.message); }
  finally { working = false; update(); }
}
async function poll() {
  try {
    job = await api('job'); $('#build-status').hidden = false; $('#build-log').textContent = job.log;
    update();
    if (job.state === 'running') setTimeout(poll, 1000);
    else if (job.state === 'succeeded') { applied = job.revision; message('미리보기 빌드 완료. 게임을 새로고침하면 적용됩니다.'); update(); }
    else message('빌드 실패. 하단 로그를 확인한 뒤 다시 빌드하세요.');
  } catch (error) { message(error.message); }
}
$('#reload').onclick = () => { if (!dirty || confirm('미저장 변경을 버리고 다시 불러올까요?')) load(); };
$('#save').onclick = async () => {
  working = true; update();
  try { const result = await api('save', { revision, characters: documentData.characters, combat: documentData.combat }); revision = result.revision; documentData = result.document; dirty = false; message('초안 저장 완료. 인게임 공개 전까지 기존 공개본이 유지됩니다.'); render(); }
  catch (error) { message(error.message); } finally { working = false; update(); }
};
$('#build').onclick = async () => {
  working = true; update(); message();
  try { job = await api('build', { revision }); poll(); } catch (error) { message(error.message); } finally { working = false; update(); }
};
$('#publish').onclick = async () => {
  working = true; update(); message();
  try { const result = await api('publish', { revision }); published = result.published; message('공개 완료. 준비 화면·도감에 최대 10초 내 반영됩니다. 진행 중 대전은 다음 경기부터 적용됩니다.'); }
  catch (error) { message(error.message); } finally { working = false; update(); }
};
$('#register').onclick = () => { $('#register-form').reset(); $('#new-character').showModal(); };
$('#cancel-register').onclick = () => $('#new-character').close();
$('#register-form').onsubmit = event => {
  event.preventDefault();
  const values = new FormData(event.target), id = values.get('id');
  if (Object.hasOwn(documentData.characters, id) || ['constructor', 'prototype'].includes(id)) { alert('이미 사용 중인 ID입니다.'); return; }
  if (Object.keys(documentData.characters).length >= 12) { alert('캐릭터는 최대 12명까지 등록할 수 있습니다.'); return; }
  documentData.characters[id] = { name: values.get('name'), english: id.toUpperCase().slice(0, 20), role: '신규 캐릭터', skill: '소울 스트라이크', portrait: values.get('portrait'), default_skin: 'base', skins: { base: { name: '기본', image: values.get('portrait'), enabled: true } }, faction: 3, color: '#e7b456', enabled: false, stats: Object.fromEntries(statDefinitions.map(d => [d.id, d.default])),
    active: { type: 'damage', damage: 150, cost: 40, threshold: 0.3, executeDamage: 150, boost: 0 }, passive_config: { type: 'none', value: 0, threshold: 1, cap: 1 } };
  selected = id; $('#new-character').close(); changed(); render();
};
$('#cancel-skin').onclick = () => $('#new-skin').close();
$('#skin-form').onsubmit = event => {
  event.preventDefault();
  const values = new FormData(event.target), id = values.get('id'), c = documentData.characters[selected];
  if (Object.hasOwn(c.skins, id) || ['constructor', 'prototype', '__proto__'].includes(id)) { alert('이미 사용 중인 ID입니다.'); return; }
  if (Object.keys(c.skins).length >= 24) { alert('스킨은 최대 24개까지 등록할 수 있습니다.'); return; }
  c.skins[id] = { name: values.get('name'), image: c.skins[c.default_skin].image, enabled: false };
  $('#new-skin').close(); changed(); render();
};
addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
load();
