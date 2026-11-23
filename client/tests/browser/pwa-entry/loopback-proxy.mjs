// A browser-level HTTP/CONNECT/WS guard also covers service-worker-owned traffic.
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';

export async function loopbackProxy(origins, { markedLocalhostAlias = false, responseBarrier = null } = {}) {
  const allowed = new Set(origins);
  for (const raw of allowed) {
    const u = new URL(raw);
    assert.equal(u.protocol, 'http:');
    const fixedAlias = markedLocalhostAlias && raw === 'http://localhost:55331';
    if (fixedAlias) assert.ok(allowed.has('http://127.0.0.1:55331'));
    else assert.equal(u.hostname, '127.0.0.1');
    assert.equal(u.origin, raw);
    assert.ok(u.port);
  }
  const authorities = new Set([...allowed].map((raw) => new URL(raw).host));
  const transportErrors = [],
    events = [],
    sockets = new Set();
  let offline = false;
  const observe = (kind, u, denied) => events.push({ kind, origin: u.origin, path: u.pathname, denied, offline });
  const server = http.createServer((request, response) => {
    let u;
    try {
      u = new URL(request.url);
    } catch {
      response.writeHead(400);
      return response.end();
    }
    const deny = offline || !allowed.has(u.origin) || !!u.username || !!u.password;
    observe('http', u, deny);
    if (deny) {
      response.writeHead(403, { 'cache-control': 'no-store' });
      return response.end('Blocked by local acceptance network guard');
    }
    // The single explicit alias always connects to the marked IPv4 API; never resolve localhost via DNS.
    const destination = new URL(u.href);
    if (destination.hostname === 'localhost') destination.hostname = '127.0.0.1';
    const forward = http.request(
      destination,
      { method: request.method, headers: { ...request.headers, host: u.host } },
      (upstream) => {
        if (responseBarrier?.intercept(u, upstream, response)) return;
        response.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(response);
      }
    );
    forward.on('error', () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.on('aborted', () => forward.destroy());
    request.pipe(forward);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('error', (error) => {
      transportErrors.push({ code: error.code ?? 'socket-error' });
      socket.destroy();
    });
    socket.on('close', () => sockets.delete(socket));
  });
  const tunnel = (request, socket, head, connect) => {
    const authority = connect ? request.url : new URL(request.url).host;
    const deny = offline || !authorities.has(authority);
    events.push({ kind: connect ? 'connect' : 'websocket', authority, denied: deny, offline });
    if (deny) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const [host, port] = authority.split(':');
    const upstream = net.connect(Number(port), host === 'localhost' ? '127.0.0.1' : host, () => {
      if (connect) socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      else
        upstream.write(
          request.method +
            ' ' +
            new URL(request.url).pathname +
            new URL(request.url).search +
            ' HTTP/1.1\r\n' +
            request.rawHeaders.reduce((s, v, i) => s + (i % 2 ? v + '\r\n' : v + ': '), '') +
            '\r\n'
        );
      if (head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    sockets.add(upstream);
    upstream.on('close', () => sockets.delete(upstream));
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
  };
  server.on('connect', (r, s, h) => tunnel(r, s, h, true));
  server.on('upgrade', (r, s, h) => tunnel(r, s, h, false));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: 'http://127.0.0.1:' + server.address().port,
    events,
    transportErrors,
    setOffline(value) {
      offline = value;
      if (value) for (const socket of sockets) socket.destroy();
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
