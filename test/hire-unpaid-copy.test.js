const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('confirm hire says it does not send coins and the hire returns after sign-in', () => {
  const modal = fs.readFileSync('src/components/HireModal.jsx', 'utf8');
  const page = fs.readFileSync('src/pages/AgentDetailPage.jsx', 'utf8');
  assert.equal(modal.includes('It does not send coins.'), true);
  assert.equal(page.includes('j41.pendingHire'), true);
});
