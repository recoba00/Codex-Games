const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { portraits, fail, object, digest, validate, normalizeCatalog, validateStats, revisionFor } = require('./catalog-data.cjs');
const { createContentStore, MAX_IMAGE, mime } = require('./live-content.cjs');

function run(project, command, args, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: project, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { child.kill(); reject(Error('빌드 시간 제한을 초과했습니다.')); }, 180000);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => log(bytes.toString()));
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(`빌드 종료 코드 ${code}`)); });
  });
}

function createAdmin({ project, configFile = path.join(project, 'data/game.json'), buildRunner, contentStore = createContentStore({ project }) } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  const appliedFile = path.join(project, 'build/admin-applied.json');
  let busy = false;
  let job = { state: 'idle', log: '' };
  const read = async () => {
    const bytes = await fs.readFile(configFile);
    const schemaBytes = await fs.readFile(path.join(project, 'data/stats.json'));
    const definitions = JSON.parse(schemaBytes).definitions;
    return { document: normalizeCatalog(JSON.parse(bytes), definitions), revision: revisionFor(bytes, schemaBytes), bytes, schemaBytes, definitions };
  };
  const send = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(data));
  };
  const performBuild = buildRunner || (async log => {
    await run(project, 'powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(project, 'tools/run-godot.ps1'), '-Mode', 'web'], log);
    await run(project, 'powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(project, 'tools/run-godot.ps1'), '-Mode', 'pack'], log);
    await run(project, process.execPath, [path.join(project, 'tools/package-web.cjs'), '--reuse-engine', 'godot-8f475b442510ea2c'], log);
  });
  return async function handle(req, res, url) {
    if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return false;
    try {
      const remote = req.socket.remoteAddress;
      const host = req.headers.host;
      const allowedHosts = [`localhost:${req.socket.localPort}`, `127.0.0.1:${req.socket.localPort}`];
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) || !allowedHosts.includes(host)) fail('어드민은 이 PC의 localhost에서만 열 수 있습니다.', 403);
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'no-referrer');
      if (req.method === 'GET' && url.pathname === '/admin/api/config') {
        let applied = null;
        try { applied = JSON.parse(await fs.readFile(appliedFile, 'utf8')).revision; } catch { /* Not built through the admin yet. */ }
        const current = await read();
        const published = await contentStore.ensure();
        send(res, 200, { document: current.document, revision: current.revision, statDefinitions: current.definitions, token, portraits, applied, job, published: published.revision });
      } else if (req.method === 'GET' && url.pathname === '/admin/api/job') {
        send(res, 200, job);
      } else if (req.method === 'POST' && ['/admin/api/save', '/admin/api/build', '/admin/api/publish', '/admin/api/upload'].includes(url.pathname)) {
        const uploading = url.pathname.endsWith('/upload');
        const type = req.headers['content-type'] || '';
        if (req.headers.origin !== `http://${host}` || req.headers['x-soul-token'] !== token || !(uploading ? /^image\/(?:png|jpeg|webp)$/.test(type) : /^application\/json(?:;|$)/i.test(type))) fail('요청 인증이 만료되었습니다. 어드민을 새로고침하세요.', 403);
        if (busy || job.state === 'running') fail('저장 또는 빌드가 진행 중입니다.', 409);
        busy = true;
        try {
          const chunks = [];
          let length = 0;
          for await (const chunk of req) { length += chunk.length; if (length > (uploading ? MAX_IMAGE : 1024 * 1024)) fail('요청이 너무 큽니다.', 413); chunks.push(chunk); }
          if (uploading) {
            const image = await contentStore.upload(Buffer.concat(chunks), type);
            send(res, 200, image);
            return true;
          }
          let input;
          try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('JSON 형식을 확인하세요.'); }
          if (!input || typeof input !== 'object' || Array.isArray(input)) fail('설정 객체가 필요합니다.');
          const current = await read();
          if (input.revision !== current.revision) fail('다른 창이나 파일에서 수정되었습니다. 다시 불러온 뒤 저장하세요.', 409);
          if (url.pathname.endsWith('/save')) {
            const next = validate(current.document, input, current.definitions);
            await contentStore.checkImages(next);
            const bytes = Buffer.from(JSON.stringify(next, null, 2) + '\n');
            const backups = path.join(project, 'build/config-backups');
            await fs.mkdir(backups, { recursive: true });
            try { await fs.writeFile(path.join(backups, current.revision + '.json'), current.bytes, { flag: 'wx' }); }
            catch (error) { if (error.code !== 'EEXIST') throw error; }
            const temporary = configFile + '.admin-' + crypto.randomBytes(6).toString('hex') + '.tmp';
            await fs.writeFile(temporary, bytes);
            await fs.rename(temporary, configFile);
            send(res, 200, { document: next, revision: revisionFor(bytes, current.schemaBytes) });
          } else if (url.pathname.endsWith('/publish')) {
            object(input, ['revision']);
            const published = await contentStore.publish(current.document);
            send(res, 200, { revision: current.revision, published: published.revision });
          } else {
            object(input, ['revision']);
            job = { state: 'running', revision: current.revision, log: '', startedAt: new Date().toISOString() };
            send(res, 202, job);
            const append = message => { job.log = (job.log + message).slice(-32000); };
            performBuild(append).then(async () => {
              if ((await read()).revision !== job.revision) throw Error('빌드 중 원본 설정이 변경되었습니다. 다시 빌드하세요.');
              await fs.mkdir(path.dirname(appliedFile), { recursive: true });
              await fs.writeFile(appliedFile, JSON.stringify({ revision: job.revision, at: new Date().toISOString() }));
              job.state = 'succeeded';
            }).catch(error => { job.state = 'failed'; append('\n' + error.message); });
          }
        } finally { busy = false; }
      } else if (['GET', 'HEAD'].includes(req.method)) {
        const files = { '/admin': ['tools/admin/index.html', 'text/html; charset=utf-8'], '/admin/': ['tools/admin/index.html', 'text/html; charset=utf-8'],
          '/admin/admin.js': ['tools/admin/admin.js', 'text/javascript; charset=utf-8'], '/admin/admin.css': ['tools/admin/admin.css', 'text/css; charset=utf-8'], '/admin/skins.css': ['tools/admin/skins.css', 'text/css; charset=utf-8'] };
        if (url.pathname.startsWith('/admin/images/')) {
          const image = await contentStore.image(url.pathname.slice('/admin/images/'.length));
          res.writeHead(200, { 'Content-Type': mime[image.ext], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          res.end(req.method === 'HEAD' ? undefined : image.buffer);
          return true;
        }
        for (const id of portraits) files[`/admin/portraits/${id}.webp`] = [`assets/characters/${id}.webp`, 'image/webp'];
        const selected = files[url.pathname];
        if (!selected) fail('찾을 수 없습니다.', 404);
        const bytes = await fs.readFile(path.join(project, selected[0]));
        res.writeHead(200, { 'Content-Type': selected[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(req.method === 'HEAD' ? undefined : bytes);
      } else fail('지원하지 않는 요청입니다.', 405);
    } catch (error) {
      if (res.headersSent) { console.error(error); if (!res.writableEnded) res.end(); }
      else send(res, error.status || 500, { error: error.status ? error.message : '로컬 파일 또는 빌드 도구를 확인하세요.' });
    }
    return true;
  };
}
module.exports = { createAdmin, validate, normalizeCatalog, validateStats, revisionFor, digest };
