const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = ['intro.js', 'intro.css', 'intro/cinematic.mp4', 'intro/logo.webp', 'intro/poster.jpg'];
function stage(destination) {
  for (const name of files) {
    fs.mkdirSync(path.dirname(path.join(destination, name)), { recursive: true });
    fs.copyFileSync(path.join(root, 'web', name), path.join(destination, name));
  }
}
module.exports = { files, stage };
if (require.main === module) stage(path.join(root, 'build/web'));
