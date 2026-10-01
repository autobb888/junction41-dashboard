const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function blockBody(source, header) {
  const open = source.indexOf(header);
  assert.notEqual(open, -1, `missing ${header.trim()}`);
  const brace = source.indexOf('{', open);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(brace + 1, i);
    }
  }
  assert.fail(`unclosed ${header.trim()}`);
}

test('nginx allows 20 connections per visitor and keeps 256 worker connections', () => {
  const conf = fs.readFileSync('nginx.conf', 'utf8');
  assert.match(conf, /^worker_processes 1;$/m);
  assert.match(conf, /worker_connections 256;/);

  const http = blockBody(conf, 'http {');
  const server = blockBody(http, 'server {');
  const httpOutsideServer = http.replace(server, '');

  assert.match(httpOutsideServer, /limit_conn_zone \$binary_remote_addr zone=dashboard_conn:1m;/);
  assert.match(server, /limit_conn dashboard_conn 20;/);
});
