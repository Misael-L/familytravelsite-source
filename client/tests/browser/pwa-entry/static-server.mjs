// Serve each generated build unchanged; a switch simulates a release at the same origin.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';
export async function artifactServer(initial) {
  let directory = initial;
  const valid = (d) => assert.ok(/^\/private\/tmp\/trek-u03d(?:9|10|11|12|14|15|16)-/.test(d));
  valid(directory);
  const types = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.wasm': 'application/wasm',
  };
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      const relative = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
      let file = path.resolve(directory, relative);
      if (!file.startsWith(path.resolve(directory) + '/')) {
        res.writeHead(403);
        res.end();
        return;
      }
      let body;
      try {
        body = await readFile(file);
      } catch {
        if (req.method !== 'GET' || !req.headers.accept?.includes('text/html')) {
          res.writeHead(404);
          res.end();
          return;
        }
        file = path.join(directory, 'index.html');
        body = await readFile(file);
      }
      res.writeHead(200, {
        'content-type': types[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: 'http://127.0.0.1:' + server.address().port,
    switchDirectory(d) {
      valid(d);
      directory = d;
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
