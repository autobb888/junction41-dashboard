import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/pages/GetIdPage.jsx', 'utf8');
const verticals = fs.readFileSync('src/config/verticals.js', 'utf8');

test('Get Free ID lets the user pick agent / compute / data / model', () => {
  assert.match(src, /ID_KINDS/);
  assert.match(src, /setKind/);
  assert.match(src, /useState\('agent'\)/);
  assert.match(src, /role="radiogroup"/);
});

test('Get Free ID offers j41General as the purchaser identity', () => {
  assert.match(verticals, /idKind:\s*'general'/);
  assert.match(verticals, /label:\s*'j41General'/);
  assert.match(src, /KIND_ACCENT[\s\S]*general:/);
  const lineup = fs.readFileSync('src/components/LandingLineup.jsx', 'utf8');
  assert.match(lineup, /VERTICALS\.map/);
  assert.doesNotMatch(lineup, /ID_KINDS/);
});

test('provision challenge and genreq send the chosen kind', () => {
  assert.match(src, /JSON\.stringify\(\s*\{\s*name:\s*lower,\s*kind/);
  assert.match(src, /provision\/genreq\?name=.*kind=/);
});

test('manual /v1/onboard challenge and submit include kind', () => {
  const onboardPosts = [...src.matchAll(/fetch\(`\$\{API_BASE\}\/v1\/onboard`[\s\S]{0,600}?JSON\.stringify\((\{[\s\S]*?\})\)/g)];
  assert.ok(onboardPosts.length >= 2, 'expected challenge + submit /v1/onboard POSTs');
  for (const m of onboardPosts) {
    assert.match(m[1], /\bkind\b/);
  }
});

test('verticals.js names an idKind for every listing kind, not bounties', () => {
  assert.match(verticals, /idKind:\s*'agent'/);
  assert.match(verticals, /idKind:\s*'compute'/);
  assert.match(verticals, /idKind:\s*'data'/);
  assert.match(verticals, /idKind:\s*'model'/);
  const bounties = verticals.slice(verticals.indexOf("key: 'bounties'"), verticals.indexOf("key: 'compute'"));
  assert.doesNotMatch(bounties, /idKind:/);
});
