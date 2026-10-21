const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(__dirname, '..');
test('supplied video retains 720p/8 seconds, has no audio stream, and supports progressive loading', () => {
  const video = path.join(root, 'web/intro/cinematic.mp4');
  const probe = spawnSync(path.join(root, 'build/audio-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'), ['-hide_banner', '-i', video], { encoding: 'utf8', windowsHide: true });
  assert.match(probe.stderr, /Duration: 00:00:08\.00/);
  assert.match(probe.stderr, /720x1280/);
  assert.doesNotMatch(probe.stderr, /Stream .*Audio:/);
  const bytes = fs.readFileSync(video);
  assert.ok(bytes.indexOf('moov') < bytes.indexOf('mdat'));
  assert.ok(bytes.length < 2600000);
});
test('runtime logo contains real alpha and no opaque chroma-green background', async () => {
  const { data, info } = await sharp(path.join(root, 'web/intro/logo.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0, green = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = data.subarray(i, i + 4);
    if (a < 10) transparent++;
    if (a > 80 && g > 140 && g > r * 1.5 && g > b * 1.5) green++;
  }
  assert.ok(transparent / (info.width * info.height) > .2);
  assert.equal(green, 0);
});
