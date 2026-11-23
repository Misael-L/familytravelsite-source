import 'fake-indexeddb/auto';
import { Blob as NativeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../tests/browser/family-offline-lifecycle/variant-fixture.json';
import { buildUser } from '../../../tests/helpers/factories';
import { completeId, completeTripData } from '../../../tests/helpers/familyCompleteTrip';
import { coherentTripData } from '../../../tests/helpers/familyCompleteTripV4';
import { nativeStayFixture } from '../../../tests/helpers/familyNativeStays';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { notifyPrivateSessionEnd } from '../../db/privateSessionEvents';
import { installFilePreviewPort } from '../../repo/filePreview';
import {
  currentPreparedFilePool,
  currentSavedFilePreview,
  installSavedFilePreview,
} from '../../repo/preparedFilePreview';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { clearSignedOut } from '../../utils/signedOut';
import { projectCompleteTrip } from './completeTripProjection';
import { serializeCompleteTripV4 } from './completeTripV4';
import { createFamilyFilePreviewPort } from './filePreview';
import { FamilyIdentityRegistry } from './identity';
import { createOfflineTripSession, currentOfflineTripSession } from './offlineTripSession';
import { guardedPlannerCache, plannerCacheDb } from './plannerCache';
import { guardedPlannerRead } from './plannerReadGuard';
import { openPreparationReadiness } from './preparationReadinessRead';
import { openPrivateFilePreparation } from './privateFilePreparationRead';
import { familyAuthStore, familyFrontend } from './repository';
const bytes = Uint8Array.from(atob(fixture.base64), (c) => c.charCodeAt(0));
const network = vi.fn<typeof fetch>();
const source = 'http://127.0.0.1:57171',
  s = nativeStayFixture().core.planner.scope;
const environment = vi.hoisted(() => ({ source: 'http://127.0.0.1:57171' }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => environment.source }));
const ids = new FamilyIdentityRegistry(s.user_id),
  nativeUser = ids.register('person', s.person_id),
  nativeTrip = ids.register('trip', s.trip_id);
const originalFamily = familyAuthStore.getState();
const handles: Awaited<ReturnType<typeof openPrivateFilePreparation>>[] = [];
function headerRow(h: ReturnType<typeof completeTripData>['header']) {
  return {
    ...h,
    description: h.description ?? null,
    start_date: h.start_date ?? null,
    end_date: h.end_date ?? null,
    cover_image: h.cover_image ?? null,
    is_archived: h.is_archived ?? 0,
    reminder_days: h.reminder_days ?? 0,
  };
}
async function stored() {
  const native = nativeStayFixture(),
    data = { ...coherentTripData(native.core), native_stay_format: native.format };
  const f = data.companions.files[0];
  f.size_bytes = bytes.length;
  f.mime_type = 'image/webp';
  return guardedPlannerRead(
    captureReadSession(),
    { uuid: s.trip_id, native: nativeTrip },
    () => Error('Held'),
    async (guard) => {
      const cache = await guardedPlannerCache(guard, source, s, { now: Date.now, blocked: () => Error('Retired') });
      const envelope = await serializeCompleteTripV4({
        source,
        scope: s,
        capturedAt: Date.now(),
        ownership: cache.completeOwnership(),
        data,
        verifiedAt: Date.now(),
      });
      await cache.commitComplete(envelope);
      return envelope;
    }
  );
}
async function open() {
  const handle = await openPrivateFilePreparation(s.trip_id, familyFrontend, network);
  handles.push(handle);
  return handle;
}
beforeEach(async () => {
  vi.stubGlobal('Blob', NativeBlob);
  environment.source = source;
  window.history.replaceState({}, '', '/trips/' + s.trip_id);
  vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', 'local-native-v1');
  vi.stubEnv('VITE_FAMILY_PRIVATE_FILE_QUALIFICATION', 'local-v4');
  network
    .mockReset()
    .mockImplementation(async () => new Response(bytes, { headers: { 'content-type': 'image/webp' } }));
  vi.stubEnv('VITE_SUPABASE_URL', source);
  _resetNetworkMode();
  clearSignedOut();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  await reopenForUser(nativeUser);
  await resetOfflineTestDatabase();
  await Promise.all(plannerCacheDb.tables.map((t) => t.clear()));
  useTripStore.getState().resetTrip();
  familyFrontend.clear();
  familyAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    authCheckFailed: false,
    authGate: 'ok',
    authUserId: s.user_id,
    personId: s.person_id,
    familyId: s.family_id,
  });
  useAuthStore.setState({
    user: buildUser({ id: nativeUser }),
    isAuthenticated: true,
    isLoading: false,
    authCheckFailed: false,
    loggingOut: false,
  });
  familyFrontend.acceptSession({
    userId: s.user_id,
    personId: s.person_id,
    familyId: s.family_id,
    user: {
      username: 'fixture',
      email: 'fixture@example.invalid',
      created_at: '2026-11-11T00:00:00Z',
      avatar_url: null,
    },
  });
  const e = await stored(),
    projection = await projectCompleteTrip(e, () => {});
  useTripStore.setState({ trip: projection.bundle.trip });
  vi.spyOn(familyFrontend.readers.trips, 'fetchTripById').mockResolvedValue(headerRow(e.data.header));
  const f = e.data.companions.files[0];
  vi.spyOn(familyFrontend.readers.files, 'listTripFiles').mockResolvedValue([
    {
      id: f.id,
      tripId: f.trip_id,
      storagePath: f.storage_path,
      originalName: f.original_name,
      mimeType: f.mime_type,
      sizeBytes: f.size_bytes,
      uploadedBy: f.uploaded_by,
      starred: f.starred,
      description: f.description,
      deletedAt: null,
      createdAt: f.created_at,
      links: [],
    },
  ]);
  vi.spyOn(familyFrontend.readers.files, 'signedTripFileUrl').mockResolvedValue(
    source + '/storage/v1/object/sign/trip-files/' + f.storage_path + '?token=unit-signature'
  );
});
afterEach(async () => {
  currentOfflineTripSession()?.dispose();
  for (const handle of handles) handle.dispose();
  handles.length = 0;
  familyFrontend.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  _resetNetworkMode();
  setAuthed(false);
  familyAuthStore.setState(originalFamily, true);
  useTripStore.getState().resetTrip();
  await resetOfflineTestDatabase();
  await reopenAnonymous();
});

