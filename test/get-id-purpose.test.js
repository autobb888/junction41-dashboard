const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Get Free ID asks hire or sell and does not paste a fixed parent', () => {
  const src = fs.readFileSync('src/pages/GetIdPage.jsx', 'utf8');
  assert.match(src, /purpose === 'hire'/);
  assert.match(src, /setKind\('general'\)/);
  assert.doesNotMatch(src, /i7xKUpKQDSriYFfgHYfRpFc2uzRKWLDkjW/);
  assert.match(src, /setPurpose\('sell'\);\s*if \(kind === 'general'\) setKind\('agent'\)/);
});
