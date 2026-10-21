const test = require('node:test');
const assert = require('node:assert/strict');
const { inspect, markdown, LIMITS } = require('../tools/size-report.cjs');

const base = [
  { name: 'index.html', bytes: 10 },
  { name: 'index.wasm', bytes: 100 },
  { name: 'index.pck', bytes: 100 },
];

test('release size report lists the largest files and accepts a bounded game', () => {
  const report = inspect([...base, { name: 'intro/cinematic.mp4', bytes: 200 }]);
  assert.deepEqual(report.errors, []);
  assert.equal(report.total, 410);
  assert.equal(report.largest[0].name, 'intro/cinematic.mp4');
  assert.match(markdown(report), /Total: \*\*0\.00 MiB\*\*/);
});

test('release size report rejects missing, oversized, and operational files', () => {
  const report = inspect([
    { name: 'index.html', bytes: 10 },
    { name: 'index.wasm', bytes: LIMITS['index.wasm'] + 1 },
    { name: 'admin/index.html', bytes: 10 },
    { name: '.server.err.log', bytes: 10 },
  ]);
  assert.ok(report.errors.some(error => error.includes('Missing release file: index.pck')));
  assert.ok(report.errors.some(error => error.includes('index.wasm:')));
  assert.equal(report.errors.filter(error => error.includes('Non-game file')).length, 2);
});
