const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('register creates the service and opens My Services', () => {
  const src = fs.readFileSync('src/pages/RegisterAgentPage.jsx', 'utf8');
  assert.equal(src.includes('fetch(`${API_BASE}/v1/me/services`'), true);
  assert.equal(src.includes('to="/services"'), true);

  const start = src.indexOf("step === 'complete'");
  assert.notEqual(start, -1);
  const complete = src.slice(start, src.indexOf('\n  return (', start));
  assert.equal(complete.includes('to="/"'), false);
});
