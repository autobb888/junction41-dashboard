import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidWalletDeeplink, safeWalletDeeplink } from './walletDeeplink.js';

// canonical scheme emitted by verus-typescript-primitives toWalletDeeplinkUri()
const CANON = 'i5jtwbp6zymeay9llnraglgjqgdrffsau4://x-callback-url/i3dQmgjq8L8XFGQUrs9Gpo8zvPWqs1KMtV/?x=AAAA';

test('accepts the canonical wallet scheme', () => {
  assert.equal(isValidWalletDeeplink(CANON), true);
});

test('accepts the verus:// and veruspay:// alias schemes', () => {
  assert.equal(isValidWalletDeeplink('verus://sign/abc'), true);
  assert.equal(isValidWalletDeeplink('veruspay://invoice/abc'), true);
});

test('rejects javascript: and data: (XSS sinks)', () => {
  assert.equal(isValidWalletDeeplink('javascript:alert(1)'), false);
  assert.equal(isValidWalletDeeplink('data:image/png;base64,AAAA'), false);
});

test('rejects http(s) and unknown schemes', () => {
  assert.equal(isValidWalletDeeplink('https://evil.example/x'), false);
  assert.equal(isValidWalletDeeplink('bitcoin://x'), false);
});

test('rejects non-strings and empty', () => {
  assert.equal(isValidWalletDeeplink(null), false);
  assert.equal(isValidWalletDeeplink(undefined), false);
  assert.equal(isValidWalletDeeplink(42), false);
  assert.equal(isValidWalletDeeplink(''), false);
});

test('safeWalletDeeplink returns the uri when valid, null when not', () => {
  assert.equal(safeWalletDeeplink(CANON), CANON);
  assert.equal(safeWalletDeeplink('javascript:alert(1)'), null);
});
