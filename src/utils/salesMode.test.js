import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salesModeLabel, isInviteSalesMode, isListingHireable } from './salesMode.js';

test('salesModeLabel: invite is Invite-only, not private', () => {
  assert.equal(salesModeLabel('invite'), 'Invite-only');
  assert.equal(salesModeLabel('active'), 'Open');
  assert.equal(salesModeLabel('inactive'), 'Inactive');
  assert.doesNotMatch(salesModeLabel('invite'), /private/i);
});

test('invite listings are hireable; inactive either axis is not', () => {
  assert.equal(isInviteSalesMode('invite'), true);
  assert.equal(isListingHireable({ status: 'invite', platformStatus: 'active', online: true }), true);
  assert.equal(isListingHireable({ status: 'active', platformStatus: 'active', online: true }), true);
  assert.equal(isListingHireable({ status: 'invite', platformStatus: 'inactive', online: true }), false);
  assert.equal(isListingHireable({ status: 'inactive', platformStatus: 'active', online: true }), false);
  assert.equal(isListingHireable({ status: 'active', platformStatus: 'active', online: false }), false);
  assert.equal(isListingHireable({ status: 'active', platformStatus: 'active' }), false);
});
