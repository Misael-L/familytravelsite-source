import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { Readable, Writable } from 'node:stream';
import { URL } from 'node:url';
import { responseBarrier } from './response-barrier.mjs';
const checks = [];
class Downstream extends Writable {
  constructor() {
    super();
    this.chunks = [];
    this.headersSent = false;
    this.flushed = false;
  }
  writeHead(status, headers) {
    this.status = status;
    this.headers = headers;
    this.headersSent = true;
  }
  flushHeaders() {
    this.flushed = true;
  }
  _write(chunk, _encoding, done) {
    this.chunks.push(Buffer.from(chunk));
    done();
  }
}
const address = (kind) =>
  new URL(
    'http://127.0.0.1:55331' +
      (kind === 'planner'
        ? '/rest/v1/rpc/get_family_trip_planner_view_v1'
        : '/storage/v1/object/sign/trip-files/synthetic.pdf?token=never-recorded')
  );
const upstream = () =>
  Object.assign(Readable.from([Buffer.from([0, 255, 128, 13, 10])]), {
    statusCode: 200,
    headers: { 'content-length': '5', 'content-type': 'application/octet-stream' },
  });
for (const kind of ['planner', 'media'])
  for (const phase of ['headers', 'body']) {
    const barrier = responseBarrier(),
      hold = barrier.hold(kind, phase),
      body = upstream(),
      result = new Downstream();
    assert.equal(barrier.intercept(address(kind), body, result), true);
    assert.deepEqual(await hold.reached, { status: 200, headersDelivered: phase === 'body' });
    assert.equal(result.headersSent, phase === 'body');
    assert.equal(result.flushed, phase === 'body');
    assert.equal(result.chunks.length, 0);
    assert.throws(() => barrier.hold(kind, phase));
    checks.push(
      kind + ' ' + phase + ' pauses genuine bytes, exposes only the selected headers and refuses a concurrent hold'
    );
    const ended = once(result, 'finish');
    hold.release();
    hold.release();
    await ended;
    assert.deepEqual(Buffer.concat(result.chunks), Buffer.from([0, 255, 128, 13, 10]));
    assert.equal(result.status, 200);
    assert.equal(hold.observation.timedOut, false);
    assert.deepEqual(Object.keys(hold.observation).sort(), [
      'arrived',
      'kind',
      'phase',
      'released',
      'status',
      'timedOut',
    ]);
    checks.push(
      kind +
        ' ' +
        phase +
        ' release is idempotent and preserves status and exact binary bytes without recording signed URLs'
    );
    barrier.close();
  }
for (const url of [
  'http://example.invalid:55331/rest/v1/rpc/get_family_trip_planner_view_v1',
  'http://localhost:55331/rest/v1/rpc/get_family_trip_planner_view_v1',
  'http://127.0.0.1:55332/rest/v1/rpc/get_family_trip_planner_view_v1',
  'http://127.0.0.1:55331/rest/v1/rpc/execute_family_trip_command_v1',
  'http://127.0.0.1:55331/auth/v1/token',
]) {
  const barrier = responseBarrier(),
    hold = barrier.hold('planner');
  assert.equal(barrier.intercept(new URL(url), upstream(), new Downstream()), false);
  hold.release();
  checks.push('unlisted origin, port or operation cannot match a barrier');
}
{
  const barrier = responseBarrier();
  assert.throws(() => barrier.hold('anything'));
  assert.throws(() => barrier.hold('planner', 'anything'));
  checks.push('unknown kinds and phases fail before arming');
  const hold = barrier.hold('media'),
    body = upstream(),
    result = new Downstream();
  barrier.intercept(address('media'), body, result);
  await hold.reached;
  result.destroy();
  hold.release();
  assert.equal(body.destroyed, true);
  assert.equal(result.chunks.length, 0);
  checks.push('closing the downstream discards the paused upstream without delivering bytes');
  barrier.close();
}
const output = process.env.FAMILY_RESPONSE_BARRIER_REPORT;
if (output) {
  assert.match(output, /^\/private\/tmp\/trek-u03d16-[^/]+\/[^/]+\.json$/);
  await writeFile(output, JSON.stringify({ passed: checks.length, checks }, null, 2) + '\n');
}
process.stdout.write(checks.length + ' response barrier transport checks passed\n');
