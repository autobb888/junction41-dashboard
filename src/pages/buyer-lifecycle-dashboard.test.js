import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const marketplace = fs.readFileSync('src/pages/MarketplacePage.jsx', 'utf8');
const sidebar = fs.readFileSync('src/components/marketplace/CategorySidebar.jsx', 'utf8');
const kindPage = fs.readFileSync('src/pages/ComputeMarketplacePage.jsx', 'utf8');
const searchBar = fs.readFileSync('src/components/marketplace/MarketplaceSearchBar.jsx', 'utf8');
const card = fs.readFileSync('src/components/marketplace/MarketplaceCard.jsx', 'utf8');
const authModal = fs.readFileSync('src/components/AuthModal.jsx', 'utf8');
const detail = fs.readFileSync('src/pages/AgentDetailPage.jsx', 'utf8');
const apiPanel = fs.readFileSync('src/components/ApiEndpointPanel.jsx', 'utf8');
const developers = fs.readFileSync('src/pages/DevelopersPage.jsx', 'utf8');

test('kind-tab search placeholder does not interpolate 0 while loading', () => {
  assert.match(kindPage, /placeholder=\{loading/);
  assert.doesNotMatch(kindPage, /placeholder=\{`Search \$\{totalCount/);
  const start = kindPage.indexOf('placeholder={loading');
  const trueBranch = kindPage.slice(start, kindPage.indexOf(':', start));
  assert.doesNotMatch(trueBranch, /Search 0/);
  assert.doesNotMatch(trueBranch, /\$\{totalCount/);
});

test('listings search placeholder does not interpolate 0 while loading', () => {
  assert.match(marketplace, /<MarketplaceSearchBar[\s\S]{0,200}loading=/);
  assert.match(searchBar, /loading/);
  assert.doesNotMatch(
    searchBar,
    /placeholder=\{`Search \$\{agentCount\.toLocaleString\(\)\}/,
  );
});

test('All SovAgents uses unfiltered list meta.total, not summed category counts', () => {
  assert.match(marketplace, /\/v1\/services\?serviceType=agent/);
  assert.match(marketplace, /setAllAgentsTotal\(data\.meta\?\.total/);
  assert.doesNotMatch(marketplace, /if \(data\.counts\)/);
  assert.doesNotMatch(marketplace, /Object\.values\(data\.counts\)\.reduce/);
  assert.match(marketplace, /data\.data\[\]\.count|cat\.count|item\.count|row\.count/);
  assert.match(marketplace, /totalCount=\{allAgentsTotal\}/);
  assert.match(marketplace, /useState\(undefined\)/);
});

test('CategorySidebar does not coerce unset All SovAgents total to 0', () => {
  assert.doesNotMatch(sidebar, /\(totalCount \|\| 0\)/);
});

test('listings count line omits numeric 0 while loading', () => {
  const countLine = marketplace.slice(
    marketplace.indexOf('borderTop: \'1px solid var(--border-subtle)\''),
    marketplace.indexOf('Sidebar + Grid layout'),
  );
  assert.match(countLine, /loading/);
  assert.doesNotMatch(countLine, /\{totalCount\} \{totalCount === 1/);
});

test('kind-tab count line omits numeric 0 while loading', () => {
  const idx = kindPage.indexOf('{totalCount} {nounPhrase(noun, totalCount)} available');
  assert.equal(idx, -1, 'must not render totalCount while the request is in flight');
  assert.match(kindPage, /loading[\s\S]{0,180}Loading listings|loading[\s\S]{0,180}—/);
});

test('asMarketplaceCard always passes website', () => {
  const mapper = kindPage.slice(
    kindPage.indexOf('function asMarketplaceCard'),
    kindPage.indexOf('export function KindMarketplacePage'),
  );
  assert.match(mapper, /website:\s*row\.website/);
});

test('MarketplaceCard Globe website link stops click from navigating', () => {
  assert.match(card, /service\.website/);
  assert.match(card, /stopPropagation/);
  assert.match(card, /Globe/);
});

test('AuthModal resets fetchingRef when isOpen and times out the challenge fetch', () => {
  const openEffect = authModal.slice(
    authModal.indexOf('// Fetch challenge + reset state when modal opens'),
    authModal.indexOf('// Focus trap'),
  );
  assert.match(openEffect, /fetchingRef\.current = false/);
  assert.match(authModal, /AbortController|AbortSignal\.timeout|CHALLENGE_TIMEOUT/);
});

test('HOW TO CONNECT snippet has no app.junction41.io or Junction41Client', () => {
  assert.doesNotMatch(apiPanel, /app\.junction41\.io/);
  assert.doesNotMatch(apiPanel, /Junction41Client/);
  assert.match(apiPanel, /j41-dispatcher access/);
  assert.match(apiPanel, /@junction41\/sovagent-sdk/);
});

test('HOW TO CONNECT snippet does not name invented client.authenticate()', () => {
  assert.doesNotMatch(apiPanel, /authenticate\(\)/);
});

test('All SovAgents meta.total is parsed independently of carousel enrich', () => {
  const fn = marketplace.slice(
    marketplace.indexOf('async function fetchCarousels'),
    marketplace.indexOf('// Initial load'),
  );
  const allIdx = fn.indexOf('setAllAgentsTotal');
  const enrichIdx = fn.indexOf('enrichWithReputation');
  assert.ok(allIdx !== -1, 'must set allAgentsTotal from unfiltered list meta');
  assert.ok(allIdx < enrichIdx, 'allRes must be applied before featured/trending enrich');
});

test('developers page uses @junction41/sovagent-sdk and pins j41-dispatcher@2.37.3', () => {
  assert.match(developers, /@junction41\/sovagent-sdk/);
  assert.doesNotMatch(developers, /@j41\/sovagent-sdk/);
  assert.match(developers, /j41-dispatcher@2\.37\.3/);
  assert.doesNotMatch(developers, /j41-dispatcher@2\.37\.4/);
});

test('live http(s) endpoint is not labeled Pending solely for verified=false', () => {
  assert.doesNotMatch(detail, /epVerify\?\.status \|\| 'Pending'/);
  const badge = detail.slice(detail.indexOf('{ep.verified ?'), detail.indexOf('{ep.verified ?') + 500);
  assert.match(detail, /https\?:/);
  assert.ok(!/Pending/.test(badge) || /https\?:/.test(badge));
});
