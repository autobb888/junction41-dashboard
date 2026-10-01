const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('container nginx does not cap connections on its one local peer', () => {
  const conf = fs.readFileSync('nginx.conf', 'utf8');
  assert.match(conf, /^worker_processes 1;$/m);
  assert.match(conf, /worker_connections 256;/);
  assert.doesNotMatch(conf, /limit_conn/);
  assert.doesNotMatch(conf, /\$binary_remote_addr/);
});
