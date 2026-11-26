import 'fake-indexeddb/auto';
import { Blob as NativeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixture from '../../../tests/browser/family-offline-lifecycle/variant-fixture.json';
import { buildUser } from '../../../tests/helpers/factories';
import { coherentTripData } from '../../../tests/helpers/familyCompleteTripV4';
import { nativeStayFixture } from '../../../tests/helpers/familyNativeStays';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { notifyPrivateSessionEnd } from '../../db/privateSessionEvents';
import { hasReadOnlySession } from '../../db/readOnlySession';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { clearSignedOut } from '../../utils/signedOut';
import { completeTripMedia } from './completeTripMedia';
import * as projection from './completeTripProjection';
import * as tripRead from './completeTripRead';
import * as tripV4 from './completeTripV4';
import { FamilyIdentityRegistry } from './identity';
import { createOfflineTripSession, currentOfflineTripSession } from './offlineTripSession';
import { guardedPlannerCache, plannerCacheDb } from './plannerCache';
import { guardedPlannerRead } from './plannerReadGuard';
import { openPreparationReadiness } from './preparationReadinessRead';
import { openPrivateFilePreparation } from './privateFilePreparationRead';
import { openPublicImagePreparation } from './publicImagePreparationRead';
import { createPublicVariantCache } from './publicVariantCache';
import * as variantImages from './publicVariantImages';
import { familyAuthStore, familyFrontend } from './repository';

const source = 'http://127.0.0.1:57171';
const environment = vi.hoisted(() => ({ source: 'http://127.0.0.1:57171' }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => environment.source }));
const core = nativeStayFixture().core,
  s = core.planner.scope;
const ids = new FamilyIdentityRegistry(s.user_id),
  nativeUser = ids.register('person', s.person_id),
  trip = ids.register('trip', s.trip_id);
