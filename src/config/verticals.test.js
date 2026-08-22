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

test('Listings switcher: only SovData is soon; compute is not', () => {
  const compute = src.slice(src.indexOf("key: 'compute'"), src.indexOf("key: 'data'"));
  assert.match(compute, /status: 'live'/);
  assert.doesNotMatch(compute, /status: 'soon'/);
  const data = src.slice(src.indexOf("key: 'data'"));
  assert.match(data, /status: 'soon'/);
});

test('LandingPage SovCompute copy is Cat-1, not per-token', () => {
  assertCat1Copy('LandingPage.jsx', fs.readFileSync('src/pages/LandingPage.jsx', 'utf8'));
});

test('public/llms.txt SovCompute copy is Cat-1, not per-token', () => {
  assertCat1Copy('public/llms.txt', fs.readFileSync('public/llms.txt', 'utf8'));
});
