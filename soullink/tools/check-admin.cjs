const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { createAdmin, validate, normalizeCatalog } = require('./admin.cjs');
const { chromium } = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const project = path.resolve(__dirname, '..');
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
async function main() {
  const fixture = await fs.mkdtemp(path.join(project, 'build/admin-test-'));
  await fs.mkdir(path.join(fixture, 'data'));
  const source = JSON.parse(await fs.readFile(path.join(project, 'data/game.json'), 'utf8'));
  const configFile = path.join(fixture, 'data/game.json');
  const legacy = structuredClone(source);
  for (const c of Object.values(legacy.characters)) { c.hp = c.stats.max_hp; c.attack = c.stats.attack; delete c.stats; }
  delete legacy.schema_version;
  const normalized = normalizeCatalog(legacy);
  check(normalized.characters.ignis.stats.max_hp === 1000 && normalized.characters.ignis.stats.crit_chance === 0 && !('hp' in normalized.characters.ignis), 'Legacy stats normalize without duplicate sources of truth');
  await fs.writeFile(configFile, JSON.stringify(legacy));
  await fs.copyFile(path.join(project, 'data/stats.json'), path.join(fixture, 'data/stats.json'));
  await fs.cp(path.join(project, 'tools/admin'), path.join(fixture, 'tools/admin'), { recursive: true });
  await fs.cp(path.join(project, 'assets/characters'), path.join(fixture, 'assets/characters'), { recursive: true });
  const valid = { revision: '', characters: source.characters, combat: source.combat };
  check(Object.keys(validate(source, valid).characters).length === 3, 'Default catalog validates');
  const partial = structuredClone(valid);
  delete partial.characters.ignis.stats.crit_chance;
  check(validate(source, partial).characters.ignis.stats.crit_chance === 0, 'Newly introduced fields use safe defaults');
  const extendedDefinitions = [...require('../data/stats.json').definitions, { id: 'future_bonus', default: 7, min: 0, max: 100, integer: true }];
  check(validate(source, valid, extendedDefinitions).characters.ignis.stats.future_bonus === 7, 'Registry extension preserved without a character schema rewrite');
  const bad = [
    value => { value.characters.ignis.portrait = '../../private'; },
    value => { value.characters.ignis.stats.max_hp = 0; },
    value => { value.characters.ignis.stats.crit_chance = 1.01; },
    value => { value.characters.ignis.stats.crit_damage = 0.5; },
    value => { value.characters.ignis.stats.damage_reduction = 1; },
    value => { value.characters.ignis.stats.defense = -1; },
    value => { value.characters.ignis.stats.defense = '100'; },
    value => { value.characters.ignis.stats.atack = 100; },
    value => { value.characters.ignis.active.cost = -1; },
    value => { value.characters.ignis.passive_config.type = 'script'; },
    value => { value.characters.ignis.active.code = 'anything'; },
    value => { value.characters.ignis.passive_config.value = 1000; },
    value => { value.characters.ignis.color = 'url(https://invalid)'; },
    value => { value.combat.elementBonus = 0.2; },
    value => { value.combat.actionSeconds = '6'; },
    value => { value.characters.ignis.enabled = 'true'; },
    value => { for (const c of Object.values(value.characters)) c.enabled = false; },
    value => { value.characters['../evil'] = value.characters.ignis; },
    value => { value.characters.constructor = value.characters.ignis; },
    value => { value.characters.ignis.name = 'a'.repeat(30); }
  ];
  for (const mutate of bad) { const value = structuredClone(valid); mutate(value); assert.throws(() => validate(source, value)); checks++; }
  let finish;
  const handler = createAdmin({ project: fixture, buildRunner: async log => { log('Test build runner; not an engine build.'); await new Promise(resolve => { finish = resolve; }); } });
  const server = http.createServer(async (req, res) => { if (!await handler(req, res, new URL(req.url, 'http://localhost'))) res.writeHead(404).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const state = await (await fetch(url + '/admin/api/config')).json();
    check(Boolean(state.token && state.revision), 'Session token and optimistic revision');
    check(state.statDefinitions.length === 6 && state.document.characters.ignis.stats.crit_damage === 1.5, 'API exposes shared definitions and safe defaults');
    const post = (route, body, overrides = {}) => fetch(url + '/admin/api/' + route, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json', 'X-Soul-Token': state.token, ...overrides }, body: JSON.stringify(body) });
    const reboundStatus = await new Promise((resolve, reject) => { http.get(url + '/admin/api/config', { headers: { Host: 'evil.invalid' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject); });
    check(reboundStatus === 403, 'DNS rebinding Host rejected');
    check((await post('save', valid, { Origin: 'https://evil.invalid' })).status === 403, 'Foreign Origin rejected');
    check((await post('save', valid, { 'X-Soul-Token': 'wrong' })).status === 403, 'Missing token rejected');
    check((await post('save', valid, { 'Content-Type': 'text/plain' })).status === 403, 'Non-JSON rejected');
    check((await post('save', valid)).status === 409, 'Stale revision rejected');
    const data = { ...structuredClone(valid), revision: state.revision };
    data.characters.test_guard = { ...structuredClone(data.characters.selene), enabled: false, name: '테스트 수호자', portrait: 'sylphi' };
    data.characters.test_guard.stats.max_hp = 1234;
    const saved = await post('save', data);
    check(saved.status === 200, 'Character registered and saved');
    const next = await saved.json();
    check(JSON.parse(await fs.readFile(configFile, 'utf8')).characters.test_guard.stats.max_hp === 1234, 'Actual file persists numeric tuning');
    check((await fs.readdir(path.join(fixture, 'build/config-backups'))).length === 1, 'Previous catalog backed up');
    check((await post('save', data)).status === 409, 'Another stale window cannot overwrite');
    check((await post('save', { ...data, revision: next.revision, characters: { wrong: {} } })).status === 400, 'Invalid write rejected');
    check((await post('build', { revision: next.revision })).status === 202, 'Build accepted');
    check((await post('save', { ...data, revision: next.revision })).status === 409, 'Save locked during build');
    check((await post('build', { revision: next.revision })).status === 409, 'No concurrent build');
    finish();
    for (let i = 0; i < 100; i++) { const job = await (await fetch(url + '/admin/api/job')).json(); if (job.state === 'succeeded') break; await new Promise(resolve => setTimeout(resolve, 20)); }
    check((await (await fetch(url + '/admin/api/config')).json()).applied === next.revision, 'Applied revision tracked after build');
    const schemaFile = path.join(fixture, 'data/stats.json');
    const originalSchema = await fs.readFile(schemaFile, 'utf8');
    await fs.writeFile(schemaFile, originalSchema + '\n');
    check((await (await fetch(url + '/admin/api/config')).json()).revision !== next.revision, 'Registry edits invalidate stale windows/build status');
    await fs.writeFile(schemaFile, originalSchema);
    const denied = { status: 0, setHeader() {}, writeHead(status) { this.status = status; return this; }, end() {} };
    await handler({ method: 'GET', headers: { host: `127.0.0.1:9999` }, socket: { remoteAddress: '192.168.0.2', localPort: 9999 } }, denied, new URL(url + '/admin/api/config'));
    check(denied.status === 403, 'LAN admin access denied');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url + '/admin/');
    await page.locator('[data-character="test_guard"]').click();
    await page.locator('[data-field="max_hp"]').fill('1300');
    await page.locator('[data-field="defense"]').fill('150');
    await page.locator('[data-field="crit_chance"]').fill('17.5');
    await page.locator('[data-field="crit_damage"]').fill('225');
    await page.locator('[data-field="damage_reduction"]').fill('12.5');
    await page.locator('#save').click();
    await page.waitForFunction(() => document.querySelector('#state').textContent.includes('초안 저장됨'));
    const tuned = JSON.parse(await fs.readFile(configFile, 'utf8')).characters.test_guard.stats;
    check(tuned.max_hp === 1300 && tuned.defense === 150 && tuned.crit_chance === 0.175 && tuned.crit_damage === 2.25 && tuned.damage_reduction === 0.125, 'Browser converts all six stat fields and percentages into real data');
    await page.locator('#register').click();
    await page.locator('#register-form [name="id"]').fill('new_soul');
    await page.locator('#register-form [name="name"]').fill('신규 소울');
    await page.locator('#register-form button.primary').click();
    await page.locator('#save').click();
    await page.waitForFunction(() => document.querySelector('#state').textContent.includes('초안 저장됨'));
    check(JSON.parse(await fs.readFile(configFile, 'utf8')).characters.new_soul.enabled === false, 'Browser registration creates disabled draft');
    check(JSON.parse(await fs.readFile(configFile, 'utf8')).characters.new_soul.stats.crit_chance === 0, 'New character uses neutral stat defaults');
    await page.locator('[data-character="test_guard"]').click();
    await page.screenshot({ path: path.join(project, 'artifacts/admin-desktop.png'), fullPage: true });
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Admin has no mobile horizontal overflow');
      check(await page.locator('.art').evaluate(img => img.complete && img.naturalWidth > 0), 'Real approved portrait rendered');
    }
    await page.screenshot({ path: path.join(project, 'artifacts/admin-mobile.png'), fullPage: true });
    check(errors.length === 0, 'Browser has no JS errors');
    await context.close();
    const report = { checks, passed: true, api: true, browser: true, buildRunner: 'mock only; real engine build is tested separately', fixture };
    await fs.writeFile(path.join(project, 'artifacts/admin-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
