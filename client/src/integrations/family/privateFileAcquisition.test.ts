import { Blob as NativeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeId, completeScope, completeTripData } from '../../../tests/helpers/familyCompleteTrip';
import { serializeCompleteTrip } from './completeTripSnapshot';
import { plannerCacheKey, plannerCacheOwnerKey } from './plannerCache';
import { acquirePreparationFile, readPreparationFileBody } from './privateFileAcquisition';
import { FamilyFrontendRepository, familyReaders } from './repository';
const s = completeScope,
  source = 'http://127.0.0.1:55331';
function held<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function fixture() {
  const data = completeTripData(),
    file = data.companions.files[0];
  file.size_bytes = 12;
  file.mime_type = 'application/pdf';
  const e = await serializeCompleteTrip({
    source,
    scope: s,
    capturedAt: Date.now(),
    admitReadOnly: true,
    ownership: {
      key: plannerCacheKey(source, s),
      ownerKey: plannerCacheOwnerKey(source, { user_id: s.user_id, family_id: s.family_id, person_id: s.person_id }),
      ownerGeneration: completeId(91),
      tripGeneration: completeId(92),
    },
    data,
  });
  let retired = false;
  const check = () => {
    if (retired) throw Error('Original read ended');
  };
  const row = {
    id: file.id,
    tripId: file.trip_id,
    storagePath: file.storage_path,
    originalName: file.original_name,
    mimeType: file.mime_type,
    sizeBytes: file.size_bytes,
    uploadedBy: file.uploaded_by,
    starred: file.starred,
    description: file.description,
    deletedAt: file.deleted_at,
    createdAt: file.created_at,
    links: [],
  };
  const signed = source + '/storage/v1/object/sign/trip-files/' + row.storagePath + '?token=fixture-signature';
  const readers = {
    ...familyReaders,
    files: {
      ...familyReaders.files,
      listTripFiles: vi.fn(async () => [row]),
      signedTripFileUrl: vi.fn(async () => signed),
    },
  };
  const repo = new FamilyFrontendRepository(
    async () => ({
      userId: s.user_id,
      personId: s.person_id,
      familyId: s.family_id,
      user: { username: 'Fixture', email: 'fixture@example.invalid', avatar_url: null, created_at: '2026-01-01' },
    }),
    readers,
    () => ({ source, userId: s.user_id, personId: s.person_id, familyId: s.family_id })
  );
  await repo.fileList(s.trip_id);
  const response = () =>
    new Response('%PDF-fixture', { headers: { 'content-type': 'application/pdf', 'content-length': '12' } });
  const network = vi.fn<typeof fetch>(async () => response()),
    verify = vi.fn(async () => check());
  const run = (options: Partial<Parameters<typeof acquirePreparationFile>[0]> = {}) =>
    acquirePreparationFile({
      repo,
      read: { envelope: e, check, verify },
      fileId: row.id,
      intent: 'user-request',
      network,
      ...options,
    });
  return {
    e,
    row,
    readers,
    repo,
    network,
    verify,
    signed,
    response,
    run,
    retire: () => {
      retired = true;
    },
  };
}
beforeEach(() => {
  vi.stubGlobal('Blob', NativeBlob);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('explicit private file acquisition under an admitted generation', () => {
  it('returns original authorized bytes and a token-free unversioned receipt without renewing access or persisting', async () => {
    const f = await fixture(),
      original = JSON.stringify(f.e),
      result = await f.run();
    expect(await result.blob.text()).toBe('%PDF-fixture');
    expect(result.receipt).toMatchObject({
      generation: f.e.generation,
      snapshotDigest: f.e.digest,
      expiresAt: f.e.expiresAt,
      persisted: false,
      serverContentVersion: 'unversioned',
      content: { bytes: 12, mime: 'application/pdf' },
    });
    expect(result.receipt.content.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result.receipt)).not.toContain('fixture-signature');
    expect(JSON.stringify(f.e)).toBe(original);
    expect(f.network).toHaveBeenCalledExactlyOnceWith(
      f.signed,
      expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store' })
    );
    expect(f.readers.files.listTripFiles).toHaveBeenCalledTimes(3);
  });
  it('requires an explicit request before signing or downloading', async () => {
    const f = await fixture();
    await expect(f.run({ intent: 'background' as 'user-request' })).rejects.toMatchObject({ code: 'intent' });
    expect(f.network).not.toHaveBeenCalled();
    expect(f.readers.files.signedTripFileUrl).not.toHaveBeenCalled();
  });
  it.each(['missing', 'other-trip', 'no-binding', 'manifest', 'draft', 'source', 'path', 'mime', 'size'])(
    'refuses %s saved selection before private dispatch',
    async (reason) => {
      const f = await fixture(),
        row = f.e.data.companions.files[0];
      if (reason === 'missing') f.e.data.companions.files = [];
      if (reason === 'other-trip') row.trip_id = completeId(99);
      if (reason === 'no-binding') f.e.bindings = f.e.bindings.filter((b) => b.kind !== 'file');
      if (reason === 'manifest') f.e.media = [];
      if (reason === 'draft') (f.e.scope as { layer: string }).layer = 'myDraft';
      if (reason === 'source') f.e.source = 'https://hosted.example.invalid';
      if (reason === 'path') row.storage_path = '../private.pdf';
      if (reason === 'mime') row.mime_type = 'text/html';
      if (reason === 'size') row.size_bytes = 52428801;
      await expect(f.run()).rejects.toThrow();
      expect(f.network).not.toHaveBeenCalled();
    }
  );
  it.each([
    'id',
    'tripId',
    'storagePath',
    'originalName',
    'mimeType',
    'sizeBytes',
    'uploadedBy',
    'createdAt',
    'deletedAt',
  ])('refuses changed observed %s before signing', async (key) => {
    const f = await fixture();
    Object.assign(f.row, { [key]: key === 'sizeBytes' ? 1 : 'changed' });
    await expect(f.run()).rejects.toThrow();
    expect(f.readers.files.signedTripFileUrl).not.toHaveBeenCalled();
  });
  it('ignores mutable stars and description when comparing the content binding', async () => {
    const f = await fixture();
    f.row.starred = !f.row.starred;
    f.row.description = 'Personal metadata';
    expect((await f.run()).receipt.content.bytes).toBe(12);
  });
  it.each([401, 403, 404, 500])('refuses HTTP %i without reusing previous acquired bytes', async (status) => {
    const f = await fixture();
    await f.run();
    f.network.mockResolvedValueOnce(new Response(null, { status }));
    await expect(f.run()).rejects.toMatchObject({ status });
    expect(f.network).toHaveBeenCalledTimes(2);
  });
  it.each([
    'https://other.invalid/storage/v1/object/sign/trip-files/a?token=x',
    source + '/storage/v1/object/public/trip-files/a',
    source + '/render/image/sign/trip-files/a?token=x',
  ])('refuses an unexpected SDK address before byte dispatch: %s', async (url) => {
    const f = await fixture();
    f.readers.files.signedTripFileUrl.mockResolvedValueOnce(url);
    await expect(f.run()).rejects.toThrow();
    expect(f.network).not.toHaveBeenCalled();
  });
  it('rechecks original stored generation after download and refuses a replacement without publishing bytes', async () => {
    const f = await fixture();
    f.network.mockImplementationOnce(async () => {
      f.retire();
      return f.response();
    });
    await expect(f.run()).rejects.toThrow('Original read ended');
  });
  it('refuses a real metadata change observed after the body', async () => {
    const f = await fixture();
    f.network.mockImplementationOnce(async () => {
      f.row.storagePath = 'replacement.pdf';
      return f.response();
    });
    await expect(f.run()).rejects.toMatchObject({ code: 'metadata' });
  });
  it('retains the original deadline and does not acquire after expiry', async () => {
    const f = await fixture();
    vi.spyOn(Date, 'now').mockReturnValue(f.e.expiresAt);
    await expect(f.run()).rejects.toMatchObject({ code: 'scope' });
    expect(f.network).not.toHaveBeenCalled();
  });
  it('observes cancellation before signing', async () => {
    const f = await fixture(),
      c = new AbortController();
    c.abort();
    await expect(f.run({ signal: c.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.readers.files.signedTripFileUrl).not.toHaveBeenCalled();
  });
  it.each(['deadline', 'scope'])(
    'retires a stalled response without waiting for another chunk on %s',
    async (reason) => {
      const f = await fixture(),
        arrived = held<void>(),
        caller = new AbortController(),
        cancel = vi.fn();
      f.network.mockImplementationOnce(
        async () =>
          new Response(
            new ReadableStream(
              {
                pull() {
                  arrived.resolve();
                  return new Promise(() => {});
                },
                cancel,
              },
              { highWaterMark: 0 }
            ),
            { headers: { 'content-type': 'application/pdf' } }
          )
      );
      vi.useFakeTimers();
      let ended = false;
      const pending = f.run({ signal: caller.signal }).then(
        () => {
          throw Error('Late acquisition succeeded');
        },
        () => {
          ended = true;
        }
      );
      await arrived.promise;
      try {
        if (reason === 'scope') f.retire();
        else vi.setSystemTime(f.e.expiresAt);
        await vi.advanceTimersByTimeAsync(1001);
        expect(ended).toBe(true);
        expect(cancel).toHaveBeenCalledTimes(1);
      } finally {
        caller.abort();
        vi.useRealTimers();
        await pending;
      }
    }
  );
  it('caller cancellation settles even when an SDK metadata read never finishes', async () => {
    const f = await fixture(),
      wait = held<ReturnType<typeof f.readers.files.listTripFiles> extends Promise<infer T> ? T : never>(),
      caller = new AbortController();
    f.readers.files.listTripFiles.mockReturnValueOnce(wait.promise);
    let ended = false;
    const pending = f.run({ signal: caller.signal }).then(
      () => {
        throw Error('Late acquisition succeeded');
      },
      () => {
        ended = true;
      }
    );
    await vi.waitFor(() => expect(f.readers.files.listTripFiles).toHaveBeenCalledTimes(2));
    caller.abort();
    try {
      await vi.waitFor(() => expect(ended).toBe(true), { timeout: 300 });
    } finally {
      wait.resolve([f.row]);
      await pending;
    }
    expect(f.network).not.toHaveBeenCalled();
  });
});
describe('strict streamed private body', () => {
  const expected = { size_bytes: 3, mime_type: 'text/plain' };
  const read = (response: Response, options = {}) =>
    readPreparationFileBody({ response, expected, check: () => {}, ...options });
  it('reads split decoded chunks without blob() and permits normalized MIME parameters', async () => {
    const response = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([0, 255]));
          c.enqueue(new Uint8Array([128]));
          c.close();
        },
      }),
      { headers: { 'content-type': 'Text/Plain; charset=utf-8' } }
    );
    vi.spyOn(response, 'blob').mockRejectedValue(Error('Unbounded reader must not run'));
    expect(Array.from(new Uint8Array(await (await read(response)).arrayBuffer()))).toEqual([0, 255, 128]);
    expect(response.blob).not.toHaveBeenCalled();
  });
  it.each(['underflow', 'overflow', 'length', 'mime', 'malformed-length', 'null-body'])(
    'refuses %s bodies',
    async (reason) => {
      const response = new Response(
        reason === 'null-body' ? null : reason === 'underflow' ? 'ab' : reason === 'overflow' ? 'abcd' : 'abc',
        {
          headers: {
            'content-type': reason === 'mime' ? 'text/html' : 'text/plain',
            ...(reason === 'length'
              ? { 'content-length': '2' }
              : reason === 'malformed-length'
                ? { 'content-length': '03' }
                : {}),
          },
        }
      );
      await expect(read(response)).rejects.toThrow();
    }
  );
  it('cancels a stream immediately at the declared byte boundary instead of buffering the rest', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(4));
        },
        cancel,
      }),
      { headers: { 'content-type': 'text/plain' } }
    );
    await expect(read(response)).rejects.toMatchObject({ code: 'limit' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('settles cancellation while the producer never resolves another chunk', async () => {
    const arrived = held<void>(),
      cancel = vi.fn(),
      c = new AbortController();
    const response = new Response(
      new ReadableStream({
        pull() {
          arrived.resolve();
          return new Promise(() => {});
        },
        cancel,
      }),
      { headers: { 'content-type': 'text/plain' } }
    );
    const pending = read(response, { signal: c.signal }),
      rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await arrived.promise;
    c.abort();
    await rejection;
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('does not turn a retired scope during an awaited chunk into successful content', async () => {
    let ended = false,
      deliver!: () => void;
    const arrived = held<void>();
    const response = new Response(
      new ReadableStream({
        start(c) {
          deliver = () => {
            c.enqueue(new Uint8Array(3));
            c.close();
          };
        },
        pull() {
          arrived.resolve();
        },
      }),
      { headers: { 'content-type': 'text/plain' } }
    );
    const pending = read(response, {
      check: () => {
        if (ended) throw Error('Read retired');
      },
    });
    const rejection = expect(pending).rejects.toThrow('Read retired');
    await arrived.promise;
    ended = true;
    deliver();
    await rejection;
  });
  it('bounds decoded chunks independently of a compressed representation length', async () => {
    const response = new Response('abc', {
      headers: { 'content-type': 'text/plain', 'content-encoding': 'gzip', 'content-length': '23' },
    });
    expect(await (await read(response)).text()).toBe('abc');
    const overflow = new Response('abcd', {
      headers: { 'content-type': 'text/plain', 'content-encoding': 'gzip', 'content-length': '1' },
    });
    await expect(read(overflow)).rejects.toMatchObject({ code: 'limit' });
  });
  it('cancels rejected headers before consuming their body', async () => {
    const cancel = vi.fn(),
      response = new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'text/html' } });
    await expect(read(response)).rejects.toThrow();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('accepts a genuine zero-byte supported file without synthesizing bytes', async () => {
    const response = new Response('', { headers: { 'content-type': 'text/plain', 'content-length': '0' } });
    const result = await read(response, { expected: { ...expected, size_bytes: 0 } });
    expect(result.size).toBe(0);
  });
  it('rejects a mutated or over-limit expectation without reading bytes', async () => {
    await expect(
      readPreparationFileBody({
        response: new Response('abc'),
        expected: { ...expected, size_bytes: 52428801 },
        check: () => {},
      })
    ).rejects.toThrow();
  });
});
