const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'build/web');
const project = path.join(root, 'platform/toss');
const publicDir = path.join(project, 'public');
fs.mkdirSync(path.join(publicDir, 'engine'), { recursive: true });
const runtime = ['index.js', 'index.wasm', 'index.pck', 'index.audio.worklet.js', 'index.audio.position.worklet.js'];
for (const name of runtime) fs.copyFileSync(path.join(source, name), path.join(publicDir, 'engine', name));
fs.copyFileSync(path.join(root, 'web/host-bridge.js'), path.join(publicDir, 'host-bridge.js'));
require('./audio-runtime.cjs').stage(publicDir);
require('./intro-runtime.cjs').stage(publicDir);
const iconDir = path.join(publicDir, 'icons');
fs.mkdirSync(iconDir, { recursive: true });
for (const old of ['apple-touch-icon-v1.png', 'icon-32-v1.png', 'icon-192-v1.png', 'icon-512-v1.png']) {
  for (const name of [old, old + '.import']) {
    const generated = path.join(iconDir, name);
    if (fs.existsSync(generated)) fs.unlinkSync(generated);
  }
}
for (const name of ['apple-touch-icon-v2.png', 'icon-32-v2.png', 'icon-192-v2.png', 'icon-512-v2.png']) {
  fs.copyFileSync(path.join(root, 'web/icons', name), path.join(iconDir, name));
  // Remove only metadata copied by the previous generated package step.
  const stale = path.join(iconDir, name + '.import');
  if (fs.existsSync(stale)) fs.unlinkSync(stale);
}
let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
const match = html.match(/const config = (\{[^\n]+\});/);
assert.ok(match, 'Missing exported config');
const config = JSON.parse(match[1]);
config.executable = 'engine/index';
config.fileSizes = Object.fromEntries(Object.entries(config.fileSizes).map(([name, size]) => ['engine/' + name, size]));
html = html.replace(match[0], 'const config = ' + JSON.stringify(config) + ';')
  .replace('<!-- SOUL_LINK_RELEASE_BASE -->', '')
  .replace(/  <link rel="manifest"[^\n]+\n/, '')
  .replaceAll('/games/soullink/icons/', './icons/')
  .replace('<script src="index.js"></script>', '<script src="./engine/index.js"></script>')
  .replace('<!-- SOUL_LINK_PLATFORM_ENTRY -->', '<script type="module" src="/src/main.js"></script>');
assert.ok(!html.includes('/games/soullink/') && !html.includes('dothome'), 'Toss bundle must be self-contained');
fs.writeFileSync(path.join(project, 'index.html'), html);
console.log('TOSS_WEB_PREPARED: direct Godot canvas, local engine/pack, no iframe or external game origin');
