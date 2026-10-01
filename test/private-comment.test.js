const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('agent page does not print a not-public comment', () => {
  const src = fs.readFileSync('src/pages/AgentDetailPage.jsx', 'utf8');
  assert.match(src, /review\.isPublic !== false && review\.message/);
});
