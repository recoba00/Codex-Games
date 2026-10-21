const { chromium } = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const { spawn } = require('node:child_process');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const project = path.join(root, 'platform/toss');

(async () => {
  let browser, server, contentServer;
  const report = { passed: false, officialDevtoolsMock: true, realTossApp: false, errors: [], warnings: [] };
  try {
    const content = require('./live-content.cjs').createContentStore({ project: root });
    const published = await content.ensure();
    contentServer = http.createServer(async (req, res) => {
      if (!await content.handle(req, res, new URL(req.url, 'http://localhost'))) res.writeHead(404).end();
    });
    await new Promise(resolve => contentServer.listen(0, '127.0.0.1', resolve));
    const catalogURL = `http://127.0.0.1:${contentServer.address().port}/content/catalog.json`;
    const socket = net.createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    const url = `http://127.0.0.1:${port}/?qa=1`;
    server = spawn(process.execPath, [path.join(project, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { cwd: project, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', bytes => process.stdout.write(bytes));
    server.stderr.on('data', bytes => process.stderr.write(bytes));
    for (let retry = 0; retry < 100; retry++) {
      try { if ((await fetch(url)).ok) break; } catch {}
      if (retry === 99) throw Error('Vite devtools did not start');
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    await page.addInitScript(url => { window.SOUL_CONTENT_URL = url; }, catalogURL);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => {
      if (/SCRIPT ERROR|Parse Error|Aborted\(/.test(message.text())) report.errors.push(message.text());
      else if (['error', 'warning'].includes(message.type())) report.warnings.push(message.text().slice(0, 500));
    });
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    const start = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    report.cinematicIntro = await require('./check-intro.cjs').full(page, path.join(root, 'artifacts/intro/toss'));
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.screen === 'prepare' && document.documentElement.dataset.host === 'toss', null, { timeout: 120000 });
    await page.waitForFunction(revision => window.__SOUL_LINK_SNAPSHOT__?.content_revision === revision, published.revision);
    report.startupMs = Date.now() - start;
    assert.equal(await page.locator('iframe').count(), 0);
    assert.ok(requests.some(value => value.includes('/engine/index.wasm')));
    assert.ok(!requests.some(value => value.includes('dothome')));
    await page.evaluate(async () => {
      const { aitState } = await import('/node_modules/@apps-in-toss/devtools/dist/mock/3x.js');
      aitState.patch('safeAreaInsets', { top: 59, right: 0, bottom: 34, left: 0 });
    });
    await page.waitForFunction(() => document.querySelector('#canvas').getBoundingClientRect().y === 59);
    const canvas = await page.locator('#canvas').boundingBox();
    assert.equal(canvas.height, 751);
    const state = () => page.evaluate(() => window.__SOUL_LINK_SNAPSHOT__);
    async function tap(name) {
      const snapshot = await state(), rect = snapshot.rects[name], canvas = await page.locator('#canvas').boundingBox();
      await page.touchscreen.tap(canvas.x + (rect.x + rect.width / 2) / snapshot.viewport.width * canvas.width,
        canvas.y + (rect.y + rect.height / 2) / snapshot.viewport.height * canvas.height);
    }
    await tap('gallery');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.screen === 'gallery');
    await page.evaluate(async () => {
      const { aitState } = await import('/node_modules/@apps-in-toss/devtools/dist/mock/3x.js');
      aitState.trigger('backEvent');
    });
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.screen === 'prepare');
    report.liveContentMockEndpoint = true;
    report.galleryBackEvent = true;
    report.audio = await require('./check-audio.cjs')(page, tap, path.join(root, 'artifacts/toss-devtools-audio.png'));
    await tap('start');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.phase === 'player_input');
    await tap('end');
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.round === 2 && window.__SOUL_LINK_SNAPSHOT__?.phase === 'player_input');
    await tap('pause');
    await page.evaluate(async () => {
      const { aitState } = await import('/node_modules/@apps-in-toss/devtools/dist/mock/3x.js');
      aitState.trigger('backEvent');
    });
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.leave_visible === true);
    await page.screenshot({ path: path.join(root, 'artifacts/toss-devtools-back.png') });
    await page.evaluate(async () => {
      const { aitState } = await import('/node_modules/@apps-in-toss/devtools/dist/mock/3x.js');
      aitState.trigger('backEvent');
    });
    await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.leave_visible === false);
    assert.equal((await state()).paused, true);
    const pixels = await sharp(await page.locator('#canvas').screenshot()).stats();
    assert.ok(pixels.channels.some(channel => channel.stdev > 20));
    await page.screenshot({ path: path.join(root, 'artifacts/toss-devtools-battle.png') });
    Object.assign(report, { officialSdkSafeAreaSubscription: true, officialSdkBackEvent: true, actualAiRound: 2,
      noIframeOrDothomeGame: true, nonblank: true, passed: report.errors.length === 0 });
    assert.deepEqual(report.errors, []);
  } finally {
    await browser?.close();
    if (contentServer) { contentServer.closeAllConnections(); await new Promise(resolve => contentServer.close(resolve)); }
    if (server && server.exitCode === null) {
      const closed = new Promise(resolve => server.once('exit', resolve));
      server.kill(); await closed;
    }
    await fs.writeFile(path.join(root, 'artifacts/toss-devtools-report.json'), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });
