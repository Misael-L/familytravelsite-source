// Public static build identity only. This grants no account/backend authority.
(function (root) {
  var MAX_DESCRIPTOR = 8192;
  var MAX_ENTRY = 8 * 1024 * 1024;
  var sequence = 0;
  function keys(value, expected) {
    return (
      value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === expected
    );
  }
  function validate(value) {
    if (
      !keys(value, 'entry,format,version') ||
      value.format !== 'family.build.v1' ||
      typeof value.version !== 'string' ||
      !/^[\w.+-]{1,64}$/.test(value.version) ||
      !keys(value.entry, 'bytes,path,sha256') ||
      typeof value.entry.path !== 'string' ||
      !/^\/assets\/index-[A-Za-z0-9_-]+\.js$/.test(value.entry.path) ||
      !Number.isSafeInteger(value.entry.bytes) ||
      value.entry.bytes < 1 ||
      value.entry.bytes > MAX_ENTRY ||
      typeof value.entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.entry.sha256)
    )
      return null;
    return Object.freeze({
      format: value.format,
      version: value.version,
      entry: Object.freeze({ path: value.entry.path, bytes: value.entry.bytes, sha256: value.entry.sha256 }),
    });
  }
  function wait(promise, signal) {
    return new Promise(function (resolve, reject) {
      function abort() {
        reject(new Error('Build observation cancelled'));
      }
      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true });
      Promise.resolve(promise)
        .then(resolve, reject)
        .finally(function () {
          signal.removeEventListener('abort', abort);
        });
    });
  }
  async function bytes(response, limit, signal) {
    var encoding = response.headers.get('content-encoding');
    var length = encoding && encoding !== 'identity' ? null : response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) throw new Error('Build body too large');
    if (!response.body || typeof response.body.getReader !== 'function') throw new Error('Build stream unavailable');
    var reader = response.body.getReader(),
      chunks = [],
      size = 0,
      complete = false;
    try {
      for (;;) {
        var next = await wait(reader.read(), signal);
        if (next.done) {
          complete = true;
          break;
        }
        size += next.value.byteLength;
        if (size > limit) throw new Error('Build body too large');
        chunks.push(next.value);
      }
      if (length !== null && size !== Number(length)) throw new Error('Build body truncated');
      var output = new Uint8Array(size),
        offset = 0;
      chunks.forEach(function (chunk) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
      });
      return output;
    } finally {
      if (!complete) void reader.cancel().catch(function () {});
      reader.releaseLock();
    }
  }
  async function read(fetcher, origin, options) {
    options = options || {};
    var ctrl = new AbortController(),
      timer = setTimeout(function () {
        ctrl.abort();
      }, 3000);
    function abort() {
      ctrl.abort();
    }
    if (options.signal) {
      options.signal.addEventListener('abort', abort, { once: true });
      if (options.signal.aborted) abort();
    }
    try {
      var base = new URL(origin);
      if (base.origin !== origin || !/^https?:$/.test(base.protocol)) return null;
      async function request(path) {
        var url = new URL(path, base);
        url.searchParams.set('family-build-check', Date.now().toString(36) + '-' + ++sequence);
        var response = await wait(
          fetcher(url.href, { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: ctrl.signal }),
          ctrl.signal
        );
        if (response.status !== 200 || response.redirected) throw new Error('Build response refused');
        if (response.url && (new URL(response.url).origin !== origin || new URL(response.url).pathname !== path))
          throw new Error('Build response moved');
        return response;
      }
      var response = await request('/family-build.json');
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) return null;
      var descriptor = validate(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await bytes(response, MAX_DESCRIPTOR, ctrl.signal)))
      );
      if (!descriptor || ctrl.signal.aborted) return null;
      if (options.verifyEntry) {
        if (!root.crypto || !root.crypto.subtle) return null;
        var entry = await request(descriptor.entry.path);
        if (
          !/^(?:application|text)\/(?:javascript|ecmascript)(?:\s*;|$)/i.test(entry.headers.get('content-type') || '')
        )
          return null;
        var body = await bytes(entry, descriptor.entry.bytes, ctrl.signal);
        if (body.byteLength !== descriptor.entry.bytes) return null;
        var digest = new Uint8Array(await wait(root.crypto.subtle.digest('SHA-256', body), ctrl.signal));
        var hex = Array.from(digest, function (v) {
          return v.toString(16).padStart(2, '0');
        }).join('');
        if (hex !== descriptor.entry.sha256 || ctrl.signal.aborted) return null;
      }
      return descriptor;
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
      if (options.signal) options.signal.removeEventListener('abort', abort);
    }
  }
  root.FamilyBuildContract = Object.freeze({ validate: validate, read: read });
})(globalThis);
