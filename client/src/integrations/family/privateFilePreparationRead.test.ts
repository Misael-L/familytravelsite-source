import 'fake-indexeddb/auto';
import { Blob as NativeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { completeId, completeScope, completeTripData } from '../../../tests/helpers/familyCompleteTrip';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import * as nativeDatabase from '../../db/offlineDb';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { notifyPrivateSessionEnd } from '../../db/privateSessionEvents';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { clearSignedOut } from '../../utils/signedOut';
import { projectCompleteTrip } from './completeTripProjection';
import { serializeCompleteTrip } from './completeTripSnapshot';
import { FamilyIdentityRegistry } from './identity';
import { guardedPlannerCache, plannerCacheDb } from './plannerCache';
import { guardedPlannerRead } from './plannerReadGuard';
import { openPrivateFilePreparation } from './privateFilePreparationRead';
import { familyAuthStore, familyFrontend } from './repository';
const source = 'http://127.0.0.1:55331',
  s = completeScope;
const environment = vi.hoisted(() => ({ source: 'http://127.0.0.1:55331' }));
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
  const data = completeTripData(),
    city = {
      ...data.planner.view.state.locations[0],
      id: completeId(70),
      source: { kind: 'place' as const, id: completeId(7) },
      cover_media_id: null,
      source_type_label: 'City',
    };
  data.planner.view.state.locations.push(city);
  data.planner.view.state.destinations.push({
    source_place_id: completeId(7),
    location_id: city.id,
    legacy_category_id: null,
  });
  return guardedPlannerRead(
    captureReadSession(),
    { uuid: s.trip_id, native: nativeTrip },
    () => Error('Held'),
    async (guard) => {
      const cache = await guardedPlannerCache(guard, source, s, { now: Date.now, blocked: () => Error('Retired') });
      const envelope = await serializeCompleteTrip({
        source,
        scope: s,
        capturedAt: Date.now(),
        ownership: cache.completeOwnership(),
        data,
        admitReadOnly: true,
      });
      await cache.commitComplete(envelope);
      return envelope;
    }
  );
}
async function open() {
  const handle = await openPrivateFilePreparation(
    s.trip_id,
    familyFrontend,
    async () => new Response(new Uint8Array(31), { headers: { 'content-type': 'application/pdf' } })
  );
  handles.push(handle);
  return handle;
}
beforeEach(async () => {
  vi.stubGlobal('Blob', NativeBlob);
  environment.source = source;
  window.history.replaceState({}, '', '/trips/' + s.trip_id);
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
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
describe('online private-file memory admission', () => {
  it('checks actual stored ownership and the RLS header without publishing readiness or modifying the envelope', async () => {
    const before = await plannerCacheDb.completeSnapshots.toArray(),
      handle = await open();
    expect(familyFrontend.readers.trips.fetchTripById).toHaveBeenCalledWith(s.trip_id);
    // Real source-owned snapshot and native identities admit the explicit in-memory capture.
    const result = await handle.prepare('user-request', completeId(40));
    expect(result).toMatchObject({
      format: 'family.private-file-acquisition.v1',
      persisted: false,
      content: { bytes: 31 },
    });
    expect(await plannerCacheDb.completeSnapshots.toArray()).toEqual(before);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('uses the already authenticated database without invoking the offline-only selector', async () => {
    const cold = vi
      .spyOn(nativeDatabase, 'prepareSourceDatabaseRead')
      .mockRejectedValue(new Error('Cold-only selector'));
    const handle = await open();
    expect(cold).not.toHaveBeenCalled();
    handle.dispose();
  });
  it.each(['ordinary', 'alias', 'offline', 'native-account', 'pending-auth', 'draft', 'other-trip', 'wrong-database'])(
    'refuses %s admission before returning a handle',
    async (reason) => {
      if (reason === 'ordinary') vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', '');
      if (reason === 'alias') environment.source = 'http://localhost:55331';
      if (reason === 'offline') setForcedOffline(true);
      if (reason === 'native-account') useAuthStore.setState({ user: buildUser({ id: nativeUser + 1 }) });
      if (reason === 'pending-auth') familyAuthStore.setState({ authCheckFailed: true });
      if (reason === 'draft') familyFrontend.setLayer(s.trip_id, 'myDraft');
      if (reason === 'wrong-database') await reopenForUser(nativeUser + 1);
      if (reason === 'other-trip') useTripStore.setState({ trip: null });
      await expect(open()).rejects.toThrow();
    }
  );
  it('refuses a server header that is absent or belongs to another Family', async () => {
    vi.mocked(familyFrontend.readers.trips.fetchTripById).mockResolvedValueOnce(null);
    await expect(open()).rejects.toThrow();
    vi.mocked(familyFrontend.readers.trips.fetchTripById).mockResolvedValueOnce({
      ...headerRow(completeTripData().header),
      family_id: completeId(99),
    });
    await expect(open()).rejects.toThrow();
  });
  it.each(['trip', 'person', 'layer', 'sdk', 'offline', 'source'])(
    'does not revive a handle across %s replacement and return',
    async (reason) => {
      const handle = await open();
      if (reason === 'trip') {
        const trip = useTripStore.getState().trip;
        useTripStore.setState({ trip: null });
        useTripStore.setState({ trip });
      }
      if (reason === 'person') {
        familyAuthStore.setState({ personId: completeId(99) });
        familyAuthStore.setState({ personId: s.person_id });
      }
      if (reason === 'layer') {
        familyFrontend.setLayer(s.trip_id, 'myDraft');
        familyFrontend.setLayer(s.trip_id, 'published');
      }
      if (reason === 'sdk') notifyPrivateSessionEnd();
      if (reason === 'offline') {
        setForcedOffline(true);
        setForcedOffline(false);
      }
      if (reason === 'source') {
        environment.source = 'http://localhost:55331';
        await expect(handle.prepare('user-request', completeId(40))).rejects.toThrow();
        environment.source = source;
      }
      await expect(handle.prepare('user-request', completeId(40))).rejects.toThrow();
    }
  );
  it('refuses a replaced complete generation without editing or adopting it', async () => {
    const handle = await open();
    await stored();
    const replacement = await plannerCacheDb.completeSnapshots.toArray();
    await expect(handle.prepare('user-request', completeId(40))).rejects.toThrow();
    expect(await plannerCacheDb.completeSnapshots.toArray()).toEqual(replacement);
  });
  it('holds original import/File bytes and never turns their blocker into partial success', async () => {
    const handle = await open();
    const original = { jobId: 'component-original', fileName: 'keep.bin', blob: new Blob(['keep']), createdAt: 1 };
    await offlineDb.importFiles.put(original);
    await expect(handle.prepare('user-request', completeId(40))).rejects.toThrow();
    const retained = await offlineDb.importFiles.get(['component-original', 'keep.bin']);
    expect(retained).toMatchObject({
      jobId: original.jobId,
      fileName: original.fileName,
      createdAt: original.createdAt,
    });
    expect(await retained?.blob.text()).toBe('keep');
  });
  it('retains original expiry rather than renewing it when preparing private files', async () => {
    const handle = await open(),
      before = await plannerCacheDb.completeSnapshots.toArray();
    const e = before[0].value as { expiresAt: number };
    vi.spyOn(Date, 'now').mockReturnValue(e.expiresAt + 1);
    await expect(handle.prepare('user-request', completeId(40))).rejects.toThrow();
    expect(await plannerCacheDb.completeSnapshots.toArray()).toEqual(before);
  });
});