const asset = 'f1100000-0000-4000-8000-000000000001';
const path = source + '/storage/v1/object/public/catalog/variants/v1/test/';
const bytes = Uint8Array.from(atob(fixture.base64), (c) => c.charCodeAt(0));
const originalFamily = familyAuthStore.getState();
const handles: Awaited<ReturnType<typeof openPublicImagePreparation>>[] = [];
const rows = new Map<string, Response>();
let quota = false;
const network = vi.fn<typeof fetch>();
function required<T>(v: T | null | undefined): T {
  if (v == null) throw Error('Missing fixture');
  return v;
}
const key = (v: RequestInfo | URL) => (typeof v === 'string' ? v : v instanceof URL ? v.href : v.url);
const cache = {
  match: async (v: RequestInfo | URL) => rows.get(key(v))?.clone(),
  put: async (v: RequestInfo | URL, r: Response) => {
    if (quota) throw Error('Synthetic quota');
    rows.set(key(v), r.clone());
  },
  delete: async (v: RequestInfo | URL) => rows.delete(key(v)),
  keys: async () => [...rows.keys()].map((v) => new Request(v)),
};
const storage = {
  has: async () => rows.size > 0,
  open: async () => cache,
  delete: async () => {
    rows.clear();
    return true;
  },
};
function data() {
  const native = nativeStayFixture(),
    d = coherentTripData(native.core);
  for (const location of [
    ...d.core.planner.state.locations,
    ...d.core.stays.map((v) => v.location),
    ...d.core.planner.state.visits.map((v) => v.location),
  ]) {
    if (location) location.cover_media_id = asset;
  }
  d.variants = [
    {
      mediaAssetId: asset,
      recipeVersion: 'v1',
      thumbUrl: path + 'thumb.webp',
      heroUrl: path + 'hero.webp',
      canonicalUrl: source + '/storage/v1/object/public/catalog/original.jpg',
    },
  ];
  return { ...d, native_stay_format: native.format };
}
async function stored(d = data()) {
  return guardedPlannerRead(
    captureReadSession(),
    { uuid: s.trip_id, native: trip },
    () => Error('Held'),
    async (guard) => {
      const c = await guardedPlannerCache(guard, source, s, { now: Date.now, blocked: () => Error('Retired') });
      const e = await tripV4.serializeCompleteTripV4({
        source,
        scope: s,
        capturedAt: Date.now(),
        verifiedAt: Date.now(),
        ownership: c.completeOwnership(),
        data: d,
      });
      await c.commitComplete(e);
      return e;
    }
  );
}
async function open() {
  const h = await openPublicImagePreparation(s.trip_id);
  handles.push(h);
  return h;
}
function cold() {
  setAuthed(false);
  familyAuthStore.setState({ authGate: null, authCheckFailed: true });
  useAuthStore.setState({ authCheckFailed: true });
  setForcedOffline(true);
}
beforeEach(async () => {
  environment.source = source;
  quota = false;
  rows.clear();
  handles.length = 0;
  vi.stubEnv('VITE_SUPABASE_URL', source);
  vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', 'local-native-v1');
  vi.stubGlobal('Blob', NativeBlob);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('caches', storage);
  vi.stubGlobal('createImageBitmap', async () => ({ width: fixture.width, height: fixture.height, close: () => {} }));
  vi.stubGlobal('fetch', network);
  network
    .mockReset()
    .mockImplementation(async () => new Response(bytes, { headers: { 'content-type': 'image/webp' } }));
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:v4-' + crypto.randomUUID();
      }
      static revokeObjectURL() {}
    }
  );
  _resetNetworkMode();
  clearSignedOut();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await reopenForUser(nativeUser);
  await resetOfflineTestDatabase();
  await Promise.all(plannerCacheDb.tables.map((t) => t.clear()));
  familyFrontend.clear();
  useTripStore.getState().resetTrip();
  window.history.replaceState({}, '', '/trips/' + s.trip_id);
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
    user: { username: 'fixture', email: 'v4@example.invalid', created_at: '2026-11-14T00:00:00Z', avatar_url: null },
  });
  const e = await stored(),
    p = await projection.projectCompleteTrip(e, () => {});
  useTripStore.setState({ trip: p.bundle.trip });
  vi.spyOn(familyFrontend.readers.trips, 'fetchTripById').mockResolvedValue({
    ...e.data.header,
    description: null,
    start_date: e.data.header.start_date ?? null,
    end_date: e.data.header.end_date ?? null,
    cover_image: null,
    is_archived: 0,
    reminder_days: 0,
  });
});
afterEach(async () => {
  currentOfflineTripSession()?.dispose();
  for (const h of handles) h.dispose();
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
it('prepares exact v4 public variants and cold reopens native lodging/arrival identities without rewriting the package', async () => {
  const before = await plannerCacheDb.completeSnapshots.toArray(),
    h = await open();
  expect(network).not.toHaveBeenCalled();
  const r = await h.prepare('user-request');
  expect(r).toMatchObject({
    status: 'complete',
    counts: { selected: 2, ready: 2, failed: 0 },
    generation: (before[0].value as { generation: string }).generation,
  });
  expect(network.mock.calls.map(([url]) => url)).toEqual([path + 'thumb.webp', path + 'hero.webp']);
  await h.prepare('user-request');
  expect(network).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(r)).not.toMatch(/confirmation_code|storage_path|session_id|original.jpg|render\/image/);
  expect(await plannerCacheDb.completeSnapshots.toArray()).toEqual(before);
  h.dispose();
  await plannerCacheDb.close();
  await plannerCacheDb.open();
  cold();
  const saved = await createOfflineTripSession(s.trip_id, () => {});
  await saved.load(s.trip_id);
  expect(useTripStore.getState().places.some((p) => p.image_url?.startsWith('blob:'))).toBe(true);
  const pair = required(saved.currentStays(trip));
  expect(pair.accommodations).toHaveLength(core.stays.length);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
  expect(network).toHaveBeenCalledTimes(2);
});
it('uses a readonly media-only view without copying private lodging, bookings or original-image URLs', async () => {
  const d = data(),
    e = await stored(d),
    before = JSON.stringify(e),
    m = completeTripMedia(e);
  expect(m.variants[0]).toMatchObject({ mediaAssetId: asset, thumbUrl: path + 'thumb.webp' });
  expect(Object.isFrozen(m.locations)).toBe(true);
  expect(Object.isFrozen(m.variants[0])).toBe(true);
  expect(JSON.stringify(m)).not.toMatch(/bookings|stays|notes|confirmation|original.jpg/);
  expect(JSON.stringify(e)).toBe(before);
});
it('keeps private files and whole-Trip readiness unavailable for v4', async () => {
  await expect(openPrivateFilePreparation(s.trip_id)).rejects.toThrow();
  await expect(openPreparationReadiness(s.trip_id)).rejects.toThrow();
  expect(network).not.toHaveBeenCalled();
});
it.each(['ordinary', 'alias', 'hosted', 'other-port'])(
  'refuses %s public preparation/cache admission before network',
  async (kind) => {
    if (kind === 'ordinary') vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', '');
    if (kind === 'alias') environment.source = 'http://localhost:57171';
    if (kind === 'hosted') environment.source = 'https://fixture.supabase.invalid';
    if (kind === 'other-port') environment.source = 'http://127.0.0.1:57172';
    await expect(open()).rejects.toThrow();
    expect(() => createPublicVariantCache({ source: environment.source })).toThrow();
    expect(network).not.toHaveBeenCalled();
  }
);
it.each(['missing', 'quota', 'http', 'bad-content'])(
  'reports actual partial %s instead of full readiness',
  async (kind) => {
    if (kind === 'missing') {
      const d = data();
      d.variants[0].heroUrl = null;
      await stored(d);
    }
    if (kind === 'quota') quota = true;
    if (kind === 'http') network.mockResolvedValueOnce(new Response('Denied', { status: 403 }));
    if (kind === 'bad-content')
      network.mockResolvedValueOnce(new Response('bad', { headers: { 'content-type': 'image/webp' } }));
    const r = await (await open()).prepare('user-request');
    expect(r.status).toBe('partial');
    expect(r.counts.ready).toBeLessThan(2);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  }
);
it.each(['saved data', 'image setup', 'projection', 'image disposal'] as const)(
  'closes the saved Trip read when %s fails before publication',
  async (phase) => {
    cold();
    const lease = await tripRead.openCoherentTripRead(s.trip_id);
    const close = vi.spyOn(lease, 'close');
    vi.spyOn(tripRead, 'openCoherentTripRead').mockResolvedValueOnce(lease);
    const failure = new Error('Synthetic setup failure');
    const disposed = vi.fn();

    if (phase === 'saved data') {
      vi.spyOn(tripV4, 'deriveCompleteTripV4').mockImplementationOnce(() => {
        throw failure;
      });
    } else if (phase === 'image setup') {
      vi.spyOn(variantImages, 'createPublicVariantImages').mockImplementationOnce(() => {
        throw failure;
      });
    } else {
      const images = variantImages.createPublicVariantImages(lease);
      const release = images.dispose;
      vi.spyOn(images, 'dispose').mockImplementationOnce(() => {
        release();
        disposed();
        if (phase === 'image disposal') throw new Error('Synthetic cleanup failure');
      });
      vi.spyOn(variantImages, 'createPublicVariantImages').mockReturnValueOnce(images);
      vi.spyOn(projection, 'projectCompleteTrip').mockRejectedValueOnce(failure);
    }

    await expect(createOfflineTripSession(s.trip_id, () => {})).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
    expect(lease.current()).toBe(false);
    expect(disposed).toHaveBeenCalledTimes(phase === 'projection' || phase === 'image disposal' ? 1 : 0);
    expect(currentOfflineTripSession()).toBeNull();
    expect(hasReadOnlySession()).toBe(false);
    expect(network).not.toHaveBeenCalled();
  }
);
it('shows placeholders after public-byte eviction without fetching or claiming file readiness', async () => {
  const h = await open();
  await h.prepare('user-request');
  h.dispose();
  rows.clear();
  cold();
  const saved = await createOfflineTripSession(s.trip_id, () => {});
  await saved.load(s.trip_id);
  expect(useTripStore.getState().places.every((p) => !p.image_url)).toBe(true);
  expect(network).toHaveBeenCalledTimes(2);
});
it.each(['trip', 'person', 'source', 'logout', 'expiry', 'generation', 'queue', 'draft'])(
  'retires original v4 preparation after %s change',
  async (kind) => {
    const h = await open();
    if (kind === 'trip') useTripStore.setState({ trip: null });
    if (kind === 'person') familyAuthStore.setState({ personId: crypto.randomUUID() });
    if (kind === 'source') environment.source = 'http://localhost:57171';
    if (kind === 'logout') notifyPrivateSessionEnd();
    if (kind === 'expiry') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 900001);
    if (kind === 'generation') await stored();
    if (kind === 'queue')
      await offlineDb.mutationQueue.put({
        id: crypto.randomUUID(),
        tripId: trip,
        url: '/trips/' + trip + '/places',
        method: 'POST',
        body: {},
        createdAt: Date.now(),
        attempts: 0,
        status: 'pending',
      } as never);
    if (kind === 'draft') familyFrontend.setLayer(s.trip_id, 'myDraft');
    await expect(h.prepare('user-request')).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  }
);
it('rejects a corrupt complete hash before a preparation handle or network request exists', async () => {
  const row = required((await plannerCacheDb.completeSnapshots.toArray())[0]);
  await plannerCacheDb.completeSnapshots.put({ ...row, value: { ...row.value, digest: '0'.repeat(64) } });
  await expect(open()).rejects.toThrow();
  expect(network).not.toHaveBeenCalled();
});
