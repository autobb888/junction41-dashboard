const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('sign-in starts on Verus Mobile', () => {
  const src = fs.readFileSync('src/components/AuthModal.jsx', 'utf8');
  assert.equal(src.includes("useState('legacy')"), true);
  assert.equal(src.includes("useState('genreq')"), false);
});
