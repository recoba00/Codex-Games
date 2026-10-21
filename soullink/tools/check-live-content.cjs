const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createAdmin, normalizeCatalog, validate, digest } = require('./admin.cjs');
const { createContentStore, inspectImage } = require('./live-content.cjs');
const runtime = 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/';
const { chromium } = require(runtime + 'playwright');
const sharp = require(runtime + 'sharp');
const project = path.resolve(__dirname, '..');
const output = path.join(project, 'artifacts/live-content');
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; console.log('PASS ' + label); };
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json' };

async function main() {
  await fs.mkdir(output, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(project, 'build/live-test-'));
  await fs.mkdir(path.join(fixture, 'data'));
  const source = normalizeCatalog(JSON.parse(await fs.readFile(path.join(project, 'data/game.json'), 'utf8')));
  await fs.writeFile(path.join(fixture, 'data/game.json'), JSON.stringify(source));
  await fs.copyFile(path.join(project, 'data/stats.json'), path.join(fixture, 'data/stats.json'));
  await fs.cp(path.join(project, 'assets/characters'), path.join(fixture, 'assets/characters'), { recursive: true });
  await fs.cp(path.join(project, 'tools/admin'), path.join(fixture, 'tools/admin'), { recursive: true });
  const store = createContentStore({ project: fixture });
  const original = await store.ensure();
  let builds = 0, mode = 'online', boots = 0;
  const admin = createAdmin({ project: fixture, contentStore: store, buildRunner: async () => { builds++; } });
  const dist = path.join(project, 'build/deploy');
  const release = JSON.parse(await fs.readFile(path.join(dist, 'release.json'), 'utf8'));
  const allowed = new Set(release.files.map(file => file.path));
  const pck = path.join(project, 'build/web/index.pck');
  const packHash = digest(await fs.readFile(pck));
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (await admin(req, res, url)) return;
      if (url.pathname === '/content/catalog.json' && mode !== 'online') {
        res.writeHead(mode === 'offline' ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }).end(mode === 'offline' ? '' : '{"format_version":999}'); return;
      }
      if (await store.handle(req, res, url)) return;
      if (!url.pathname.startsWith('/games/soullink/')) { res.writeHead(404).end(); return; }
      const relative = decodeURIComponent(url.pathname.slice('/games/soullink/'.length)) || 'index.html';
      if (!allowed.has(relative)) { res.writeHead(404).end(); return; }
      if (relative === 'index.html') boots++;
      res.writeHead(200, { 'Content-Type': mime[path.extname(relative)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(await fs.readFile(path.join(dist, relative)));
    } catch (error) { console.error(error); if (!res.headersSent) res.writeHead(500); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    let state = await (await fetch(base + '/admin/api/config')).json();
    const post = (route, value, headers = {}) => fetch(base + '/admin/api/' + route, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'X-Soul-Token': state.token, ...headers }, body: JSON.stringify(value) });
    const save = async document => {
      const response = await post('save', { revision: state.revision, characters: document.characters, combat: document.combat });
      assert.equal(response.status, 200, await response.clone().text()); state = { ...state, ...await response.json() }; return state.document;
    };
    const publish = async () => {
      const response = await post('publish', { revision: state.revision }); assert.equal(response.status, 200, await response.clone().text());
      return (await response.json()).published;
    };
    const originalResponse = await fetch(base + '/content/catalog.json');
    check(originalResponse.headers.get('access-control-allow-origin') === '*', 'Public catalog supports cross-origin clients without credentials');
    check((await fetch(base + '/content/catalog.json', { headers: { 'If-None-Match': originalResponse.headers.get('etag') } })).status === 304, 'Unchanged catalog uses ETag');
    check((await fetch(base + '/content/catalog.json', { method: 'POST', body: '{}' })).status === 405, 'Public endpoint cannot mutate data');
    check((await post('publish', { revision: state.revision }, { 'X-Soul-Token': 'bad' })).status === 403, 'Publishing requires admin token');
    check((await post('publish', { revision: state.revision }, { Origin: 'https://evil.invalid' })).status === 403, 'Publishing rejects foreign origin');
    check((await post('publish', { revision: 'stale' })).status === 409, 'Publishing rejects stale draft');
    for (const mutate of [
      c => { c.skins.base.stats = { attack: 9999 }; },
      c => { c.skins.base.active = { type: 'execute' }; },
      c => { c.skins.base.image = '../../secret'; },
      c => { c.default_skin = 'missing'; },
      c => { c.skins.base.enabled = false; }
    ]) { const value = structuredClone(source); mutate(value.characters.ignis); assert.throws(() => validate(source, { characters: value.characters, combat: value.combat })); checks++; }
    check(true, 'Skins reject gameplay fields, paths and invalid defaults');
    assert.throws(() => inspectImage(Buffer.from('<svg>' + 'x'.repeat(100) + '</svg>'))); checks++;
    const imageBytes = await sharp(path.join(project, 'assets/characters/ignis.webp')).resize({ height: 768 }).webp({ quality: 86 }).toBuffer();
    check(inspectImage(imageBytes).height === 768, 'Real raster dimensions parsed');
    const uploadedResponse = await fetch(base + '/admin/api/upload', { method: 'POST', headers: { Origin: base, 'Content-Type': 'image/webp', 'X-Soul-Token': state.token }, body: imageBytes });
    check(uploadedResponse.status === 200, 'New image uploaded without import/export');
    const uploaded = await uploadedResponse.json();
    check((await fetch(base + '/content/assets/' + uploaded.id)).status === 404, 'Unpublished upload remains private');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    await page.addInitScript(url => { window.SOUL_CONTENT_URL = url; }, base + '/content/catalog.json');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/SCRIPT ERROR|Parse Error|Aborted\(/.test(message.text())) errors.push(message.text()); });
    await page.goto(base.replace('127.0.0.1', 'localhost') + '/games/soullink/?qa=1');
    await require('./check-intro.cjs').enter(page);
    await page.waitForFunction(revision => window.__SOUL_LINK_SNAPSHOT__?.content_revision === revision, original.revision, { timeout: 120000 });
    check(true, 'Actual Web runtime loads catalog from a different origin');
    const snapshot = () => page.evaluate(() => window.__SOUL_LINK_SNAPSHOT__);
    async function tap(rect) {
      const state = await snapshot(), bounds = await page.locator('#canvas').boundingBox();
      await page.touchscreen.tap(bounds.x + (rect.x + rect.width / 2) / state.viewport.width * bounds.width, bounds.y + (rect.y + rect.height / 2) / state.viewport.height * bounds.height);
    }
    const click = async key => tap((await snapshot()).rects[key]);
    await click('gallery');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.screen === 'gallery');
    check((await snapshot()).gallery.skins.length === 1, 'Bundled characters start with one base skin');
    let draft = structuredClone(state.document);
    draft.characters.ignis.skins.school_uniform = { name: '교복', image: uploaded.id, enabled: true };
    draft.characters.ignis.skins.swimsuit = { name: '수영복', image: 'ignis', enabled: true };
    draft.characters.ignis.skins.office = { name: '오피스룩', image: 'ignis', enabled: false };
    draft.characters.new_soul = { ...structuredClone(draft.characters.selene), name: '신규 소울', portrait: uploaded.id, skins: { base: { name: '기본', image: uploaded.id, enabled: true } } };
    await save(draft);
    const beforePublish = await (await fetch(base + '/content/catalog.json')).json();
    check(!beforePublish.characters.new_soul && !beforePublish.characters.ignis.skins.school_uniform, 'Draft save does not change public catalog');
    const updated = await publish();
    await page.waitForFunction(revision => window.__SOUL_LINK_SNAPSHOT__?.content_revision === revision && window.__SOUL_LINK_SNAPSHOT__?.characters.includes('new_soul'), updated, { timeout: 30000 });
    check((await snapshot()).gallery.skins.includes('school_uniform') && !(await snapshot()).gallery.skins.includes('office'), 'Open gallery updates live and hides draft skins');
    const nativeRoot = path.join(fixture, 'native-profile');
    await fs.mkdir(nativeRoot, { recursive: true });
    await new Promise((resolve, reject) => {
      const child = spawn('C:/Users/user/Desktop/Godot_v4.7.2-stable_win64.exe/Godot_v4.7.2-stable_win64_console.exe',
        ['--headless', '--path', project, '--script', 'tests/live_native_check.gd', '--', '--content-url=' + base + '/content/catalog.json'],
        { windowsHide: true, env: { ...process.env, APPDATA: nativeRoot, LOCALAPPDATA: nativeRoot, TEMP: nativeRoot, TMP: nativeRoot } });
      let log = '';
      const timer = setTimeout(() => { child.kill(); reject(Error('Native content test timeout')); }, 20000);
      child.stdout.on('data', bytes => { log += bytes; }); child.stderr.on('data', bytes => { log += bytes; });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => {
        clearTimeout(timer);
        fs.writeFile(path.join(output, 'native.log'), log).then(() => {
          if (code === 0 && log.includes('GODOT_LIVE_NATIVE_OK') && !/SCRIPT ERROR|Parse Error/.test(log)) resolve();
          else reject(Error(log));
        }, reject);
      });
    });
    check(true, 'Native Godot also downloads and validates the registered character image over HTTP');
    await tap((await snapshot()).gallery.tiles.school_uniform);
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.gallery.skin === 'school_uniform' && window.__SOUL_LINK_SNAPSHOT__?.gallery.image_loaded, null, { timeout: 15000 });
    await click('skin_apply');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.selected_skins.ignis === 'school_uniform');
    check(true, 'Uploaded skin can be equipped in the running game');
    for (const [label, width, height] of [['portrait', 390, 844], ['small', 360, 640], ['landscape', 844, 390], ['desktop', 1280, 900]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(400);
      const current = await snapshot(), art = current.rects.gallery_art, apply = current.rects.skin_apply;
      await page.screenshot({ path: path.join(output, 'gallery-' + label + '.png') });
      if (apply.y + apply.height > current.viewport.height + 1) console.log(JSON.stringify({ label, art, apply, viewport: current.viewport }));
      check(art.width > 60 && art.height > 70 && art.y >= 0 && art.y + art.height <= current.viewport.height + 1, label + ' gallery art stays within viewport');
      check(apply.y + apply.height <= current.viewport.height + 1, label + ' equip control remains accessible');
      const pixels = await sharp(await page.locator('#canvas').screenshot()).stats();
      check(pixels.channels.slice(0, 3).some(channel => channel.stdev > 25), label + ' renders nonblank artwork');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await click('gallery_close');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.screen === 'prepare');
    await click('start');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.phase === 'player_input');
    check((await snapshot()).battle_skins[0] === 'school_uniform' && (await snapshot()).attack_stats[0] === 100, 'Equipped skin enters battle without stat bonus');
    await click('pause');
    draft.characters.ignis.stats.attack = 123;
    draft.characters.ignis.skins.school_uniform.enabled = false;
    await save(draft);
    const next = await publish();
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.content_pending, null, { timeout: 30000 });
    check((await snapshot()).content_revision === updated && (await snapshot()).attack_stats[0] === 100, 'Live publish cannot alter an ongoing battle');
    await click('back');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.leave_visible);
    await click('leave_confirm');
    await page.waitForFunction(revision => window.__SOUL_LINK_SNAPSHOT__?.screen === 'prepare' && window.__SOUL_LINK_SNAPSHOT__?.content_revision === revision, next);
    check((await snapshot()).selected_skin === 'base', 'Retired selected skin falls back to base at safe boundary');
    await click('start');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.phase === 'player_input');
    check((await snapshot()).attack_stats[0] === 123 && (await snapshot()).battle_skins[0] === 'base', 'Next battle uses published tuning and fallback skin');
    await click('back');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.leave_visible);
    await click('leave_confirm');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.screen === 'prepare');
    mode = 'invalid';
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.content_status.includes('검증 실패'), null, { timeout: 30000 });
    check((await snapshot()).content_revision === next, 'Invalid remote schema retains last valid catalog');
    mode = 'offline';
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.content_status.includes('오프라인'), null, { timeout: 30000 });
    check((await snapshot()).characters.includes('new_soul'), 'Network failure retains registered characters');
    check(builds === 0 && boots === 1 && digest(await fs.readFile(pck)) === packHash, 'All live changes used zero builds, reloads or PCK changes');
    await page.reload();
    await require('./check-intro.cjs').enter(page);
    await page.waitForFunction(revision => window.__SOUL_LINK_SNAPSHOT__?.content_revision === revision, next, { timeout: 120000 });
    check((await snapshot()).characters.includes('new_soul'), 'Last-good catalog survives a page reload while API is unavailable');
    mode = 'online';
    const adminPage = await context.newPage();
    await adminPage.setViewportSize({ width: 1280, height: 900 });
    await adminPage.goto(base + '/admin/');
    await adminPage.locator('[data-character="ignis"]').click();
    await adminPage.locator('#add-skin').click();
    await adminPage.locator('#skin-form [name="id"]').fill('office_test');
    await adminPage.locator('#skin-form [name="name"]').fill('오피스룩');
    await adminPage.locator('#skin-form button.primary').click();
    await adminPage.locator('[data-upload="office_test"]').setInputFiles(path.join(project, 'assets/characters/selene.webp'));
    await adminPage.waitForFunction(() => document.querySelector('#message').textContent.includes('이미지 등록 완료'));
    await adminPage.locator('[data-skin="office_test"] [data-field="enabled"]').check();
    await adminPage.locator('#save').click();
    await adminPage.waitForFunction(() => document.querySelector('#state').textContent.includes('초안 저장됨'));
    await adminPage.locator('#publish').click();
    await adminPage.waitForFunction(() => document.querySelector('#message').textContent.includes('공개 완료'));
    const uiPublished = await (await fetch(base + '/content/catalog.json')).json();
    check(uiPublished.characters.ignis.skins.office_test.image.startsWith('asset_'), 'Admin skin form uploads and publishes an actual image');
    check(uiPublished.characters.ignis.stats.attack === 123, 'Admin cosmetic editing preserves character tuning');
    await adminPage.screenshot({ path: path.join(output, 'admin-desktop.png'), fullPage: true });
    await adminPage.setViewportSize({ width: 360, height: 800 });
    check(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Skin admin has no mobile horizontal overflow');
    await adminPage.screenshot({ path: path.join(output, 'admin-mobile.png'), fullPage: true });
    state = await (await fetch(base + '/admin/api/config')).json();
    const retiredImage = state.document.characters.ignis.skins.office_test.image;
    state.document.characters.ignis.skins.office_test.enabled = false;
    await save(state.document); await publish();
    check((await fetch(base + '/content/assets/' + retiredImage)).status === 200, 'Once-published images remain available to earlier client snapshots');
    check(errors.length === 0, 'Godot/browser emitted no script errors');
    const report = { passed: true, checks, builds, nativeTransportVerified: true, initialBootsBeforeReload: 1, fixture, release: release.release, actualServerDeployment: false, physicalDevice: false, images: 'Existing approved artwork reused only in isolated test fixtures; no new costume illustrations created.' };
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
