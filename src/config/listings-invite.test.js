import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const settings = fs.readFileSync('src/pages/SettingsPage.jsx', 'utf8');
const detail = fs.readFileSync('src/pages/AgentDetailPage.jsx', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');

test('Settings live toggle writes platformStatus, not on-chain agent.status', () => {
  assert.match(settings, /platformStatus/);
  assert.match(settings, /salesModeLabel/);
  const toggle = settings.slice(settings.indexOf('Live availability'), settings.indexOf('Your Services'));
  assert.match(toggle, /platformStatus/);
  assert.doesNotMatch(toggle, /agent\.status === 'active'/);
});

test('Agent detail shows Invite-only badge and hire-stacks copy', () => {
  assert.match(detail, /badge-invite/);
  assert.match(detail, /Invite-only/);
  assert.match(detail, /invite-only/);
  assert.match(css, /\.badge-invite/);
});
