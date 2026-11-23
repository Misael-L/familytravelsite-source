import { URL } from 'node:url';
// Independent test-only archive reader. Never writes a database or executes a command.
import assert from 'node:assert/strict';
import { Blob, Buffer, File } from 'node:buffer';
import { createHash } from 'node:crypto';
export function readOriginalWorkArchive(bytes) {
  assert.ok(bytes.length <= 32 * 1024 * 1024);
  const outer = JSON.parse(bytes.toString('utf8'));
  assert.ok(['family.original-work.v2', 'family.original-work.v3'].includes(outer.format));
  assert.equal(typeof outer.payload, 'string');
  assert.equal(createHash('sha256').update(outer.payload).digest('hex'), outer.sha256);
  const payload = JSON.parse(outer.payload),
    { root, nodes } = payload.graph;
  assert.equal(payload.automatic_replay, false);
  if (outer.format === 'family.original-work.v3') {
    const owner = payload.source_owner;
    assert.equal(owner.format, 'family.native-owner.v1');
    assert.equal(Object.keys(owner).length, 6);
    for (const key of ['user_id', 'family_id', 'person_id']) assert.match(owner[key], /^[a-f0-9-]{36}$/);
    assert.ok(Number.isSafeInteger(owner.native_user) && owner.native_user > 0);
    assert.equal(new URL(owner.source).href.replace(/\/+$/, ''), owner.source);
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          format: owner.format,
          source: owner.source,
          user_id: owner.user_id,
          family_id: owner.family_id,
          person_id: owner.person_id,
          native_user: owner.native_user,
        })
      )
      .digest('hex');
    assert.equal(payload.database, 'trek-offline-f1-' + digest + '-u' + owner.native_user);
  } else assert.match(payload.database, /^trek-offline-u[1-9][0-9]*$/);
  assert.ok(nodes.length <= 100000);
  const objects = [];
  let binary = 0;
  const value = (v) => {
    assert.ok(Array.isArray(v));
    switch (v[0]) {
      case 'null':
        assert.equal(v.length, 1);
        return null;
      case 'undefined':
        assert.equal(v.length, 1);
        return undefined;
      case 'boolean':
        assert.equal(typeof v[1], 'boolean');
        return v[1];
      case 'string':
        assert.equal(typeof v[1], 'string');
        return v[1];
      case 'number':
        assert.ok(typeof v[1] === 'number' || ['-0', 'NaN', 'Infinity', '-Infinity'].includes(v[1]));
        return v[1] === '-0' ? -0 : Number(v[1]);
      case 'bigint':
        assert.match(v[1], /^-?\d+$/);
        return BigInt(v[1]);
      case 'ref':
        assert.ok(Number.isSafeInteger(v[1]) && v[1] >= 0 && v[1] < nodes.length);
        return objects[v[1]];
      default:
        throw Error('Unknown archive value');
    }
  };
  for (const n of nodes) {
    if (n.kind === 'object') {
      assert.ok(['object', 'null'].includes(n.prototype));
      objects.push(Object.create(n.prototype === 'null' ? null : Object.prototype));
    } else if (n.kind === 'array') {
      assert.ok(Number.isSafeInteger(n.length) && n.length >= 0 && n.length <= 100000);
      objects.push(new Array(n.length));
    } else if (n.kind === 'date') objects.push(new Date(value(n.milliseconds)));
    else {
      assert.ok(['blob', 'file', 'array-buffer'].includes(n.kind));
      const data = Buffer.from(n.bytes, 'base64');
      assert.equal(data.toString('base64'), n.bytes);
      assert.equal(data.length, n.size);
      assert.equal(createHash('sha256').update(data).digest('hex'), n.sha256);
      binary += data.length;
      assert.ok(binary <= 16 * 1024 * 1024);
      objects.push(
        n.kind === 'array-buffer'
          ? new Uint8Array(data).buffer
          : n.kind === 'file'
            ? new File([data], n.name, { type: n.type, lastModified: n.lastModified })
            : new Blob([data], { type: n.type })
      );
    }
  }
  nodes.forEach((n, i) => {
    const keys = new Set();
    for (const [key, encoded] of n.entries ?? []) {
      assert.equal(typeof key, 'string');
      assert.ok(!keys.has(key));
      keys.add(key);
      assert.ok(!(n.kind === 'array' && key === 'length'));
      Object.defineProperty(objects[i], key, {
        value: value(encoded),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  });
  assert.equal(binary, payload.graph.binary_bytes);
  const data = value(root);
  assert.equal(data.queue.length, payload.counts.queue);
  assert.equal(data.imports.length, payload.counts.imports);
  assert.ok(data.queue.length + data.imports.length <= 5000);
  return { payload, data, sha256: outer.sha256 };
}