describe('v4 private-file RAM admission and native saved consumption', () => {
  it('acquires once on explicit intent, keeps the original v4 envelope and leaves durable stores empty', async () => {
    const before = await plannerCacheDb.completeSnapshots.toArray(),
      h = await open();
    expect(network).not.toHaveBeenCalled();
    const r = await h.prepare('user-request', completeId(40));
    expect(r).toMatchObject({
      format: 'family.private-file-acquisition.v1',
      persisted: false,
      content: { bytes: bytes.length },
    });
    expect(await h.prepare('user-request', completeId(40))).toEqual(r);
    expect(network).toHaveBeenCalledTimes(1);
    expect(familyFrontend.readers.files.signedTripFileUrl).toHaveBeenCalledWith(expect.any(String), 120);
    expect(await plannerCacheDb.completeSnapshots.toArray()).toEqual(before);
    expect(await offlineDb.blobCache.count()).toBe(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    await expect(openPreparationReadiness(s.trip_id)).rejects.toThrow();
  });
  it('consumes warm RAM through the v4 saved native provider; disposal/cold read cannot fall back or download', async () => {
    const h = await open();
    await h.prepare('user-request', completeId(40));
    setForcedOffline(true);
    const saved = await createOfflineTripSession(s.trip_id, () => {});
    await saved.load(s.trip_id);
    const port = currentSavedFilePreview();
    expect(port).not.toBeNull();
    if (!port) throw Error('Saved provider missing');
    const lease = await port.acquire('/api/family/files/' + completeId(40) + '/open');
    expect(lease.url).toMatch(/^blob:/);
    expect(lease.current()).toBe(true);
    const body = await fetch(lease.url);
    expect(new Uint8Array(await body.arrayBuffer())).toEqual(bytes);
    h.dispose();
    expect(lease.current()).toBe(false);
    await expect(port.acquire('/api/family/files/' + completeId(40) + '/open')).rejects.toThrow();
    saved.dispose();
    const cold = await createOfflineTripSession(s.trip_id, () => {});
    await cold.load(s.trip_id);
    await expect(currentSavedFilePreview()?.acquire('/api/family/files/' + completeId(40) + '/open')).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(1);
    expect(await offlineDb.blobCache.count()).toBe(0);
  });
  it('refuses an early native offline cache miss without retiring RAM before the saved owner opens', async () => {
    const reset = installSavedFilePreview({
      acquire: async () => {
        throw Error('No saved owner');
      },
      dispose: () => {},
    });
    reset();
    const port = createFamilyFilePreviewPort(familyFrontend, network, window.location.origin);
    const release = installFilePreviewPort(port);
    try {
      const h = await open();
      await h.prepare('user-request', completeId(40));
      setForcedOffline(true);
      await expect(port.acquire('/api/family/files/' + completeId(40) + '/open')).rejects.toThrow();
      expect(currentPreparedFilePool()).not.toBeNull();
      await expect
        .poll(async () => {
          try {
            const lease = await port.acquire('/api/family/files/' + completeId(40) + '/open');
            lease.release();
            return true;
          } catch {
            return false;
          }
        })
        .toBe(true);
      const lease = await port.acquire('/api/family/files/' + completeId(40) + '/open');
      expect(new Uint8Array(await (await fetch(lease.url)).arrayBuffer())).toEqual(bytes);
      lease.release();
      expect(network).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
  });
  it.each([
    'public-only',
    'wrong-marker',
    'no-native-marker',
    'alias',
    'hosted',
    'other-port',
    'draft',
    'wrong-account',
    'absent-header',
  ])('refuses %s before signing or bytes', async (reason) => {
    if (reason === 'public-only') vi.stubEnv('VITE_FAMILY_PRIVATE_FILE_QUALIFICATION', '');
    if (reason === 'wrong-marker') vi.stubEnv('VITE_FAMILY_PRIVATE_FILE_QUALIFICATION', 'local-v3');
    if (reason === 'no-native-marker') vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', '');
    if (reason === 'alias') environment.source = 'http://localhost:57171';
    if (reason === 'hosted') environment.source = 'https://example.supabase.invalid';
    if (reason === 'other-port') environment.source = 'http://127.0.0.1:57172';
    if (reason === 'draft') familyFrontend.setLayer(s.trip_id, 'myDraft');
    if (reason === 'wrong-account') useAuthStore.setState({ user: buildUser({ id: nativeUser + 1 }) });
    if (reason === 'absent-header') vi.mocked(familyFrontend.readers.trips.fetchTripById).mockResolvedValueOnce(null);
    await expect(open()).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
    expect(familyFrontend.readers.files.signedTripFileUrl).not.toHaveBeenCalled();
  });
  it.each(['path', 'deleted', 'mime', 'size', 'denied'])(
    'refuses refreshed %s and drops older ready bytes',
    async (kind) => {
      const h = await open();
      await h.prepare('user-request', completeId(40));
      const rows = await familyFrontend.readers.files.listTripFiles(s.trip_id),
        f = rows[0];
      if (kind === 'path') f.storagePath = 'changed/file.webp';
      if (kind === 'deleted') f.deletedAt = '2026-11-14T00:00:00Z';
      if (kind === 'mime') f.mimeType = 'application/pdf';
      if (kind === 'size') f.sizeBytes++;
      if (kind === 'denied') network.mockResolvedValueOnce(new Response(null, { status: 403 }));
      vi.mocked(familyFrontend.readers.files.listTripFiles).mockResolvedValue(rows);
      await expect(h.prepare('user-request', completeId(40), { refresh: true })).rejects.toThrow();
      setForcedOffline(true);
      const saved = await createOfflineTripSession(s.trip_id, () => {});
      await saved.load(s.trip_id);
      await expect(
        currentSavedFilePreview()?.acquire('/api/family/files/' + completeId(40) + '/open')
      ).rejects.toThrow();
    }
  );
  it.each(['generation', 'trip-ABA', 'person-ABA', 'logout', 'expiry', 'queue', 'original-file'])(
    'retains original ownership and refuses %s replacement',
    async (kind) => {
      const h = await open();
      if (kind === 'generation') await stored();
      if (kind === 'trip-ABA') {
        const trip = useTripStore.getState().trip;
        useTripStore.setState({ trip: null });
        useTripStore.setState({ trip });
      }
      if (kind === 'person-ABA') {
        familyAuthStore.setState({ personId: completeId(99) });
        familyAuthStore.setState({ personId: s.person_id });
      }
      if (kind === 'logout') notifyPrivateSessionEnd();
      if (kind === 'expiry') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 900001);
      if (kind === 'queue')
        await offlineDb.mutationQueue.put({
          id: crypto.randomUUID(),
          tripId: nativeTrip,
          url: '/trips/' + nativeTrip + '/places',
          method: 'POST',
          body: {},
          createdAt: Date.now(),
          attempts: 0,
          status: 'pending',
        } as never);
      if (kind === 'original-file')
        await offlineDb.importFiles.put({
          jobId: 'unadopted',
          fileName: 'keep.bin',
          blob: new Blob(['keep']),
          createdAt: 1,
        });
      await expect(h.prepare('user-request', completeId(40))).rejects.toThrow();
      expect(network).not.toHaveBeenCalled();
      if (kind === 'original-file')
        expect(await (await offlineDb.importFiles.get(['unadopted', 'keep.bin']))?.blob.text()).toBe('keep');
      if (kind === 'queue') expect(await offlineDb.mutationQueue.count()).toBe(1);
    }
  );
});
