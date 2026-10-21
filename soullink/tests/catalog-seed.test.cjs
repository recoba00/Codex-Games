const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createContentStore, inspectImage } = require('../tools/live-content.cjs');
const root = path.resolve(__dirname, '..');

async function isolated(t) {
  await fs.mkdir(path.join(root, 'build'), { recursive: true });
  const project = await fs.mkdtemp(path.join(root, 'build/seed-test-'));
  t.after(() => fs.rm(project, { recursive: true, force: true }));
  await fs.cp(path.join(root, 'data'), path.join(project, 'data'), { recursive: true });
  await fs.cp(path.join(root, 'assets/catalog'), path.join(project, 'assets/catalog'), { recursive: true });
  await fs.cp(path.join(root, 'assets/characters'), path.join(project, 'assets/characters'), { recursive: true });
  return { project, store: createContentStore({ project }) };
}

test('all registered content-hash artwork survives a source-only checkout', async () => {
  const catalog = JSON.parse(await fs.readFile(path.join(root, 'data/game.json'), 'utf8'));
  const images = new Set(Object.values(catalog.characters).flatMap(c => Object.values(c.skins).map(s => s.image)));
  for (const id of images) {
    if (!id.startsWith('asset_')) continue;
    const bytes = await fs.readFile(path.join(root, 'assets/catalog', id));
    const info = inspectImage(bytes);
    assert.equal(id, `asset_${info.sha256}.${info.ext}`);
  }
});

test('fresh content publication uses bundled seeds without rewriting catalog defaults', async t => {
  const { project, store } = await isolated(t);
  const file = path.join(project, 'data/game.json');
  const before = await fs.readFile(file, 'utf8');
  const published = await store.ensure();
  assert.ok(Object.keys(published.characters).length >= 2);
  for (const [id, asset] of Object.entries(published.assets)) {
    assert.equal((await store.image(id)).sha256, asset.sha256);
  }
  assert.equal(await fs.readFile(file, 'utf8'), before);
  assert.equal((await store.ensure()).revision, published.revision);
});

test('media lookup rejects traversal and corrupted content-hash overrides', async t => {
  const { project, store } = await isolated(t);
  await assert.rejects(() => store.image('../../private.key'));
  const published = await store.ensure();
  const id = Object.keys(published.assets).find(value => value.startsWith('asset_'));
  assert.ok(id, 'fixture includes registered artwork');
  const wrong = await fs.readFile(path.join(root, 'assets/characters/ignis.webp'));
  const media = path.join(project, 'build/live-content/media');
  await fs.mkdir(media, { recursive: true });
  await fs.writeFile(path.join(media, id), wrong);
  await assert.rejects(() => store.image(id), error => error.status === 503);
});
