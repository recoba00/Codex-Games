const assert = require('node:assert/strict');
const sharp = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const read = page => page.evaluate(() => window.SoulLinkIntro.diagnostics());
async function enter(page) {
  await page.waitForFunction(() => Boolean(window.SoulLinkIntro));
  if ((await read(page)).phase === 'film') await page.locator('#intro-skip').click();
  await page.waitForFunction(() => window.SoulLinkIntro.diagnostics().phase === 'title' && window.SoulLinkIntro.diagnostics().engineReady, null, { timeout: 120000 });
  await page.locator('#intro-start').click();
  await page.waitForFunction(() => window.SoulLinkIntro.diagnostics().phase === 'entered');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.gameState), 'running');
  assert.equal(await page.locator('#canvas').evaluate(canvas => canvas.inert), false);
}
async function full(page, prefix) {
  await page.waitForFunction(() => window.SoulLinkIntro?.diagnostics().videoTime > .1);
  const film = await read(page);
  assert.equal(film.phase, 'film'); assert.equal(film.muted, true); assert.equal(film.volume, 0);
  assert.equal(await page.locator('#intro-logo').evaluate(img => getComputedStyle(img).opacity), '0');
  const first = await page.locator('#intro-video').screenshot();
  await page.waitForTimeout(650);
  const second = await page.locator('#intro-video').screenshot();
  assert.ok(!first.equals(second), 'Cinematic must have moving frames');
  const pixels = await sharp(second).stats();
  assert.ok(pixels.channels.some(c => c.stdev > 25), 'Cinematic must not be blank');
  await page.screenshot({ path: prefix + '-film.png' });
  const beforeAudio = await page.evaluate(() => JSON.parse(window.SoulLinkAudio.diagnostics()));
  if (!beforeAudio.unlocked && await page.locator('#intro-sound').isVisible()) await page.locator('#intro-sound').click();
  await page.waitForFunction(() => window.SoulLinkIntro.diagnostics().phase === 'reveal', null, { timeout: 20000 });
  await page.screenshot({ path: prefix + '-drop.png', animations: 'allow' });
  await page.waitForFunction(() => window.SoulLinkIntro.diagnostics().phase === 'title');
  const title = await read(page);
  assert.equal(title.cycleDone, true); assert.ok(title.cycles >= 1); assert.equal(title.loop, true);
  assert.equal(title.skipped, false);
  const secondLoopTime = title.videoTime;
  await page.waitForFunction(time => window.SoulLinkIntro.diagnostics().videoTime < time,
    secondLoopTime, { timeout: 12000 });
  assert.ok(Math.abs(Number(await page.locator('#intro-shade').evaluate(el => getComputedStyle(el).opacity)) - .64) < .01);
  const audio = await page.evaluate(() => JSON.parse(window.SoulLinkAudio.diagnostics()));
  await page.waitForFunction(() => {
    const state = JSON.parse(window.SoulLinkAudio.diagnostics());
    return state.current === 'menu' && state.musicPlaying && state.rms > .001;
  }, null, { timeout: 20000 });
  const loopAudio = await page.evaluate(async () => {
    const state = JSON.parse(window.SoulLinkAudio.diagnostics());
    const script = [...document.scripts].find(item => item.src.endsWith('/audio-bridge.js'));
    const bytes = await (await fetch(new URL('audio/music/menu-technovillain.mp3', script.src))).arrayBuffer();
    const decoder = new OfflineAudioContext(2, 1, 44100);
    const buffer = await decoder.decodeAudioData(bytes);
    const offline = new OfflineAudioContext(buffer.numberOfChannels, buffer.length + 8820, buffer.sampleRate);
    const node = offline.createBufferSource(); node.buffer = buffer; node.loop = true;
    node.connect(offline.destination); node.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    let error = 0, energy = 0;
    for (let i = 0; i < 4410; i++) {
      error = Math.max(error, Math.abs(samples[buffer.length + i] - samples[i]));
      energy += samples[buffer.length - 2205 + i] ** 2;
    }
    return { backend: state.musicBackend, loop: state.musicLoop, duration: state.musicDuration,
      repeatError: error, seamRms: Math.sqrt(energy / 4410) };
  });
  assert.equal(loopAudio.backend, 'decoded-buffer'); assert.equal(loopAudio.loop, true);
  assert.ok(loopAudio.duration > 80 && loopAudio.repeatError < .00001 && loopAudio.seamRms > .00001,
    'Decoded BGM must repeat with non-silent output across its actual loop boundary');
  let naturalMusicLoop = null;
  if (process.env.SOULLINK_LONG_AUDIO === '1') {
    await page.waitForFunction(() => JSON.parse(window.SoulLinkAudio.diagnostics()).musicLoops >= 1,
      null, { timeout: 95000 });
    await page.waitForTimeout(250);
    naturalMusicLoop = await page.evaluate(() => JSON.parse(window.SoulLinkAudio.diagnostics()));
    assert.equal(naturalMusicLoop.musicPlaying, true);
    assert.equal(naturalMusicLoop.state, 'running');
    assert.ok(naturalMusicLoop.musicLoops >= 1 && naturalMusicLoop.rms > .001,
      'The actual menu source must remain audible after a full wall-clock music loop');
  }
  assert.equal(title.muted, true); assert.equal(title.volume, 0);
  await page.evaluate(() => window.SoulLinkHost.visibility(false));
  await page.waitForTimeout(100);
  const frozen = (await read(page)).videoTime;
  await page.waitForTimeout(450);
  assert.ok(Math.abs((await read(page)).videoTime - frozen) < .05);
  await page.evaluate(() => window.SoulLinkHost.visibility(true));
  await page.waitForFunction(time => window.SoulLinkIntro.diagnostics().videoTime !== time, frozen);
  const layouts = [];
  for (const [name, width, height] of [['portrait', 390, 844], ['small', 360, 640], ['landscape', 844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const frame = await page.locator('#intro-video').evaluate(video => {
      const style = getComputedStyle(video), box = video.getBoundingClientRect();
      const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
      return { fit: style.objectFit, width: box.width, height: box.height,
        contentWidth: video.videoWidth * scale, contentHeight: video.videoHeight * scale };
    });
    assert.equal(frame.fit, 'contain');
    assert.ok(frame.contentWidth <= frame.width + 1 && frame.contentHeight <= frame.height + 1, 'Entire video must fit without cropping');
    const logo = await page.locator('#intro-logo').boundingBox(), button = await page.locator('#intro-start').boundingBox();
    const loader = await page.locator('.intro-loading').boundingBox();
    assert.ok(logo.y >= 56 && logo.y + logo.height <= button.y + 1, 'Logo must not cover entry');
    assert.ok(button.height >= 44 && button.y + button.height <= loader.y);
    assert.ok(loader.x >= 16 && loader.x + loader.width <= width - 16 + 1);
    await page.screenshot({ path: prefix + '-' + name + '.png' });
    layouts.push(name);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  return { fullCycleAndLoop: true, nativeSecondLoopObserved: true, videoTrackSilent: true, introBgm: true,
    autoplayOrExplicitMusicGesture: true, gaplessMusicLoop: loopAudio, naturalMusicLoop, uncroppedVideo: true,
    movingFrames: true, backgroundVideoPaused: true, layouts };
}
async function skipGate(page, url) {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  await page.route('**/index.pck', async route => { await hold; await route.continue(); });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('#intro-skip').click();
    await page.waitForFunction(() => {
      const audio = JSON.parse(window.SoulLinkAudio.diagnostics());
      return audio.introRequested && audio.musicPlaying && audio.musicDuration > 0 && audio.rms > .001;
    }, null, { timeout: 15000 });
    await page.waitForFunction(() => window.SoulLinkIntro.diagnostics().phase === 'title');
    const state = await read(page);
    assert.equal(state.skipped, true); assert.equal(state.engineReady, false);
    assert.equal(await page.locator('#intro-start').isDisabled(), true);
    assert.notEqual(await page.locator('#intro-percent').textContent(), '100%');
  } finally { release(); }
  await enter(page);
  await page.unroute('**/index.pck');
  return true;
}
module.exports = { enter, full, skipGate };
