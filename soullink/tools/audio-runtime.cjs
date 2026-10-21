const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/audio.json'), 'utf8'));
const files = [...Object.values(catalog.music), ...Object.values(catalog.sfx)].map(item => {
  if (!/^(music|sfx)\/[a-z0-9-]+\.(mp3|wav)$/.test(item.file)) throw Error('Invalid audio path');
  return 'audio/' + item.file;
}).sort();
function stage(destination) {
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'audio-bridge.js'), bridge());
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(destination, file)), { recursive: true });
    fs.copyFileSync(path.join(root, 'assets', file), path.join(destination, file));
  }
}
function bridge() {
  const source = fs.readFileSync(path.join(root, 'web/audio-bridge.js'), 'utf8');
  const marker = '/* SOUL_LINK_AUDIO_CATALOG */ null';
  if (!source.includes(marker)) throw Error('Missing audio bootstrap marker');
  return source.replace(marker, JSON.stringify(catalog));
}
module.exports = { files, stage, bridge };
if (require.main === module) stage(path.join(root, 'build/web'));
