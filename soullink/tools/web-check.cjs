const { chromium } = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const prefix = '/games/soullink/';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const remote = process.argv[2]?.startsWith('http') ? process.argv[2] : undefined;
const duelOnly = process.argv.includes('--duel-only');

(async () => {
  let server, browser;
  const report = { passed: false, checks: [], errors: [], warnings: [], physical_device_install_test: false, offline_support: false };
  try {
    let urls;
    if (remote) urls = [remote];
    else {
      const dist = path.join(root, 'build/deploy');
      const content = require('./live-content.cjs').createContentStore({ project: root });
      server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url, 'http://soullink.test');
          if (await content.handle(req, res, url)) return;
          assert.ok(url.pathname.startsWith(prefix));
          const file = path.resolve(dist, decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html');
          assert.ok(file.startsWith(dist + path.sep));
          res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(await fs.readFile(file));
        } catch { res.writeHead(404).end(); }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      urls = [`http://127.0.0.1:${server.address().port}${prefix}`, `http://soullink.test:${server.address().port}${prefix}`];
    }
    browser = await chromium.launch({ channel: 'msedge', headless: true,
      args: remote ? [] : ['--no-proxy-server', '--host-resolver-rules=MAP soullink.test 127.0.0.1'] });
    for (const url of duelOnly ? urls.slice(0, 1) : urls) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
      const page = await context.newPage();
      const started = Date.now();
      const transfers = [];
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('console', message => {
        const value = message.text();
        console.log('BROWSER ' + message.type() + ' ' + value.slice(0, 300));
        if (/SCRIPT ERROR|Parse Error|Aborted\(/.test(value)) report.errors.push(value);
        else if (message.type() === 'warning' || message.type() === 'error') report.warnings.push(value.slice(0, 500));
      });
      page.on('response', response => {
        console.log('HTTP ' + response.status() + ' ' + response.url());
        if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`);
        if (response.status() === 304) return;
        if (/\/index\.(wasm|pck|js)$/.test(response.url())) {
          const info = { url: response.url(), contentEncoding: response.headers()['content-encoding'] || 'identity',
            contentType: response.headers()['content-type'] || '', contentLength: Number(response.headers()['content-length'] || 0) };
          const previous = transfers.findIndex(item => item.url === info.url);
          if (previous < 0) transfers.push(info); else transfers[previous] = info;
        }
      });
      const qaUrl = new URL(url);
      qaUrl.searchParams.set('qa', '1');
      assert.equal((await page.goto(qaUrl.href, { waitUntil: 'domcontentloaded', timeout: 120000 })).status(), 200);
      console.log('WEB_CHECK_START ' + url);
      const introTag = remote ? (url.includes('/releases/') ? 'staging' : 'live') : new URL(url).hostname === '127.0.0.1' ? 'local' : 'http';
      const cinematic = duelOnly ? (await require('./check-intro.cjs').enter(page), null) : await require('./check-intro.cjs').full(page, path.join(root, `artifacts/intro/${introTag}`));
      try {
        await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.screen === 'prepare', null, { timeout: 120000 });
      } catch (error) {
        await page.screenshot({ path: path.join(root, 'artifacts/web-failure.png') });
        console.error(await page.evaluate(() => ({ state: document.documentElement.dataset.gameState, intro: window.SoulLinkIntro.diagnostics(),
          snapshot: window.__SOUL_LINK_SNAPSHOT__, flag: window.__SOUL_LINK_QA__ })));
        throw error;
      }
      assert.equal(await page.evaluate(() => document.documentElement.dataset.gameState), 'running');
      assert.equal((await page.evaluate(() => window.__SOUL_LINK_SNAPSHOT__)).visual_style, 'tactical-v2');
      const startupMs = Date.now() - started;
      const head = await page.evaluate(() => ({ secure: isSecureContext, manifest: document.querySelector('link[rel="manifest"]').href,
        viewportCount: document.querySelectorAll('meta[name="viewport"]').length, apple: document.querySelector('meta[name="apple-mobile-web-app-capable"]').content }));
      assert.equal(head.viewportCount, 1); assert.equal(head.apple, 'yes');
      function requestUrl(value) {
        const target = new URL(value);
        if (!remote && target.hostname === 'soullink.test') target.hostname = '127.0.0.1';
        return target.href;
      }
      const response = await context.request.get(requestUrl(head.manifest));
      assert.equal(response.status(), 200);
      const manifest = await response.json();
      assert.equal(manifest.display, 'standalone');
      for (const icon of manifest.icons) {
        const image = await context.request.get(requestUrl(new URL(icon.src, head.manifest).href));
        assert.equal(image.status(), 200);
        const info = await sharp(await image.body()).metadata();
        assert.equal(`${info.width}x${info.height}`, icon.sizes);
      }
      const cdp = await context.newCDPSession(page);
      const appManifest = await cdp.send('Page.getAppManifest');
      assert.deepEqual(appManifest.errors, []);
      const installability = await cdp.send('Page.getInstallabilityErrors');
      if (!head.secure) assert.ok(installability.installabilityErrors.some(e => e.errorId === 'not-from-secure-origin'));
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'display-mode', value: 'standalone' }] });
      const tag = remote ? (url.includes('/releases/') ? 'staging' : 'live') : (head.secure ? 'local' : 'http');
      await page.screenshot({ path: path.join(root, `artifacts/web-${tag}-prepare.png`) });
      async function state() { return page.evaluate(() => window.__SOUL_LINK_SNAPSHOT__); }
      async function clickControl(name) {
        const snapshot = await state(), rect = snapshot.rects[name];
        const bounds = await page.locator('#canvas').boundingBox();
        await page.touchscreen.tap(bounds.x + (rect.x + rect.width / 2) / snapshot.viewport.width * bounds.width,
          bounds.y + (rect.y + rect.height / 2) / snapshot.viewport.height * bounds.height);
      }
      if (duelOnly) {
        await clickControl('start');
        await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.phase === 'player_input');
        report.checks.push({ url, full_duel: await require('./check-full-duel.cjs')(page, clickControl, path.join(root, 'artifacts/web-duel-only')) });
        await context.close();
        continue;
      }
      const audioCheck = await require('./check-audio.cjs')(page, clickControl, path.join(root, `artifacts/web-${tag}-audio.png`));
      await clickControl('start');
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.screen === 'battle');
      const intro = await state();
      assert.equal(intro.phase, 'turn_intro'); assert.equal(intro.seconds, 15);
      await page.screenshot({ path: path.join(root, `artifacts/web-${tag}-turn.png`) });
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.phase === 'player_input');
      await clickControl('spell');
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.spell_used === true);
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.presentation_step === 'impact' && window.__SOUL_LINK_SNAPSHOT__?.presentation_progress >= .38);
      await page.evaluate(() => window.SoulLinkHost.visibility(false));
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.host_visible === false);
      await page.screenshot({ path: path.join(root, `artifacts/web-${tag}-impact.png`) });
      const impactPixels = await sharp(await page.locator('#canvas').screenshot()).stats();
      assert.ok(impactPixels.channels.slice(0, 3).some(channel => channel.max > 240 && channel.stdev > 20));
      await page.evaluate(() => window.SoulLinkHost.visibility(true));
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.phase === 'player_input');
      // Real pointer drag, sampled at the game's input cadence, then real AI processing.
      const before = await state(), bounds = await page.locator('#canvas').boundingBox();
      const board = before.rects.board, tile = Math.min(board.width / 6, (board.height - 48) / 5);
      const origin = { x: board.x + (board.width - tile * 6) / 2, y: board.y + 48 + (board.height - 48 - tile * 5) / 2 };
      const point = cell => ({ x: bounds.x + (origin.x + (cell % 6 + .5) * tile) / before.viewport.width * bounds.width,
        y: bounds.y + (origin.y + (Math.floor(cell / 6) + .5) * tile) / before.viewport.height * bounds.height });
      const first = point(11);
      await page.mouse.move(first.x, first.y); await page.mouse.down();
      for (const cell of [10, 9]) { await page.waitForTimeout(150); const next = point(cell); await page.mouse.move(next.x, next.y); }
      await page.mouse.up();
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.phase === 'ai_move');
      await page.screenshot({ path: path.join(root, `artifacts/web-${tag}-ai.png`) });
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.records >= 2 && window.__SOUL_LINK_SNAPSHOT__?.phase === 'player_input', null, { timeout: 25000 });
      const afterDrag = await state(); assert.equal(afterDrag.round, 2);
      await page.waitForFunction(baseline => JSON.parse(window.SoulLinkAudio.diagnostics()).counts.hit > baseline, audioCheck.effectHitBaseline || 0);
      const combatAudio = await page.evaluate(() => JSON.parse(window.SoulLinkAudio.diagnostics()));
      assert.equal(combatAudio.current, 'battle'); assert.ok(combatAudio.musicPlaying);
      assert.ok(combatAudio.counts.swap > 0 && combatAudio.counts.drop > 0);
      const seen = new Set(afterDrag.presentation_trace.map(step => step.kind));
      for (const step of ['turn', 'impact', 'ai_move', 'match', 'drop']) assert.ok(seen.has(step), 'Missing feedback step ' + step);
      // A real 15-second idle turn must resolve and allow the AI to respond.
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.records >= 4, null, { timeout: 45000 });
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.phase === 'player_input');
      await clickControl('pause');
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.paused === true);
      await clickControl('pause');
      await page.waitForTimeout(300);
      await page.evaluate(() => window.SoulLinkHost.visibility(false));
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.host_visible === false);
      const frozen = (await state()).seconds;
      await page.waitForTimeout(1100);
      await page.evaluate(() => window.SoulLinkHost.visibility(true));
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.host_visible === true);
      assert.ok(Math.abs((await state()).seconds - frozen) < .15, 'Hidden host advanced the clock');
      await clickControl('pause');
      await page.evaluate(() => window.SoulLinkHost.back());
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.leave_visible === true);
      await page.evaluate(() => window.SoulLinkHost.back());
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.leave_visible === false);
      assert.equal((await state()).paused, true, 'Back cancel lost manual pause');
      await page.evaluate(() => window.SoulLinkHost.back());
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.leave_visible === true);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.screen === 'lobby' && !window.__SOUL_LINK_SNAPSHOT__.transitioning);
      await page.evaluate(() => window.SoulLinkHost.back());
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.exit_visible === true);
      await page.evaluate(() => window.SoulLinkHost.back());
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.exit_visible === false);
      await clickControl('lobby_practice');
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.screen === 'prepare' && !window.__SOUL_LINK_SNAPSHOT__.transitioning);
      await clickControl('start');
      await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.phase === 'player_input');
      await clickControl('pause');
      const layouts = [];
      for (const [name, width, height, safe] of [
        ['portrait', 390, 844, { top: 59, right: 0, bottom: 34, left: 0 }],
        ['small', 360, 640, { top: 0, right: 0, bottom: 0, left: 0 }],
        ['landscape', 844, 390, { top: 0, right: 44, bottom: 21, left: 44 }]
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(insets => window.SoulLinkHost.safeArea(insets), safe);
        await page.waitForTimeout(500);
        const layout = await page.evaluate(() => ({ canvas: document.querySelector('#canvas').getBoundingClientRect().toJSON(),
          width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight }));
        assert.equal(layout.overflow, false);
        assert.ok(Math.abs(layout.canvas.x - safe.left) < 1 && Math.abs(layout.canvas.y - safe.top) < 1);
        assert.ok(Math.abs(layout.canvas.width - (width - safe.left - safe.right)) < 1);
        assert.ok(Math.abs(layout.canvas.height - (height - safe.top - safe.bottom)) < 1);
        const pixels = await sharp(await page.locator('#canvas').screenshot()).stats();
        assert.ok(pixels.channels.slice(0, 3).some(channel => channel.stdev > 20), 'Blank canvas');
        await page.screenshot({ path: path.join(root, `artifacts/web-${tag}-${name}.png`) });
        layouts.push({ name, simulated_safe_area: safe, ...layout, nonblank: true });
      }
      const fullDuel = await require('./check-full-duel.cjs')(page, clickControl, path.join(root, `artifacts/web-${tag}`));
      report.checks.push({ url, head, startupMs, transfers, installability: installability.installabilityErrors, manifestParsed: true,
        host_visibility_clock_frozen: true, host_back_and_exit_confirmation: true,
        turn_banner: true, clock_unspent_during_intro: true, visual_ai_swap: true, exact_effect_presentation: true,
        tactical_hud: true, textured_impact_nonblank: true,
        audio: audioCheck, combat_audio: true, cinematic_intro: cinematic, full_duel: fullDuel,
        real_spell_tap: true, real_drag_and_ai_round: afterDrag.round, real_timeout_and_ai: true, final: await state(), layouts });
      await context.close();
      const production = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      const cleanPage = await production.newPage();
      cleanPage.on('pageerror', error => report.errors.push(error.message));
      const ready = cleanPage.waitForEvent('console', { predicate: message => message.text() === 'SOUL_LINK_UI_READY', timeout: 120000 });
      report.checks.at(-1).cinematic_intro.skipAndLoadingGate = await require('./check-intro.cjs').skipGate(cleanPage, url);
      await ready;
      assert.equal(await cleanPage.evaluate(() => window.__SOUL_LINK_SNAPSHOT__), undefined);
      await cleanPage.screenshot({ path: path.join(root, `artifacts/web-${tag}-production.png`) });
      report.checks.at(-1).production_without_qa_flag = true;
      await production.close();
    }
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    const tag = duelOnly ? 'duel-only' : remote ? (remote.includes('/releases/') ? 'staging' : 'live') : 'local';
    await fs.writeFile(path.join(root, `artifacts/web-${tag}-report.json`), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });
