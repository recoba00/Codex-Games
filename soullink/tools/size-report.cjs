const fs = require('node:fs');
const path = require('node:path');

const MIB = 1024 * 1024;
const LIMITS = { 'index.wasm': 40 * MIB, 'index.pck': 14 * MIB, total: 60 * MIB };

function collect(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error(`Unexpected symlink in release: ${name}`);
    return entry.isDirectory() ? collect(file, name) : [{ name, bytes: fs.statSync(file).size }];
  });
}

function inspect(files) {
  const byName = new Map(files.map(file => [file.name, file.bytes]));
  const errors = [];
  for (const name of ['index.html', 'index.wasm', 'index.pck']) {
    if (!byName.get(name)) errors.push(`Missing release file: ${name}`);
  }
  for (const file of files) {
    if (/(^|\/)(?:admin|docs|server|tools|tests|source)(\/|$)/.test(file.name) ||
        /(^|\/)\.[^/]+|\.(?:log|md)$/i.test(file.name)) {
      errors.push(`Non-game file in release: ${file.name}`);
    }
  }
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  for (const [name, limit] of Object.entries(LIMITS)) {
    const bytes = name === 'total' ? total : byName.get(name) || 0;
    if (bytes > limit) errors.push(`${name}: ${(bytes / MIB).toFixed(2)} MiB exceeds ${(limit / MIB).toFixed(0)} MiB`);
  }
  return { total, errors, largest: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 12) };
}

function markdown(report) {
  const rows = report.largest.map(file => `| ${file.name} | ${(file.bytes / MIB).toFixed(2)} |`);
  return ['## Soul Link Web size', '', `Total: **${(report.total / MIB).toFixed(2)} MiB** (raw files).`,
    `Limits: WASM ${LIMITS['index.wasm'] / MIB}, PCK ${LIMITS['index.pck'] / MIB}, total ${LIMITS.total / MIB} MiB.`,
    '', '| File | MiB |', '| --- | ---: |', ...rows, '',
    ...(report.errors.length ? ['**Failed:** ' + report.errors.join('; '), ''] : [])].join('\n');
}

if (require.main === module) {
  const directory = path.resolve(process.argv[2] || path.join(__dirname, '../build/web'));
  const report = inspect(collect(directory));
  const summary = markdown(report);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  if (report.errors.length) process.exitCode = 1;
}

module.exports = { collect, inspect, markdown, LIMITS };
