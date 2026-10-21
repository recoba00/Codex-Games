const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const build = path.join(root, 'build/web');
const output = path.join(root, 'build/deploy');
const names = ['index.html', 'index.js', 'index.wasm', 'index.pck',
  'index.audio.worklet.js', 'index.audio.position.worklet.js', 'index.png',
  'index.icon.png', 'index.apple-touch-icon.png', 'host-bridge.js', 'audio-bridge.js', ...require('./audio-runtime.cjs').files,
  ...require('./intro-runtime.cjs').files];
const generated = new Map([['.htaccess', fs.readFileSync(path.join(root, 'web/release.htaccess'))]]);
const reuseAt = process.argv.indexOf('--reuse-engine');
const reuse = reuseAt >= 0 ? process.argv[reuseAt + 1] : null;
if (reuse !== null && !/^godot-[0-9a-f]{16}$/.test(reuse || '')) throw Error('An exact existing engine release is required');
for (const name of ['index.js', 'index.wasm', 'index.pck']) {
  const raw = fs.readFileSync(path.join(build, name));
  const gzip = gzipSync(raw, { level: 9 });
  if (!gunzipSync(gzip).equals(raw)) throw Error('Compression round-trip failed: ' + name);
  generated.set(name + '.gz', gzip);
}
if (reuse) {
  for (const name of ['index.wasm', 'index.wasm.gz']) {
    const bytes = generated.get(name) || fs.readFileSync(path.join(build, name));
    const existing = fs.readFileSync(path.join(output, 'releases', reuse, name));
    if (!bytes.equals(existing)) throw Error('Reused engine must be byte-identical: ' + name);
  }
  const rules = `<IfModule mod_rewrite.c>\n  RewriteEngine On\n  RewriteRule ^index\\.wasm$ /games/soullink/releases/${reuse}/index.wasm [L]\n  RewriteRule ^index\\.wasm\\.gz$ /games/soullink/releases/${reuse}/index.wasm.gz [L]\n</IfModule>\n`;
  generated.set('.htaccess', Buffer.from(rules + generated.get('.htaccess').toString('utf8')));
}
const hash = crypto.createHash('sha256');
for (const name of names) hash.update(name).update(fs.readFileSync(path.join(build, name)));
for (const [name, bytes] of generated) hash.update(name).update(bytes);
const release = 'godot-' + hash.digest('hex').slice(0, 16);
const folder = path.join(output, 'releases', release);
fs.mkdirSync(folder, { recursive: true });
for (const name of names) {
  fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
  fs.copyFileSync(path.join(build, name), path.join(folder, name));
}
for (const [name, bytes] of generated) fs.writeFileSync(path.join(folder, name), bytes);
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
if (html.includes('$GODOT_') || !html.includes('<!-- SOUL_LINK_RELEASE_BASE -->')) throw Error('Invalid exported shell');
fs.writeFileSync(path.join(output, 'index.html'), html.replace('<!-- SOUL_LINK_RELEASE_BASE -->', `<base href="./releases/${release}/">`));
const extras = ['manifest.webmanifest', 'icons/icon-32-v2.png', 'icons/apple-touch-icon-v2.png', 'icons/icon-192-v2.png', 'icons/icon-512-v2.png'];
for (const name of extras) {
  fs.mkdirSync(path.dirname(path.join(output, name)), { recursive: true });
  fs.copyFileSync(path.join(root, 'web', name), path.join(output, name));
}
const files = [...[...names, ...generated.keys()].map(name => `releases/${release}/${name}`), ...extras, 'index.html'].map(name => {
  const bytes = fs.readFileSync(path.join(output, name));
  return { path: name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
const manifest = { release, url: 'http://recoba00.dothome.co.kr/games/soullink/',
  staging_url: `http://recoba00.dothome.co.kr/games/soullink/releases/${release}/index.html`,
  total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
  engine_raw_bytes: ['index.js', 'index.wasm', 'index.pck'].reduce((sum, name) => sum + fs.statSync(path.join(build, name)).size, 0),
  engine_gzip_bytes: [...generated].filter(([name]) => name.endsWith('.gz')).reduce((sum, [, bytes]) => sum + bytes.length, 0), files };
manifest.audio_bytes = require('./audio-runtime.cjs').files.reduce((sum, name) => sum + fs.statSync(path.join(build, name)).size, 0);
manifest.intro_bytes = require('./intro-runtime.cjs').files.reduce((sum, name) => sum + fs.statSync(path.join(build, name)).size, 0);
manifest.reused_files = reuse ? Object.fromEntries(['index.wasm', 'index.wasm.gz'].map(name =>
  [`releases/${release}/${name}`, `releases/${reuse}/${name}`])) : {};
manifest.new_storage_bytes = manifest.total_bytes - files.filter(file => manifest.reused_files[file.path]).reduce((sum, file) => sum + file.bytes, 0);
fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
