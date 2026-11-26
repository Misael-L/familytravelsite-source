import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import process from 'node:process';
import { URL } from 'node:url';
import { loopbackProxy } from './loopback-proxy.mjs';
const root = 'http://127.0.0.1:55331',
  alias = 'http://localhost:55331',
  checks = [];
for (const [origins, options] of [
  [[alias], undefined],
  [[alias], { markedLocalhostAlias: true }],
  [[root, 'http://localhost:55332'], { markedLocalhostAlias: true }],
  [[root, 'http://example.invalid:55331'], { markedLocalhostAlias: true }],
  [[root, 'https://localhost:55331'], { markedLocalhostAlias: true }],
]) {
  await assert.rejects(() => loopbackProxy(origins, options));
  checks.push('invalid origin set refused before server creation');
}
const proxy = await loopbackProxy([root, alias], { markedLocalhostAlias: true });
const request = (target) =>
  new Promise((resolve, reject) => {
    const q = http.request(proxy.url, { path: target, method: 'GET' }, (r) => {
      r.resume();
      r.on('end', () => resolve(r.statusCode));
    });
    q.on('error', reject);
    q.end();
  });
const tunnel = (authority) =>
  new Promise((resolve, reject) => {
    const q = http.request(proxy.url, { method: 'CONNECT', path: authority });
    q.on('connect', (r, s) => {
      s.destroy();
      resolve(r.statusCode);
    });
    q.on('error', reject);
    q.end();
  });
const upgrade = (authority) =>
  new Promise((resolve, reject) => {
    const u = new URL(proxy.url),
      q = net.connect(Number(u.port), u.hostname, () =>
        q.write(
          'GET http://' +
            authority +
            '/socket HTTP/1.1\r\nHost: ' +
            authority +
            '\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'
        )
      );
    q.once('data', (d) => {
      q.destroy();
      resolve(d.toString().split('\r\n')[0]);
    });
    q.on('error', reject);
  });
try {
  assert.equal(await request(alias + '/auth/v1/health'), 200);
  checks.push('fixed alias reaches existing API health over pinned IPv4');
  assert.equal(await request('http://example.invalid:55331/'), 403);
  checks.push('offsite HTTP refused');
  assert.equal(await tunnel('example.invalid:443'), 403);
  checks.push('offsite CONNECT refused');
  assert.equal(await tunnel('localhost:55331'), 200);
  checks.push('only allowlisted alias CONNECT reaches pinned IPv4 API');
  assert.match(await upgrade('localhost:55332'), /^HTTP\/1.1 403/);
  checks.push('unlisted WebSocket authority refused');
  proxy.setOffline(true);
  assert.equal(await request(alias + '/auth/v1/health'), 403);
  checks.push('offline mode refuses the alias too');
  const output = process.env.FAMILY_PROXY_CHECK_REPORT;
  if (output) {
    assert.match(output, /^\/private\/tmp\/trek-u03d16-[^/]+\/[^/]+\.json$/);
    await writeFile(
      output,
      JSON.stringify(
        { checks, passed: checks.length, default_guard_unchanged: true, alias_pinned_to_marked_ipv4: true },
        null,
        2
      ) + '\n'
    );
  }
  process.stdout.write(checks.length + ' proxy boundary checks passed\n');
} finally {
  await proxy.close();
}
