const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(__dirname, '..');
const url = new URL(process.argv[2] || 'http://localhost:5175/games/soullink/');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'This test must stay local; no hosting traffic');
url.searchParams.set('qa', '1');
(async () => {
  const report = { passed: false, remoteRequests: [], errors: [], physicalDevice: false, layouts: [] };
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== url.origin) { report.remoteRequests.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', msg => { if (/SCRIPT ERROR|Parse Error|Aborted\(/.test(msg.text())) report.errors.push(msg.text()); });
    await page.goto(url.href);
    await require('./check-intro.cjs').enter(page);
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.screen === 'prepare');
    const state = () => page.evaluate(() => window.__SOUL_LINK_SNAPSHOT__);
    const tap = async name => {
      const s = await state(), r = s.rects[name], b = await page.locator('#canvas').boundingBox();
      await page.touchscreen.tap(b.x + (r.x + r.width / 2) / s.viewport.width * b.width, b.y + (r.y + r.height / 2) / s.viewport.height * b.height);
    };
    await tap('start');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.phase === 'player_input');
    const before = await state();
    await tap('end');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.phase === 'player_action');
    const action = await state();
    assert.equal(action.hp[1], before.hp[1]);
    assert.equal(action.pending.groups.length, 0);
    await page.evaluate(() => window.SoulLinkHost.visibility(false));
    await page.waitForTimeout(200);
    const heldClock = (await state()).action_seconds;
    await page.waitForTimeout(500);
    assert.equal((await state()).action_seconds, heldClock, 'Host hidden freezes action clock');
    await page.evaluate(() => window.SoulLinkHost.visibility(true));
    await tap('end');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__.records === 1);
    assert.ok((await state()).last_strike.damage > 0, 'No attack puzzle still causes a final strike');
    report.noRedBaseline = (await state()).last_strike.damage;
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__.phase === 'player_input');
    // Leave a complete real 15-second puzzle turn and the bounded action timer untouched.
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__.records >= 4 && window.__SOUL_LINK_SNAPSHOT__.phase === 'player_input', null, { timeout: 40000 });
    report.realDeadlineAndAI = true;
    await tap('pause');
    for (const [width, height, insets] of [[390, 844, { top: 59, right: 0, bottom: 34, left: 0 }], [360, 640, { top: 0, right: 0, bottom: 0, left: 0 }], [844, 390, { top: 0, right: 44, bottom: 21, left: 44 }]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(safe => window.SoulLinkHost.safeArea(safe), insets);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false);
      const pixels = await sharp(await page.locator('#canvas').screenshot()).stats();
      assert.ok(pixels.channels.some(c => c.stdev > 20));
      await page.screenshot({ path: path.join(root, `artifacts/combat-web-${width}x${height}.png`) });
      report.layouts.push({ width, height, nonblank: true, simulatedSafeArea: insets });
    }
    report.duel = await require('./check-full-duel.cjs')(page, tap, path.join(root, 'artifacts/combat-web'));
    report.audio = await page.evaluate(() => JSON.parse(window.SoulLinkAudio.diagnostics()));
    assert.ok(report.audio.counts.hit > 0 && report.audio.counts.swap > 0 && report.audio.musicPlaying);
    assert.deepEqual(report.remoteRequests, []);
    assert.deepEqual(report.errors, []);
    const admin = await context.request.get(url.origin + '/admin/api/config');
    const catalog = await admin.json();
    assert.equal(catalog.applied, catalog.revision, 'Admin revision really built into current preview');
    report.realAdminBuildApplied = true;
    report.passed = true;
    await context.close();
  } finally {
    await browser.close();
    await fs.writeFile(path.join(root, 'artifacts/combat-web-report.json'), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });
