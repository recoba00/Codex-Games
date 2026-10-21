const assert = require('node:assert/strict');
const sharp = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
module.exports = async function fullDuel(page, tap, prefix) {
  const read = () => page.evaluate(() => window.__SOUL_LINK_SNAPSHOT__);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.SoulLinkHost.safeArea({ top: 0, right: 0, bottom: 0, left: 0 }));
  await page.waitForTimeout(250);
  if ((await read()).paused) await tap('pause');
  let healed = 0, used = (await read()).active_uses, turns = 0, held = false, postMatchSkill = false;
  const seen = new Set();
  while (turns < 9) {
    await page.waitForFunction(() => {
      const s = window.__SOUL_LINK_SNAPSHOT__;
      return s?.result_visible || s?.phase === 'player_input' && s.moves?.length > 0;
    }, null, { timeout: 35000 });
    const state = await read();
    if (state.result_visible) break;
    assert.equal(state.palette, 5);
    assert.equal(state.active_enabled, false, 'Skill cannot be cast before matching');
    const move = [...state.moves].sort((a, b) => score(b, state, healed) - score(a, state, healed))[0];
    for (const color of move.colors) seen.add(color);
    const bounds = await page.locator('#canvas').boundingBox(), board = state.rects.board;
    const tile = Math.min(board.width / 6, (board.height - 48) / 5);
    const origin = { x: board.x + (board.width - tile * 6) / 2, y: board.y + 48 + (board.height - 48 - tile * 5) / 2 };
    const point = cell => ({ x: bounds.x + (origin.x + (cell % 6 + .5) * tile) / state.viewport.width * bounds.width,
      y: bounds.y + (origin.y + (Math.floor(cell / 6) + .5) * tile) / state.viewport.height * bounds.height });
    const a = point(move.path[0]), b = point(move.path[1]);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.waitForTimeout(150); await page.mouse.move(b.x, b.y); await page.mouse.up();
    await page.waitForFunction(count => window.__SOUL_LINK_SNAPSHOT__?.combat_stage === 'action' && window.__SOUL_LINK_SNAPSHOT__.records === count, state.records);
    const matched = await read();
    assert.equal(matched.hp[1], state.hp[1], 'Red groups queue damage, not immediate HP hits');
    assert.equal(matched.actor, 0, 'Player retains control for the action choice');
    healed += matched.pending.healing;
    await page.waitForFunction(count => {
      const s = window.__SOUL_LINK_SNAPSHOT__;
      return s.result_visible || s.records > count || s.phase === 'player_action';
    }, state.records, { timeout: 25000 });
    let action = await read();
    if (action.phase === 'player_action') {
      assert.equal(action.combat_stage, 'action');
      await page.screenshot({ path: prefix + '-action.png' });
      if (action.active_enabled && !held) {
        held = true;
        await tap('end');
        await page.waitForFunction(count => window.__SOUL_LINK_SNAPSHOT__.records > count, state.records);
        assert.equal((await read()).mp[0], action.mp[0], 'Confirm holds MP instead of auto-casting');
      } else {
        for (let cast = 0; cast < 5 && action.phase === 'player_action' && action.active_enabled; cast++) {
          const before = action;
          await tap('active');
          await page.waitForFunction(count => window.__SOUL_LINK_SNAPSHOT__.active_uses > count, before.active_uses);
          assert.equal((await read()).mp[0], before.mp[0] - 40, 'Configured default MP cost paid');
          postMatchSkill = true;
          await page.waitForFunction(count => {
            const s = window.__SOUL_LINK_SNAPSHOT__;
            return s.result_visible || s.records > count || s.phase === 'player_action';
          }, state.records);
          action = await read(); used = action.active_uses;
        }
        if (action.phase === 'player_action') {
          if (!action.spell_used) {
            await tap('spell');
            await page.waitForFunction(() => !window.__SOUL_LINK_SNAPSHOT__.presentation_busy);
            action = await read();
          }
          if (action.phase === 'player_action') await tap('end');
        }
      }
    }
    await page.waitForFunction(count => window.__SOUL_LINK_SNAPSHOT__.records > count || window.__SOUL_LINK_SNAPSHOT__.result_visible, state.records);
    const receipt = await read();
    assert.ok(receipt.last_strike.damage >= 0 && receipt.last_damage <= 500);
    console.log('DUEL_TURN', JSON.stringify({ round: state.round, colors: move.colors, healing: matched.pending.healing, strike: receipt.last_strike.damage, skills: receipt.active_uses }));
    turns++;
  }
  await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.result_visible, null, { timeout: 35000 });
  const result = await read();
  used = result.active_uses;
  assert.ok(/승리|패배|무승부/.test(result.result_title));
  assert.ok(result.rects.result_art.height > 200 && result.rects.result_art.width > 200);
  assert.ok(postMatchSkill && held, 'Both MP spending and deliberate holding tested');
  assert.ok(used >= 2, 'Repeated MP-funded skills still work');
  assert.ok(healed > 0, 'A wounded character actually heals through gold');
  const pixels = await sharp(await page.locator('#canvas').screenshot()).stats();
  assert.ok(pixels.channels.some(c => c.stdev > 25));
  await page.screenshot({ path: prefix + '-result.png' });
  await tap('change');
  await page.waitForFunction(() => window.__SOUL_LINK_SNAPSHOT__?.screen === 'lobby');
  return { actualGoldenHealing: healed, actualSkillUses: used, actualRepeatedSkills: used, deliberateMPHold: held, matchThenSkill: postMatchSkill,
    palette: 5, matchedColors: [...seen], actualResultScreen: true, returnToSelection: true, stateInjection: false };
};
function score(move, state, healed) {
  return move.colors.reduce((sum, color) => sum + (color === 4 && state.hp[0] < 980 && (healed === 0 || state.hp[0] < 500) ? 50 : color === 3 && state.mp[0] < 80 ? 45 : color === 0 ? 10 : color === 2 ? 5 : 1), 0);
}
