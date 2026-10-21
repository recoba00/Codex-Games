const http = require('node:http');
const path = require('node:path');
const project = path.resolve(__dirname, '..');
const at = process.argv.indexOf('--port');
const port = at < 0 ? 5180 : Number(process.argv[at + 1]);
const directory = process.env.SOUL_CONTENT_DIRECTORY && path.resolve(process.env.SOUL_CONTENT_DIRECTORY);
const store = require('./live-content.cjs').createContentStore({ project, ...(directory ? { directory } : {}) });
const admin = require('./admin.cjs').createAdmin({ project, contentStore: store });

store.ensure().then(() => {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (await admin(req, res, url) || await store.handle(req, res, url)) return;
      res.writeHead(404).end();
    } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
  });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Content: http://localhost:${port}/content/catalog.json`);
    console.log(`Admin (loopback only): http://localhost:${port}/admin/`);
  });
}).catch(error => { console.error(error.message); process.exitCode = 1; });
