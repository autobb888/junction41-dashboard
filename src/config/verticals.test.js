import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/config/verticals.js', 'utf8');

test('SovCompute is a live Cat-1 vertical, not per-token', () => {
  assert.match(src, /key: 'compute'[\s\S]*status: 'live'/);
  assert.doesNotMatch(src, /Pay per token/);
});
