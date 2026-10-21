const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '../build/deploy');
const prefix = '/games/soullink/';
const at = process.argv.indexOf('--port');
const port = at < 0 ? 5174 : Number(process.argv[at + 1]);
const lan = process.argv.includes('--lan');
const project = path.resolve(__dirname, '..');
const contentStore = require('./live-content.cjs').createContentStore({ project });
const admin = require('./admin.cjs').createAdmin({ project, contentStore });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (await admin(req, res, url)) return;
    if (await contentStore.handle(req, res, url)) return;
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    if (url.pathname === '/' || url.pathname === '/games/soullink') {
      res.writeHead(302, { Location: prefix }).end(); return;
    }
    if (!url.pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
    const release = JSON.parse(await fs.readFile(path.join(root, 'release.json'), 'utf8'));
    const allowed = new Set(release.files.map(item => item.path));
    let relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
    // Serve only the current deployment allowlist, never project sources/backups.
    if (!allowed.has(relative) || relative.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(404).end(); return;
    }
    const type = mime[path.extname(relative)] || 'application/octet-stream';
    const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '') &&
      /\/index\.(wasm|pck|js)$/.test(relative) && allowed.has(relative + '.gz');
    if (gzip) relative += '.gz';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    const stat = await fs.stat(file);
    const headers = { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'no-store', Vary: 'Accept-Encoding' };
    if (gzip) headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : await fs.readFile(file));
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
  console.log('PC: http://localhost:' + port + prefix);
  console.log('Admin (PC only): http://localhost:' + port + '/admin/');
  if (lan) for (const entries of Object.values(os.networkInterfaces())) for (const address of entries || []) {
    if (address.family === 'IPv4' && !address.internal) console.log('LAN: http://' + address.address + ':' + port + prefix);
  }
});
