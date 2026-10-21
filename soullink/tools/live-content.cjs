const fs = require('node:fs/promises');
const path = require('node:path');
const { digest, fail, imageId, validate, normalizeCatalog } = require('./catalog-data.cjs');

const MAX_IMAGE = 3 * 1024 * 1024;
const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
function inspectImage(bytes) {
  let width, height, ext;
  if (bytes.length > MAX_IMAGE || bytes.length < 32) fail('이미지는 3MB 이하의 PNG/JPG/WebP여야 합니다.');
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    ext = 'png'; width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) === bytes.length - 8) {
    ext = 'webp';
    const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8X') {
      if (bytes[20] & 2) fail('움직이는 이미지는 지원하지 않습니다.');
      width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3);
    } else if (kind === 'VP8L' && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (kind === 'VP8 ' && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff;
    }
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    ext = 'jpg';
    let offset = 2;
    while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if ([0xda, 0xd9].includes(marker)) break;
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
        height = bytes.readUInt16BE(offset + 5); width = bytes.readUInt16BE(offset + 7); break;
      }
      offset += 2 + length;
    }
  }
  if (!width || !height || Math.min(width, height) < 64 || Math.max(width, height) > 2048) fail('이미지 크기는 가로·세로 64 ~ 2048px이어야 합니다.');
  return { ext, width, height, bytes: bytes.length, sha256: digest(bytes) };
}
async function atomic(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + require('node:crypto').randomBytes(8).toString('hex') + '.tmp';
  try { await fs.writeFile(temp, bytes, { flag: 'wx' }); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }); }
}
function createContentStore({ project, directory = path.join(project, 'build/live-content') }) {
  const publishedFile = path.join(directory, 'catalog.json');
  const assetIndexFile = path.join(directory, 'published-assets.json');
  const assetFile = id => {
    if (!imageId.test(id)) fail('잘못된 이미지 ID입니다.');
    return id.startsWith('asset_') ? path.join(directory, 'media', id) : path.join(project, 'assets/characters', id + '.webp');
  };
  async function image(id) {
    let bytes;
    try { bytes = await fs.readFile(assetFile(id)); }
    catch (error) {
      if (error.status) throw error;
      if (error.code !== 'ENOENT' || !id.startsWith('asset_')) fail('등록한 이미지가 없습니다. 다시 업로드하세요.');
      try { bytes = await fs.readFile(path.join(project, 'assets/catalog', id)); }
      catch { fail('등록한 이미지가 없습니다. 다시 업로드하세요.'); }
    }
    const info = inspectImage(bytes);
    if (id.startsWith('asset_') && id !== `asset_${info.sha256}.${info.ext}`) fail('이미지 검증 실패.', 503);
    return { ...info, buffer: bytes };
  }
  async function upload(bytes, contentType) {
    const info = inspectImage(bytes);
    if (contentType && mime[info.ext] !== contentType) fail('이미지 형식이 일치하지 않습니다.');
    const id = `asset_${info.sha256}.${info.ext}`;
    await atomic(assetFile(id), bytes);
    return { id, ...info };
  }
  async function checkImages(document) {
    for (const id of new Set(Object.values(document.characters).flatMap(c => Object.values(c.skins).map(s => s.image)))) await image(id);
  }
  async function published() {
    try { return JSON.parse(await fs.readFile(publishedFile, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async function publicAssets() {
    try { return JSON.parse(await fs.readFile(assetIndexFile, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return (await published())?.assets || {}; throw error; }
  }
  async function publish(document) {
    const clean = validate(document, { characters: document.characters, combat: document.combat });
    const characters = {}, assets = {};
    for (const [id, character] of Object.entries(clean.characters)) {
      if (!character.enabled) continue;
      const skins = Object.fromEntries(Object.entries(character.skins).filter(([, skin]) => skin.enabled));
      characters[id] = { ...character, skins };
      for (const skin of Object.values(skins)) {
        if (assets[skin.image]) continue;
        const { buffer, ...info } = await image(skin.image);
        assets[skin.image] = { ...info, path: 'assets/' + skin.image };
      }
    }
    const body = { format_version: 1, schema_version: 3, characters, combat: clean.combat, assets };
    const revision = digest(JSON.stringify(body));
    const next = { ...body, revision };
    const previous = await published();
    if (previous && previous.revision !== revision) await atomic(path.join(directory, 'history', previous.revision + '.json'), JSON.stringify(previous));
    // Old clients may still be rendering an earlier published snapshot.
    await atomic(assetIndexFile, JSON.stringify({ ...await publicAssets(), ...assets }));
    await atomic(publishedFile, JSON.stringify(next));
    return next;
  }
  async function ensure() {
    return await published() || publish(normalizeCatalog(JSON.parse(await fs.readFile(path.join(project, 'data/game.json'), 'utf8'))));
  }
  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/content/')) return false;
    const headers = { 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' };
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, headers).end(); return true; }
      const current = await ensure();
      let bytes, type, etag;
      if (url.pathname === '/content/catalog.json') {
        bytes = Buffer.from(JSON.stringify(current)); type = 'application/json; charset=utf-8'; etag = current.revision;
      } else {
        const id = url.pathname.slice('/content/assets/'.length);
        const publicImages = await publicAssets();
        if (!url.pathname.startsWith('/content/assets/') || !Object.hasOwn(publicImages, id)) fail('찾을 수 없습니다.', 404);
        const content = await image(id);
        if (content.sha256 !== publicImages[id].sha256) fail('이미지 검증 실패.', 503);
        bytes = content.buffer; type = mime[content.ext]; etag = content.sha256;
        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      }
      headers.ETag = `"${etag}"`;
      if (req.headers['if-none-match'] === headers.ETag) res.writeHead(304, headers).end();
      else res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': bytes.length }).end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) { res.writeHead(error.status || 503, headers).end(); }
    return true;
  }
  return { directory, image, upload, checkImages, published, publish, ensure, handle };
}
module.exports = { createContentStore, inspectImage, atomic, MAX_IMAGE, mime };
