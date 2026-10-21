const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(__dirname, '..');
const desktop = 'C:/Users/user/Desktop';
const puzzlesOnly = process.argv.includes('--puzzles-only');
const sources = {
  attack: '붉은 보석 검 문양 엠블럼.png',
  denial: '청금석-번개-에너지-엠블럼.png',
  boost: '에메랄드-바람잎-보석-아이콘.png',
  mana: '보랏빛-초승달과-별의-보석-엠블럼.png',
  heal: '찬란한-황금-별빛-엠블럼.png'
};
(async () => {
  fs.mkdirSync(path.join(root, 'assets/puzzles'), { recursive: true });
  fs.mkdirSync(path.join(root, 'build/art-backup'), { recursive: true });
  const puzzleBackup = path.join(root, 'build/art-backup/puzzles-before-emblems-v2');
  fs.mkdirSync(puzzleBackup, { recursive: true });
  for (const relative of [...Object.keys(sources).map(id => 'assets/puzzles/' + id + '.webp'), 'docs/USER_ART.json']) {
    const source = path.join(root, relative), backup = path.join(puzzleBackup, path.basename(relative));
    if (fs.existsSync(source) && !fs.existsSync(backup)) fs.copyFileSync(source, backup);
  }
  const manifest = { source: 'user attachments, 2026-10-20', generated: false, files: [] };
  for (const [id, name] of Object.entries(sources)) {
    const source = path.join(desktop, name), output = 'assets/puzzles/' + id + '.webp';
    await sharp(source).resize(192, 192, { fit: 'inside' }).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(root, output));
    manifest.files.push({ source: name, sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'), output });
  }
  if (!puzzlesOnly) {
    const backup = path.join(root, 'build/art-backup/app-icon-before-v2.png');
    if (!fs.existsSync(backup)) fs.copyFileSync(path.join(root, 'assets/app/icon.png'), backup);
    const icon = path.join(desktop, '1024.png');
    await sharp(icon).resize(512, 512).png({ compressionLevel: 9 }).toFile(path.join(root, 'assets/app/icon.png'));
    for (const [name, size] of [['icon-32-v2.png', 32], ['apple-touch-icon-v2.png', 180], ['icon-192-v2.png', 192], ['icon-512-v2.png', 512]]) {
      await sharp(icon).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(root, 'web/icons', name));
    }
  }
  fs.writeFileSync(path.join(root, 'docs/USER_ART.json'), JSON.stringify(manifest, null, 2));
  console.log('USER_ART_PREPARED: five transparent 192px puzzle textures; ' + (puzzlesOnly ? 'app/home-screen icon unchanged' : 'first attachment as app/home-screen icon v2') + '; originals unchanged');
})().catch(error => { console.error(error); process.exitCode = 1; });
