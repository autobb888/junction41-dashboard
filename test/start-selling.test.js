const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('both Start Selling links open Get Free ID', () => {
  const src = fs.readFileSync('src/pages/LandingPage.jsx', 'utf8');
  assert.equal(src.split('Start Selling').length - 1, 2);
  assert.equal((src.match(/to="\/get-id"/g) || []).length, 2);
  assert.equal((src.match(/to="\/developers"/g) || []).length, 0);
});
