import type { FamilyTripFile } from '@family/backend/supabase/tripFiles';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { Blob as NativeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTrip } from '../../../tests/helpers/factories';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { render as renderNative } from '../../../tests/helpers/render';
import { ReceiptPreviewModal } from '../../components/Budget/ReceiptPreviewModal';
import { AuthedImg } from '../../components/Files/FileManagerAuthedImg';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { useFilePreview } from '../../hooks/useFilePreview';
import { FilePreviewPane } from '../../mobile/screens/trip/tabs/MFilesBoard';
import { installFilePreviewPort, notifyFilePreviewRouteChange } from '../../repo/filePreview';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { setForcedOffline } from '../../sync/networkMode';
import type { TripFile } from '../../types';
import { createFamilyApplicationHandler } from './applicationHandler';
import { createFamilyFilePreviewPort, familyFileKey } from './filePreview';
import { FamilyApiError, FamilyFrontendRepository, familyReaders, type FamilySession } from './repository';
import { createFamilyFetch } from './transport';

const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = id(4),
  file = id(5),
  origin = window.location.origin;
const signed = 'https://storage.example.invalid/object/sign/trip-files/fixture.pdf?token=storage-token&download=';
function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function record(): FamilyTripFile {
  return {
    id: file,
    tripId: trip,
    storagePath: `${trip}/${file}/fixture.pdf`,
    originalName: 'fixture.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12,
    uploadedBy: id(2),
    starred: false,
    description: null,
    deletedAt: null,
    createdAt: '2026-11-09',
    links: [],
  };
}
async function fixture() {
  let session: FamilySession = {
    userId: id(1),
    personId: id(2),
    familyId: id(3),
    user: { username: 'Fixture', email: 'fixture@example.invalid', avatar_url: null, created_at: '2026-01-01' },
  };
  let source = 'https://source-a.invalid';
  const readers = {
    ...familyReaders,
    files: {
      ...familyReaders.files,
      listTripFiles: vi.fn(async () => [record()]),
      signedTripFileUrl: vi.fn(async () => signed),
    },
  };
  const repo = new FamilyFrontendRepository(
    async () => session,
    readers,
    () => ({ source, ...session })
  );
  const response = () => new Response('%PDF-fixture', { headers: { 'content-type': 'application/pdf' } });
  const network = vi.fn<typeof fetch>(async () => response());
  const port = createFamilyFilePreviewPort(repo, network, origin);
  stops.push(() => port.dispose());
  const row = (await repo.fileList(trip)).files[0];
  if (!row.url || !row.mime_type || !row.created_at || row.starred === null)
    throw new Error('The Family file view must supply a URL, MIME type, creation date and star state.');
  const native = {
    ...row,
    mime_type: row.mime_type,
    created_at: row.created_at,
    starred: row.starred,
    reservation_title: row.reservation_title ?? undefined,
  } satisfies TripFile;
  function retire(kind: string) {
    if (kind === 'source') source = 'https://source-b.invalid';
    else if (kind === 'layer') repo.setLayer(trip, 'myDraft');
    else if (kind === 'trip') repo.invalidate(trip);
    else if (kind === 'logout') invalidateOfflineSession();
    else {
      session = { ...session, [kind === 'user' ? 'userId' : kind === 'person' ? 'personId' : 'familyId']: id(90) };
      repo.acceptSession(session);
    }
  }
  return { repo, readers, network, port, native, url: native.url, response, retire };
}
const stops: (() => void)[] = [];
let made: Blob[];
beforeEach(async () => {
  setAuthed(true);
  setForcedOffline(false);
  invalidateOfflineSession();
  localStorage.clear();
  await resetOfflineTestDatabase();
  made = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    made.push(blob as Blob);
    return `blob:fixture-${made.length}`;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  for (const stop of stops.splice(0).reverse()) stop();
  setForcedOffline(false);
  setAuthed(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function cache(f: Awaited<ReturnType<typeof fixture>>, tripId = f.native.trip_id) {
  await offlineDb.trips.put(buildTrip({ id: f.native.trip_id }));
  await offlineDb.tripFiles.put(f.native);
  await offlineDb.blobCache.put({
    url: f.url,
    tripId,
    blob: new NativeBlob(['cached'], { type: 'application/pdf' }) as unknown as Blob,
    bytes: 6,
    mime: 'application/pdf',
    cachedAt: Date.now(),
  });
}
function Preview({ url, video = false }: { url: string; video?: boolean }) {
  const { src } = useFilePreview(url, { nativeRaw: video });
  return src ? <img alt="private fixture" src={src} /> : null;
}

describe('Family file preview through actual repository membership and browser leases', () => {
  it('uses the SDK signed URL intact, without native token acquisition or cookies', async () => {
    const f = await fixture(),
      lease = await f.port.acquire(`${f.native.url}?download=1`);
    expect(f.readers.files.listTripFiles).toHaveBeenCalledTimes(2);
    expect(f.readers.files.signedTripFileUrl).toHaveBeenCalledExactlyOnceWith(record().storagePath, 120);
    expect(f.network).toHaveBeenCalledExactlyOnceWith(
      signed,
      expect.objectContaining({ credentials: 'omit', redirect: 'error' })
    );
    expect(lease.url).toBe('blob:fixture-1');
    expect(lease.current()).toBe(true);
    expect(await made[0].text()).toBe('%PDF-fixture');
    lease.release();
    lease.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(lease.url);
    expect(lease.current()).toBe(false);
  });
  it.each([
    'https://other.invalid/api/family/files/1/open',
    '//other.invalid/api/family/files/1/open',
    signed,
    '/api/auth/resource-token',
    '/api/family/files/0/open',
    '/api/family/files/1/open/extra',
    '/uploads/a.pdf',
    'javascript:alert(1)',
  ])('rejects an untrusted or non-Family preview before signing: %s', async (value) => {
    const f = await fixture();
    await expect(f.port.acquire(value)).rejects.toBeDefined();
    expect(f.network).not.toHaveBeenCalled();
    expect(f.readers.files.signedTripFileUrl).not.toHaveBeenCalled();
  });
  it('accepts numeric and UUID identities but never treats an unknown UUID as membership', async () => {
    const f = await fixture();
    expect(familyFileKey(`${origin}${f.native.url}?a=1`, origin)).toBe(String(f.native.id));
    const lease = await f.port.acquire(`/api/family/files/${file}/open`);
    lease.release();
    await expect(f.port.acquire(`/api/family/files/${id(81)}/open`)).rejects.toMatchObject({
      code: 'file_unavailable',
    });
    expect(f.network).toHaveBeenCalledTimes(1);
  });
  it.each([
    { kind: 'missing', status: 404, code: 'file_unavailable' },
    { kind: 'trash', status: 404, code: 'file_unavailable' },
    { kind: 'other-trip', status: 404, code: 'file_unavailable' },
    { kind: 'denied', status: 403, code: 'denied' },
  ])('refuses $kind membership without signing or cache fallback', async ({ kind, status, code }) => {
    const f = await fixture();
    await cache(f);
    if (kind === 'denied')
      f.readers.files.listTripFiles.mockRejectedValueOnce(new FamilyApiError(403, 'denied', 'Denied'));
    else if (kind === 'missing') f.readers.files.listTripFiles.mockResolvedValueOnce([]);
    else
      f.readers.files.listTripFiles.mockResolvedValueOnce([
        { ...record(), ...(kind === 'trash' ? { deletedAt: '2026-11-09' } : { tripId: id(92) }) },
      ]);
    await expect(f.port.acquire(f.url)).rejects.toMatchObject({ status, code });
    expect(f.readers.files.signedTripFileUrl).not.toHaveBeenCalled();
    expect(f.network).not.toHaveBeenCalled();
    expect(made).toHaveLength(0);
  });
  it.each([401, 403, 404, 500])('does not mask an actual HTTP %i with cached private bytes', async (status) => {
    const f = await fixture();
    await cache(f);
    f.network.mockResolvedValueOnce(new Response(null, { status }));
    await expect(f.port.acquire(f.url)).rejects.toMatchObject({ status });
    expect(made).toHaveLength(0);
  });
  it.each(['membership', 'signing', 'headers', 'body'])(
    'refuses a %s response after original account retirement',
    async (phase) => {
      const f = await fixture(),
        wait = held<void>(),
        reached = vi.fn();
      if (phase === 'membership')
        f.readers.files.listTripFiles.mockImplementationOnce(async () => {
          reached();
          await wait.promise;
          return [record()];
        });
      else if (phase === 'signing')
        f.readers.files.signedTripFileUrl.mockImplementationOnce(async () => {
          reached();
          await wait.promise;
          return signed;
        });
      else if (phase === 'headers')
        f.network.mockImplementationOnce(async () => {
          reached();
          await wait.promise;
          return f.response();
        });
      else {
        const response = f.response();
        vi.spyOn(response, 'blob').mockImplementationOnce(async () => {
          reached();
          await wait.promise;
          return new NativeBlob(['late']) as unknown as Blob;
        });
        f.network.mockResolvedValueOnce(response);
      }
      const pending = f.port.acquire(f.url),
        rejected = expect(pending).rejects.toBeDefined();
      await waitFor(() => expect(reached).toHaveBeenCalledTimes(1));
      f.retire('user');
      wait.resolve();
      await rejected;
      expect(made).toHaveLength(0);
    }
  );
  it.each(['user', 'person', 'family', 'source', 'layer', 'trip', 'logout'])(
    'retires a lease when its %s changes',
    async (kind) => {
      const f = await fixture(),
        lease = await f.port.acquire(f.url);
      f.retire(kind);
      expect(lease.current()).toBe(false);
      // A source change is detected synchronously by the lease context check.
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(lease.url);
    }
  );
  it('cancels an explicit preview request before headers can create an object URL', async () => {
    const f = await fixture(),
      wait = held<Response>(),
      controller = new AbortController();
    f.network.mockReturnValueOnce(wait.promise);
    const pending = f.port.acquire(f.url, controller.signal),
      rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await waitFor(() => expect(f.network).toHaveBeenCalled());
    controller.abort();
    expect(f.network.mock.calls[0][1]?.signal?.aborted).toBe(true);
    wait.resolve(f.response());
    await rejected;
    expect(made).toHaveLength(0);
  });
  it('aborts and revokes on provider disposal; disposed providers cannot restart', async () => {
    const f = await fixture(),
      lease = await f.port.acquire(f.url);
    f.port.dispose();
    expect(lease.current()).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(lease.url);
    await expect(f.port.acquire(f.url)).rejects.toBeDefined();
  });
  it.each([undefined, -1, 987])('offline requires explicit cached ownership, rejects tripId=%s', async (tripId) => {
    const f = await fixture();
    await cache(f, tripId ?? -1);
    setForcedOffline(true);
    await expect(f.port.acquire(f.url)).rejects.toBeDefined();
    expect(f.network).not.toHaveBeenCalled();
  });
  it('offline opens only matching cached bytes and supports the canonical UUID alias', async () => {
    const f = await fixture();
    await cache(f);
    setForcedOffline(true);
    const lease = await f.port.acquire(`/api/family/files/${file}/open`);
    expect(await made[0].text()).toBe('cached');
    expect(f.network).not.toHaveBeenCalled();
    expect(f.readers.files.signedTripFileUrl).not.toHaveBeenCalled();
    lease.release();
  });
  it.each(['file', 'trip'])('offline refuses a missing cached %s', async (missing) => {
    const f = await fixture();
    await cache(f);
    if (missing === 'file') await offlineDb.tripFiles.clear();
    else await offlineDb.trips.clear();
    setForcedOffline(true);
    await expect(f.port.acquire(f.url)).rejects.toBeDefined();
    expect(made).toHaveLength(0);
  });
  it('enforces the existing per-file byte limit before dispatch', async () => {
    const f = await fixture();
    f.readers.files.listTripFiles.mockResolvedValueOnce([{ ...record(), sizeBytes: 51 * 1024 * 1024 }]);
    await expect(f.port.acquire(f.url)).rejects.toBeDefined();
    expect(f.network).not.toHaveBeenCalled();
  });
  it('keeps actual fetch-handler body delivery bound to the original trip', async () => {
    const f = await fixture(),
      response = f.response(),
      body = held<Blob>();
    vi.spyOn(response, 'blob').mockReturnValueOnce(body.promise);
    vi.stubGlobal('fetch', f.network);
    f.network.mockResolvedValueOnce(response);
    const request = createFamilyFetch(createFamilyApplicationHandler(f.repo), f.network, origin);
    const pending = request(f.url);
    await waitFor(() => expect(response.blob).toHaveBeenCalled());
    f.retire('layer');
    body.resolve(new NativeBlob(['late']) as unknown as Blob);
    const result = await pending;
    expect(result.status).toBe(409);
    expect(await result.text()).not.toContain('late');
  });
  it('rechecks file membership and requests a fresh signature on retry after a failed open', async () => {
    const f = await fixture();
    vi.stubGlobal('fetch', f.network);
    const request = createFamilyFetch(createFamilyApplicationHandler(f.repo), f.network, origin);
    f.readers.files.signedTripFileUrl.mockRejectedValueOnce(new Error('Signing unavailable'));

    const refused = await request(f.url);
    expect(refused.status).toBe(503);
    expect(f.network).not.toHaveBeenCalled();

    const retried = await request(f.url);
    expect(retried.status).toBe(200);
    expect(await retried.text()).toBe('%PDF-fixture');
    expect(f.readers.files.listTripFiles).toHaveBeenCalledTimes(3);
    expect(f.readers.files.signedTripFileUrl.mock.calls).toEqual([
      [record().storagePath, 120],
      [record().storagePath, 120],
    ]);
    expect(f.network).toHaveBeenCalledExactlyOnceWith(
      signed,
      expect.objectContaining({ credentials: 'omit', redirect: 'error' })
    );
  });

  it.each(['native', 'canonical'])('actual fetch-handler opens an authorized file via its %s ID', async (kind) => {
    const f = await fixture();
    vi.stubGlobal('fetch', f.network);
    const request = createFamilyFetch(createFamilyApplicationHandler(f.repo), f.network, origin);
    const result = await request(kind === 'native' ? f.url : `/api/family/files/${file}/open`);
    expect(result.status, await result.clone().text()).toBe(200);
    expect(result.headers.get('content-type')).toBe('application/pdf');
    expect(await result.text()).toBe('%PDF-fixture');
    expect(f.network).toHaveBeenCalledExactlyOnceWith(signed, expect.anything());
  });
  it.each([
    ['POST', `/api/family/files/${file}/open`],
    ['HEAD', `/api/family/files/${file}/open`],
    ['GET', '/api/family/files//open'],
    ['GET', `/api/family/files/${file}/open/extra`],
  ])('actual fetch-handler refuses %s %s before looking up a file', async (method, url) => {
    const f = await fixture();
    vi.stubGlobal('fetch', f.network);
    const request = createFamilyFetch(createFamilyApplicationHandler(f.repo), f.network, origin);
    const result = await request(url, { method });
    expect(result.status).toBe(501);
    expect(await result.json()).toMatchObject({ code: 'adapter_not_connected' });
    expect(f.readers.files.listTripFiles).toHaveBeenCalledTimes(1);
    expect(f.readers.files.signedTripFileUrl).not.toHaveBeenCalled();
    expect(f.network).not.toHaveBeenCalled();
  });
  it.each([
    { ...record(), deletedAt: '2026-11-09' },
    { ...record(), tripId: id(92) },
  ])(
    'actual fetch-handler refuses an observed file after it is trashed or moved ($tripId, $deletedAt)',
    async (row) => {
      const f = await fixture();
      f.readers.files.listTripFiles.mockResolvedValueOnce([row]);
      vi.stubGlobal('fetch', f.network);
      const request = createFamilyFetch(createFamilyApplicationHandler(f.repo), f.network, origin);
      const result = await request(f.url);
      expect(result.status).toBe(404);
      expect(await result.json()).toMatchObject({ code: 'file_unavailable' });
      expect(f.readers.files.signedTripFileUrl).not.toHaveBeenCalled();
      expect(f.network).not.toHaveBeenCalled();
    }
  );
  it('native hook releases Family URLs immediately when the source changes or unmounts', async () => {
    const f = await fixture();
    stops.push(installFilePreviewPort(f.port));
    const view = render(<AuthedImg src={f.url} />);
    await screen.findByRole('presentation');
    const old = screen.getByRole('presentation').getAttribute('src');
    const wait = held<Response>();
    f.network.mockReturnValueOnce(wait.promise);
    view.rerender(<AuthedImg src={`${f.native.url}?revision=2`} />);
    expect(screen.queryByRole('presentation')).toBeNull();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith(old));
    await act(async () => {
      wait.resolve(f.response());
    });
    await screen.findByRole('presentation');
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
  it('a Family video preview also acquires authorized bytes instead of bypassing the bridge', async () => {
    const f = await fixture();
    stops.push(installFilePreviewPort(f.port));
    render(<Preview url={f.url} video />);
    await screen.findByRole('img');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:fixture-1');
    expect(f.network).toHaveBeenCalledExactlyOnceWith(signed, expect.anything());
    act(() => f.retire('logout'));
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('the actual receipt PDF consumer uses a leased byte URL and clears it on trip invalidation', async () => {
    const f = await fixture();
    stops.push(installFilePreviewPort(f.port));
    renderNative(<ReceiptPreviewModal receipts={[f.native]} onClose={() => {}} />);
    await waitFor(() =>
      expect(document.querySelector('object')?.getAttribute('data')).toBe('blob:fixture-1#view=FitH')
    );
    act(() => f.retire('trip'));
    expect(document.querySelector('object')?.getAttribute('data') ?? '').not.toContain('blob:fixture-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture-1');
  });
  it('the actual phone/tablet file pane obtains Family bytes through the same lease', async () => {
    const f = await fixture();
    stops.push(installFilePreviewPort(f.port));
    const image = { ...f.native, mime_type: 'image/png' };
    renderNative(
      <FilePreviewPane
        file={image}
        planner={buildPlanner()}
        onOpen={() => {}}
        onStar={() => {}}
        onLinks={() => {}}
        onMenu={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:fixture-1'));
    act(() => f.retire('logout'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture-1');
  });
  it('a trip navigation releases the lease without rebinding the old file props', async () => {
    const f = await fixture();
    stops.push(installFilePreviewPort(f.port));
    const old = useTripStore.getState().trip;
    render(<Preview url={f.url} />);
    await screen.findByRole('img');
    act(() => useTripStore.setState({ trip: buildTrip({ id: 9999 }) }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture-1');
    expect(f.network).toHaveBeenCalledTimes(1);
    cleanup();
    useTripStore.setState({ trip: old });
  });
  it('captures the file trip before the first membership await', async () => {
    const f = await fixture();
    const pending = f.repo.observeFile(f.native.id);
    const rejected = expect(pending).rejects.toMatchObject({ status: 409 });
    f.retire('layer');
    await rejected;
    expect(f.readers.files.signedTripFileUrl).not.toHaveBeenCalled();
  });
  it('a saved-preview route change retries the same original selection without changing native props', async () => {
    const f = await fixture();
    stops.push(installFilePreviewPort(f.port));
    f.network.mockRejectedValueOnce(Error('Unavailable before route publication'));
    render(<Preview url={f.url} />);
    await waitFor(() => expect(f.network).toHaveBeenCalledTimes(1));
    await act(async () => notifyFilePreviewRouteChange());
    await screen.findByRole('img');
    expect(f.network).toHaveBeenCalledTimes(2);
  });
  it('a route notification cannot rebind old file props after original account retirement', async () => {
    const f = await fixture();
    stops.push(installFilePreviewPort(f.port));
    render(<Preview url={f.url} />);
    await screen.findByRole('img');
    const before = f.network.mock.calls.length;
    act(() => f.retire('user'));
    act(() => notifyFilePreviewRouteChange());
    expect(screen.queryByRole('img')).toBeNull();
    expect(f.network).toHaveBeenCalledTimes(before);
  });
});
