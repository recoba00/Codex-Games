const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(__dirname, '..');
test('five supplied puzzle images map to the correct combat effects', async () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/game.json')));
  assert.equal(catalog.blocks.length, 5);
  assert.equal(catalog.blocks[4].color, '#ffd86b'); assert.equal(catalog.blocks[4].target, '내 HP');
  for (const name of ['attack', 'denial', 'boost', 'mana', 'heal']) {
    const info = await sharp(path.join(root, 'assets/puzzles/' + name + '.webp')).metadata();
    assert.equal(info.width, 192); assert.equal(info.height, 192);
  }
  const provenance = JSON.parse(fs.readFileSync(path.join(root, 'docs/USER_ART.json')));
  assert.equal(provenance.generated, false); assert.equal(provenance.files.length, 5);
  const sources = {
    attack: '붉은 보석 검 문양 엠블럼.png',
    denial: '청금석-번개-에너지-엠블럼.png',
    boost: '에메랄드-바람잎-보석-아이콘.png',
    mana: '보랏빛-초승달과-별의-보석-엠블럼.png',
    heal: '찬란한-황금-별빛-엠블럼.png'
  };
  for (const [id, name] of Object.entries(sources)) {
    const source = path.join('C:/Users/user/Desktop', name);
    const output = 'assets/puzzles/' + id + '.webp';
    const entry = provenance.files.find(item => item.output === output);
    assert.equal(entry.source, name);
    assert.equal(entry.sourceSha256, crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'));
    const expected = await sharp(source).resize(192, 192, { fit: 'inside' }).webp({ quality: 92, alphaQuality: 100 }).toBuffer();
    assert.ok(expected.equals(fs.readFileSync(path.join(root, output))), id + ' uses the latest supplied emblem');
    assert.equal((await sharp(path.join(root, output)).metadata()).hasAlpha, true);
    assert.equal((await sharp(path.join(root, output)).stats()).isOpaque, false);
  }
});
test('approved character app/home-screen icons remain unchanged during puzzle replacement', async () => {
  // The original Desktop attachment may be moved; pin the approved delivery files.
  for (const [name, size, hash] of [
    ['icon-32-v2.png', 32, '3a846631e017e42528fa26fdd8899b99175ecaa0f9218405f5a0b3403b4dbbba'],
    ['apple-touch-icon-v2.png', 180, '24a7cb35a445512b485465f3018f89ed61c24cafd887a9818c822d148bc33ec0'],
    ['icon-192-v2.png', 192, '660b844cc71ab76689fc5f76288b6304012f6657dded55b668369c4aaaacf62d'],
    ['icon-512-v2.png', 512, 'd5d3f72c9219abc00e05715c2ddcae8ede08adef30f2c03559160412af90c3de']
  ]) {
    const file = path.join(root, 'web/icons', name);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash);
    const info = await sharp(file).metadata();
    assert.equal(info.width, size); assert.equal(info.height, size);
  }
  assert.ok(fs.readFileSync(path.join(root, 'assets/app/icon.png')).equals(fs.readFileSync(path.join(root, 'web/icons/icon-512-v2.png'))));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'web/manifest.webmanifest')));
  assert.ok(manifest.icons.every(item => item.src.includes('-v2.png')));
});
