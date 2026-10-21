const assert = require('node:assert/strict');
module.exports = async function checkAudio(page, click, screenshot) {
  const read = () => page.evaluate(() => JSON.parse(window.SoulLinkAudio.diagnostics()));
  assert.equal((await read()).unlocked, true, 'Title entry must unlock audio with its gesture');
  await click('sound');
  await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.sound_visible === true);
  await page.waitForFunction(() => {
    const audio = JSON.parse(window.SoulLinkAudio.diagnostics());
    return audio.unlocked && audio.musicPlaying && audio.musicSeconds > .15 && audio.decoded.length === 13;
  }, null, { timeout: 15000 }).catch(async error => {
    console.error('AUDIO_NOT_READY', await read(), await page.evaluate(() => window.__SOUL_LINK_SNAPSHOT__));
    await page.screenshot({ path: screenshot });
    throw error;
  });
  await page.waitForFunction(() => JSON.parse(window.SoulLinkAudio.diagnostics()).rms > .001, null, { timeout: 10000 });
  const audible = await read();
  await page.screenshot({ path: screenshot });
  await click('music_volume'); await page.keyboard.press('Home');
  await page.waitForFunction(() => JSON.parse(window.SoulLinkAudio.diagnostics()).settings.music === 0);
  assert.equal((await read()).musicPlaying, false);
  await page.evaluate(() => window.SoulLinkAudio.play('hit'));
  await page.waitForFunction(() => JSON.parse(window.SoulLinkAudio.diagnostics()).rms > .001);
  const effectRms = (await read()).rms;
  await click('sfx_volume'); await page.keyboard.press('Home');
  await page.waitForFunction(() => JSON.parse(window.SoulLinkAudio.diagnostics()).settings.sfx === 0);
  const before = (await read()).counts.hit;
  await page.evaluate(() => window.SoulLinkAudio.play('hit'));
  assert.equal((await read()).counts.hit, before);
  await click('music_volume'); await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await click('mute');
  await page.waitForFunction(() => JSON.parse(window.SoulLinkAudio.diagnostics()).settings.muted);
  await page.waitForTimeout(350);
  assert.ok((await read()).rms < .001, 'Master mute must silence the rendered graph');
  // Persist a distinctive setting through the Godot ConfigFile and a real reload.
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.screen === 'prepare', null, { timeout: 120000 });
  const persisted = await read();
  assert.equal(persisted.settings.music, .01);
  assert.equal(persisted.settings.muted, true);
  assert.equal(persisted.introRequested, true, 'Intro music uses its explicit always-on policy');
  await require('./check-intro.cjs').enter(page);
  assert.equal((await read()).musicPlaying, false, 'Game entry must restore the saved master mute');
  await click('sound');
  await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.sound_visible === true);
  await click('mute');
  await click('music_volume'); await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  for (let index = 1; index < 35; index++) await page.keyboard.press('ArrowRight');
  await click('sfx_volume'); await page.keyboard.press('End');
  for (let index = 0; index < 25; index++) await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => {
    const audio = JSON.parse(window.SoulLinkAudio.diagnostics());
    return !audio.settings.muted && audio.settings.music === .35 && audio.settings.sfx === .75;
  });
  await page.evaluate(() => window.SoulLinkHost.back());
  await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.sound_visible === false);
  await page.evaluate(() => window.SoulLinkHost.visibility(false));
  await page.waitForFunction(() => JSON.parse(window.SoulLinkAudio.diagnostics()).suspended);
  await page.waitForTimeout(250);
  const hidden = await read();
  assert.equal(hidden.musicPlaying, false); assert.equal(hidden.voices, 0);
  assert.equal(hidden.state, 'suspended');
  assert.ok(hidden.rms < .001);
  await page.evaluate(() => window.SoulLinkHost.visibility(true));
  await page.waitForFunction(() => JSON.parse(window.SoulLinkAudio.diagnostics()).musicPlaying);
  assert.deepEqual((await read()).errors, []);
  return { firstGesture: true, decodedEffects: 13, renderedRms: audible.rms, effectOnlyRms: effectRms, effectHitBaseline: (await read()).counts.hit || 0,
    independentVolumes: true,
    mute: true, persistedAfterReload: true, backgroundSilence: true };
};
