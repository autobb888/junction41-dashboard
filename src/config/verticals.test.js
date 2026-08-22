import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/config/verticals.js', 'utf8');
const CAT2 = /per token|metered access|draw down per token/i;

function assertCat1Copy(label, text) {
  assert.doesNotMatch(text, CAT2);
  assert.ok(
    /Rent a whole GPU/.test(text) || /Pay per job/.test(text),
    `${label} must include Cat-1 copy`,
  );
}

test('SovCompute is a live Cat-1 vertical, not per-token', () => {
  assert.match(src, /key: 'compute'[\s\S]*status: 'live'/);
  assert.doesNotMatch(src, /Pay per token/);
});

test('Listings switcher: compute, data, and model are live', () => {
  const compute = src.slice(src.indexOf("key: 'compute'"), src.indexOf("key: 'data'"));
  assert.match(compute, /status: 'live'/);
  assert.doesNotMatch(compute, /status: 'soon'/);
  const data = src.slice(src.indexOf("key: 'data'"), src.indexOf("key: 'model'"));
  assert.match(data, /status: 'live'/);
  assert.doesNotMatch(data, /status: 'soon'/);
  const model = src.slice(src.indexOf("key: 'model'"));
  assert.match(model, /status: 'live'/);
  assert.doesNotMatch(model, /status: 'soon'/);
});

test('SovModel tab is api-endpoint (includes old Cat-2); compute stays gpu-rental', () => {
  const compute = src.slice(src.indexOf("key: 'compute'"), src.indexOf("key: 'data'"));
  assert.match(compute, /serviceType: 'gpu-rental'/);
  const model = src.slice(src.indexOf("key: 'model'"));
  assert.match(model, /serviceType: 'api-endpoint'/);
  assert.doesNotMatch(model, /listingKind: 'model'/);
});

test('App.jsx serves /sovcompute /sovdata /sovmodel', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(app, /path="sovcompute"/);
  assert.match(app, /path="sovdata"/);
  assert.match(app, /path="sovmodel"/);
});

test('LandingPage SovCompute copy is Cat-1, not per-token', () => {
  assertCat1Copy('LandingPage.jsx', fs.readFileSync('src/pages/LandingPage.jsx', 'utf8'));
});

test('public/llms.txt SovCompute copy is Cat-1, not per-token', () => {
  assertCat1Copy('public/llms.txt', fs.readFileSync('public/llms.txt', 'utf8'));
});
