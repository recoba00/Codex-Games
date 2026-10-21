const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const project = path.join(root, 'platform/toss');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

(async () => {
  const requireToss = createRequire(path.join(project, 'package.json'));
  const { AppsInTossBundle } = await import(pathToFileURL(requireToss.resolve('@apps-in-toss/ait-format')).href);
  const artifact = fs.readFileSync(path.join(project, 'soullink.ait'));
  const reader = AppsInTossBundle.reader(artifact);
  assert.equal(reader.appName, 'soullink');
  assert.deepEqual(reader.permissions, []);
  assert.equal(reader.metadata.sdkVersion, '3.8.1');
  const entries = reader.listEntries();
  assert.ok(entries.includes('sources/index.html'));
  assert.ok(!entries.some(name => /\\|node_modules|\.env|artifacts\/|tests\/|\.htaccess|\.gz$|\.import$/.test(name)));
  for (const name of ['index.js', 'index.wasm', 'index.pck']) {
    const packed = await reader.readEntry('sources/engine/' + name);
    assert.equal(hash(packed), hash(fs.readFileSync(path.join(root, 'build/web', name))));
  }
  for (const name of ['audio-bridge.js', ...require('./audio-runtime.cjs').files, ...require('./intro-runtime.cjs').files]) {
    assert.equal(hash(await reader.readEntry('sources/' + name)), hash(fs.readFileSync(path.join(project, 'public', name))));
  }
  const html = Buffer.from(await reader.readEntry('sources/index.html')).toString('utf8');
  assert.ok(!/<iframe|dothome|\/games\/soullink\//i.test(html));
  assert.ok(html.includes('engine/index'));
  const bundle = JSON.parse(Buffer.from(await reader.readEntry('bundle.json')).toString('utf8'));
  assert.equal(bundle.config.appName, 'soullink');
  assert.equal(bundle.config.webView.allowsInlineMediaPlayback, true);
  assert.equal(bundle.config.webView.mediaPlaybackRequiresUserAction, false);
  // Project preview budget, not an asserted Apps-in-Toss platform limit.
  // The self-contained 720p cinematic adds 2.8 MB to the former 20 MiB target.
  const compressedBudget = 24 * 1024 * 1024, rawBudget = 64 * 1024 * 1024;
  assert.ok(artifact.length < compressedBudget, 'Internal compressed bundle budget exceeded');
  assert.ok(bundle.byteLength < rawBudget, 'Internal raw bundle budget exceeded');
  const liveContent = JSON.parse(fs.readFileSync(path.join(root, 'data/live.json'), 'utf8'));
  if (liveContent.catalog_url) assert.ok(/^https:\/\//.test(liveContent.catalog_url), 'Toss live content must use HTTPS');
  const report = { passed: true, appName: reader.appName, sdk: reader.metadata.sdkVersion,
    artifact: 'platform/toss/soullink.ait', deploymentId: reader.deploymentId, sha256: hash(artifact),
    artifactBytes: artifact.length, rawWebBytes: bundle.byteLength, entries: entries.length,
    internalBudgets: { compressedBudget, rawBudget, officialTossLimits: false },
    exactGodotPackVerified: true, exactAudioAssetsVerified: true, exactIntroAssetsVerified: true,
    externalGameOrigin: false, consoleUploaded: false, physicalDeviceVerified: false,
    liveContent: { sourceConfigured: Boolean(liveContent.catalog_url), catalogURL: liveContent.catalog_url || null, productionServerVerified: false,
      note: liveContent.catalog_url ? 'Remote data endpoint configured; this test does not verify the deployed API.' : 'Loader included, but no production HTTPS content endpoint configured.' } };
  fs.writeFileSync(path.join(root, 'artifacts/toss-preflight-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });
