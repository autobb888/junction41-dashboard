const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const REPUTATION = 'A public review shows its comment. A review marked not public shows the score only. The seller writes an accepted review to the identity. Until then it waits in the seller inbox.';
const CURRENCY = 'The live test settles in VRSCTEST. VRSC and vETH are mainnet currencies and are not this test.';
const DATASET = 'A priced dataset can be hired. A price of 0 cannot.';

test('home and product pages say what the code does', () => {
  const landing = fs.readFileSync('src/pages/LandingPage.jsx', 'utf8');
  const compute = fs.readFileSync('src/pages/ComputeMarketplacePage.jsx', 'utf8');
  const api = fs.readFileSync('src/pages/ApiAccessPage.jsx', 'utf8');

  assert.equal(landing.includes(REPUTATION), true);
  assert.equal(landing.includes(CURRENCY), true);
  assert.equal(landing.includes('Every review is permanent.'), false);
  assert.equal(compute.includes(DATASET), true);
  assert.equal(compute.includes('POST /v1/jobs is refused'), false);
  assert.equal(api.includes('to="/sovmodel"'), true);
});
