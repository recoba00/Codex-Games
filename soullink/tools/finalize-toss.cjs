const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const project = path.resolve(__dirname, '../platform/toss');

(async () => {
  const requireToss = createRequire(path.join(project, 'package.json'));
  const { AppsInTossBundle } = await import(pathToFileURL(requireToss.resolve('@apps-in-toss/ait-format')).href);
  const file = path.join(project, 'soullink.ait');
  const reader = AppsInTossBundle.reader(fs.readFileSync(file));
  assert.equal(reader.appName, 'soullink');
  const entries = reader.listEntries();
  if (!entries.some(name => name.includes('\\'))) {
    console.log('TOSS_PATHS_OK: no Windows path normalization required'); return;
  }
  assert.equal(reader.readSignature(), null, 'Never rewrite a signed artifact');
  const writer = AppsInTossBundle.writer({ appName: reader.appName, deploymentId: reader.deploymentId, formatVersion: reader.formatVersion });
  writer.setMetadata(reader.metadata);
  for (const permission of reader.permissions) writer.addPermission(permission.name, permission.access);
  const normalized = new Set();
  for (const name of entries) {
    const webName = name.replaceAll('\\', '/');
    assert.ok(!webName.startsWith('/') && !webName.split('/').includes('..') && !normalized.has(webName));
    normalized.add(webName);
    writer.addFile(webName, await reader.readEntry(name));
  }
  const result = await writer.toBuffer();
  const verified = AppsInTossBundle.reader(result);
  assert.deepEqual(verified.listEntries().sort(), [...normalized].sort());
  assert.deepEqual(verified.metadata, reader.metadata);
  fs.writeFileSync(file, result);
  console.log('TOSS_PATHS_NORMALIZED: official reader/writer, unchanged identity/metadata/permissions');
})().catch(error => { console.error(error); process.exitCode = 1; });
