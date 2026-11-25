import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { completeId, completeScope, completeTripData } from '../../../tests/helpers/familyCompleteTrip';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { offlineDb, reopenAnonymous, reopenForUser, type QueuedMutation } from '../../db/offlineDb';
import { hasReadOnlySession } from '../../db/readOnlySession';
import { budgetRepo } from '../../repo/budgetRepo';
import { installPlannerReadPort } from '../../repo/plannerReadPort';
import { tripMembersRepo } from '../../repo/tripMembersRepo';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { isAuthed, setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { captureWriteSession } from '../../sync/writeSession';
import { clearSignedOut } from '../../utils/signedOut';
import { offlineTripIdentity, openCompleteTripRead } from './completeTripRead';
import { serializeCompleteTrip } from './completeTripSnapshot';
import { FamilyIdentityRegistry } from './identity';
import { offlineTripQualificationEnabled } from './offlineTripQualification';
import { withOfflineTripReads } from './offlineTripReadPort';
import { createOfflineTripSession, currentOfflineTripSession, offlineTripRequest } from './offlineTripSession';
import * as plannerCacheModule from './plannerCache';
import { guardedPlannerCache, plannerCacheDb, retirePlannerCacheOwners } from './plannerCache';
import { guardedPlannerRead } from './plannerReadGuard';
import { familyAuthStore } from './repository';
const source = 'http://127.0.0.1:55331';
const environment = vi.hoisted(() => ({ source: 'http://127.0.0.1:55331' }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => environment.source }));
const s = completeScope,
  ids = new FamilyIdentityRegistry(s.user_id),
  nativeUser = ids.register('person', s.person_id),
  tripKey = ids.register('trip', s.trip_id);
const originalFamily = familyAuthStore.getState();
function data() {
  const d = completeTripData();
  const city = {
    ...d.planner.view.state.locations[0],
    id: completeId(70),
    name: 'Puebla',
    description: 'City context',
    notes: null,
    source: { kind: 'place' as const, id: completeId(7) },
    cover_media_id: null,
    source_type_label: 'City',
  };
  d.planner.view.state.locations.push(city);
  d.planner.view.state.destinations.push({
    source_place_id: completeId(7),
    location_id: city.id,
    legacy_category_id: null,
  });
  return d;
}
async function stored(v2 = true) {
  const d = data();
  return guardedPlannerRead(
    captureReadSession(),
    { uuid: s.trip_id, native: tripKey },
    () => new Error('Original work held'),
    async (guard) => {
      const c = await guardedPlannerCache(guard, source, s, { now: Date.now, blocked: () => new Error('Retired') });
      const e = await serializeCompleteTrip({
        source,
        scope: s,
        capturedAt: Date.now(),
        ownership: c.completeOwnership(),
        data: d,
        admitReadOnly: v2,
      });
      await c.commitComplete(e);
      return e;
    }
  );
}
function cold() {
  setAuthed(false);
  familyAuthStore.setState({ authGate: null, authCheckFailed: true });
  useAuthStore.setState({ authCheckFailed: true });
  setForcedOffline(true);
}
const request = (suffix = '', method = 'GET') => ({
  method,
  pathname: '/trips/' + s.trip_id + suffix,
  query: new URLSearchParams(),
  body: undefined,
});
beforeEach(async () => {
  environment.source = source;
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
  vi.stubEnv('VITE_SUPABASE_URL', source);
  _resetNetworkMode();
  clearSignedOut();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  setAuthed(true);
  await reopenForUser(nativeUser);
  await resetOfflineTestDatabase();
  await Promise.all(plannerCacheDb.tables.map((t) => t.clear()));
  useTripStore.getState().resetTrip();
  useAuthStore.setState({
    user: buildUser({ id: nativeUser }),
    isAuthenticated: true,
    isLoading: false,
    authCheckFailed: false,
    loggingOut: false,
  });
  familyAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    authUserId: s.user_id,
    familyId: s.family_id,
    personId: s.person_id,
    authGate: 'ok',
    authCheckFailed: false,
  });
});
afterEach(async () => {
  currentOfflineTripSession()?.dispose();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  _resetNetworkMode();
  setAuthed(false);
  familyAuthStore.setState(originalFamily, true);
  await resetOfflineTestDatabase();
  await reopenAnonymous();
});
describe('recent read-only Trip admission', () => {
  it('selects one v2 generation and projects the actual supported native data without inventing current access', async () => {
    const e = await stored();
    cold();
    const session = await createOfflineTripSession(s.trip_id, () => {});
    await session.load(s.trip_id);
    expect(useTripStore.getState().trip?.id).toBe(tripKey);
    expect(useTripStore.getState().places).toHaveLength(2);
    expect(useTripStore.getState().days).toHaveLength(2);
    expect(session.bundle.reservations[0].family_booking_snapshot).toEqual(e.data.booking.bookings[0]);
    expect(session.bundle.files[0].linked_place_ids).toEqual([ids.register('place', completeId(70))]);
    expect(session.bundle.todoItems).toHaveLength(1);
    expect(session.packing.bags).toHaveLength(1);
    expect(isAuthed()).toBe(false);
    expect(familyAuthStore.getState().authGate).toBeNull();
    expect(useAuthStore.getState().authCheckFailed).toBe(true);
  });
  it('blocks writes and queue creation while preserving read-only data', async () => {
    await stored();
    cold();
    await createOfflineTripSession(s.trip_id, () => {});
    expect(hasReadOnlySession()).toBe(true);
    expect(() => captureWriteSession()).toThrow('read only');
    await expect(
      mutationQueue.enqueue({
        id: completeId(81),
        tripId: tripKey,
        method: 'POST',
        url: '/trips/' + s.trip_id + '/family/tasks',
        body: { original: true },
      })
    ).rejects.toThrow('read only');
    await expect(offlineTripRequest(request('/family/tasks', 'POST'))).rejects.toMatchObject({ status: 503 });
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('keeps ordinary builds disabled and never edits v1 capabilities in place', async () => {
    const e = await stored(false);
    cold();
    await expect(openCompleteTripRead(s.trip_id)).rejects.toThrow('format');
    expect((await plannerCacheDb.completeSnapshots.get(e.generation))?.value.format).toBe('family.offline-trip.v1');
    vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', '');
    expect(offlineTripQualificationEnabled()).toBe(false);
    await expect(createOfflineTripSession(s.trip_id, () => {})).rejects.toThrow('disabled');
  });
  it.each(['mfa_challenge', 'mfa_enroll', 'pending_access'] as const)(
    'refuses known %s instead of using a saved membership',
    async (gate) => {
      await stored();
      cold();
      familyAuthStore.setState({ authGate: gate as typeof originalFamily.authGate });
      await expect(openCompleteTripRead(s.trip_id)).rejects.toThrow();
    }
  );
  it.each(['user_id', 'family_id', 'person_id'] as const)('cannot select another %s generation', async (key) => {
    await stored();
    cold();
    familyAuthStore.setState({
      [key === 'user_id' ? 'authUserId' : key === 'family_id' ? 'familyId' : 'personId']: completeId(99),
    });
    await expect(openCompleteTripRead(s.trip_id)).rejects.toThrow();
  });
  it('refuses an expired, missing or corrupt complete envelope', async () => {
    const e = await stored();
    cold();
    const now = vi.spyOn(Date, 'now').mockReturnValue(e.expiresAt + 1);
    await expect(openCompleteTripRead(s.trip_id)).rejects.toThrow();
    now.mockRestore();
    const row = await plannerCacheDb.completeSnapshots.get(e.generation);
    if (!row) throw new Error('Missing fixture');
    await plannerCacheDb.completeSnapshots.put({ ...row, value: { ...row.value, digest: '0'.repeat(64) } });
    await expect(openCompleteTripRead(s.trip_id)).rejects.toThrow();
    await plannerCacheDb.completeSnapshots.delete(e.generation);
    await expect(openCompleteTripRead(s.trip_id)).rejects.toThrow();
  });
  it('rechecks owner and active head before publishing, including same-account ABA', async () => {
    const e = await stored();
    cold();
    const read = await openCompleteTripRead(s.trip_id);
    await retirePlannerCacheOwners(
      Promise.resolve([{ key: e.ownership.ownerKey, generation: e.ownership.ownerGeneration }])
    );
    const publish = vi.fn();
    await expect(read.publish(publish)).rejects.toThrow();
    expect(publish).not.toHaveBeenCalled();
  });
  it('preserves unknown original queued work and import bytes instead of admitting over it', async () => {
    await stored();
    cold();
    const original: QueuedMutation = {
      id: completeId(88),
      tripId: tripKey,
      method: 'POST',
      url: '/trips/' + s.trip_id + '/family/future',
      body: { exact: 'kept' },
      createdAt: 1,
      status: 'conflict',
      attempts: 4,
      lastError: 'Original failure',
      schemaVersion: 999,
    };
    await offlineDb.mutationQueue.put(original);
    await expect(openCompleteTripRead(s.trip_id)).rejects.toThrow('work');
    expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
    await offlineDb.mutationQueue.delete(original.id);
    await offlineDb.importFiles.put({
      jobId: 'original-import',
      fileName: 'source.pdf',
      blob: new Blob(['original bytes']),
      createdAt: 1,
    });
    await expect(openCompleteTripRead(s.trip_id)).rejects.toThrow('work');
    expect(await offlineDb.importFiles.count()).toBe(1);
  });
  it('refuses another Trip and does not fall back to a network detail or missing media', async () => {
    await stored();
    cold();
    const session = await createOfflineTripSession(s.trip_id, () => {});
    await expect(session.load(completeId(99))).rejects.toThrow();
    await expect(offlineTripRequest(request('/files/1/open'))).rejects.toMatchObject({ status: 503 });
  });
  it('retires cached display on real reconnect without validating an account from it', async () => {
    await stored();
    cold();
    const ended = vi.fn(),
      session = await createOfflineTripSession(s.trip_id, ended);
    await session.load(s.trip_id);
    setForcedOffline(false);
    expect(ended).toHaveBeenCalledOnce();
    expect(currentOfflineTripSession()).toBeNull();
    expect(hasReadOnlySession()).toBe(false);
    expect(isAuthed()).toBe(false);
    expect(useTripStore.getState().trip).toBeNull();
  });
  it('cannot enable qualification against a hosted project even with the local flag', async () => {
    await stored();
    cold();
    environment.source = 'https://example.supabase.invalid';
    expect(offlineTripQualificationEnabled()).toBe(false);
    await expect(openCompleteTripRead(s.trip_id)).rejects.toThrow('disabled');
    await expect(createOfflineTripSession(s.trip_id, () => {})).rejects.toThrow('disabled');
  });
  it('rejects a late local-work arrival before publication without changing it', async () => {
    await stored();
    cold();
    const read = await openCompleteTripRead(s.trip_id);
    const original: QueuedMutation = {
      id: completeId(83),
      tripId: tripKey,
      method: 'POST',
      url: '/trips/' + s.trip_id + '/family/future',
      body: { exact: 'later original' },
      createdAt: 1,
      status: 'pending',
      attempts: 0,
      lastError: null,
      schemaVersion: 999,
    };
    await offlineDb.mutationQueue.put(original);
    const publish = vi.fn();
    await expect(read.publish(publish)).rejects.toThrow('work');
    expect(publish).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
  });
  it('refuses future body and pointer formats without creating replacement ownership', async () => {
    const e = await stored();
    cold();
    const owners = await plannerCacheDb.owners.toArray();
    const row = await plannerCacheDb.completeSnapshots.get(e.generation);
    if (!row) throw new Error('Missing fixture');
    await plannerCacheDb
      .table('completeSnapshots')
      .put({ ...row, value: { ...row.value, format: 'family.offline-trip.v99' } });
    await expect(openCompleteTripRead(s.trip_id)).rejects.toThrow();
    await plannerCacheDb.completeSnapshots.put(row);
    const head = await plannerCacheDb.completeHeads.get(e.ownership.key);
    await plannerCacheDb.table('completeHeads').put({ ...head, version: 99 });
    await expect(openCompleteTripRead(s.trip_id)).rejects.toThrow();
    expect(await plannerCacheDb.owners.toArray()).toEqual(owners);
  });
  it('refuses forward/backward clock changes and never renews expiry on a read', async () => {
    const e = await stored();
    cold();
    const read = await openCompleteTripRead(s.trip_id);
    expect(read.envelope.expiresAt).toBe(e.expiresAt);
    const now = vi.spyOn(Date, 'now').mockReturnValue(e.expiresAt + 1);
    expect(read.current()).toBe(false);
    await expect(read.publish(() => {})).rejects.toThrow();
    now.mockReturnValue(e.capturedAt - 1);
    expect(read.current()).toBe(false);
    now.mockRestore();
    expect((await plannerCacheDb.completeSnapshots.get(e.generation))?.value.expiresAt).toBe(e.expiresAt);
  });
  it('blocks a previously captured writer before it can perform its operation', async () => {
    await stored();
    cold();
    const writer = captureWriteSession();
    await createOfflineTripSession(s.trip_id, () => {});
    const operation = vi.fn();
    await expect(writer.perform(operation)).rejects.toThrow('read only');
    expect(operation).not.toHaveBeenCalled();
  });
  it('requires the already selected original user database', async () => {
    await stored();
    cold();
    await reopenAnonymous();
    expect(() => offlineTripIdentity(s.trip_id)).toThrow('database');
  });
  it('uses the accepted Family handler person identity and refuses the earlier Auth-only MFA identity', async () => {
    await stored();
    cold();
    useAuthStore.setState({ user: buildUser({ id: ids.register('auth', s.user_id) }) });
    expect(() => offlineTripIdentity(s.trip_id)).toThrow('database');
  });
  it.each(['body', 'head', 'work'] as const)('retires an active read after an original %s change', async (kind) => {
    const e = await stored();
    cold();
    const ended = vi.fn(),
      session = await createOfflineTripSession(s.trip_id, ended);
    await session.load(s.trip_id);
    if (kind === 'body') {
      const row = await plannerCacheDb.completeSnapshots.get(e.generation);
      if (!row) throw new Error('Missing fixture');
      await plannerCacheDb.completeSnapshots.put({ ...row, value: { ...row.value, digest: '0'.repeat(64) } });
    } else if (kind === 'head') await plannerCacheDb.completeHeads.delete(e.ownership.key);
    else
      await offlineDb.importFiles.put({
        jobId: 'held-source',
        fileName: 'source.pdf',
        blob: new Blob(['keep']),
        createdAt: 1,
      });
    await vi.waitFor(() => expect(ended).toHaveBeenCalledOnce());
    expect(currentOfflineTripSession()).toBeNull();
    expect(useTripStore.getState().trip).toBeNull();
    expect(isAuthed()).toBe(false);
    if (kind === 'work') expect(await offlineDb.importFiles.count()).toBe(1);
  });
  it('loads saved Costs through the qualified port without replacing them with an empty native budget cache', async () => {
    await stored();
    cold();
    const session = await createOfflineTripSession(s.trip_id, () => {});
    await session.load(s.trip_id);
    const release = installSavedReads();
    try {
      await useTripStore.getState().loadBudgetItems(tripKey);
      expect(useTripStore.getState().budgetItems).toEqual(session.bundle.budgetItems);
      expect((await budgetRepo.list(tripKey)).items).toEqual(session.bundle.budgetItems);
      expect(await offlineDb.budgetItems.count()).toBe(0);
    } finally {
      release();
    }
  });
  it('loads the saved native roster without replacing it with an empty legacy member cache', async () => {
    await stored();
    cold();
    const session = await createOfflineTripSession(s.trip_id, () => {});
    await session.load(s.trip_id);
    const release = installSavedReads();
    try {
      expect(await tripMembersRepo.list(tripKey)).toEqual(session.bundle.members);
      expect(await offlineDb.tripMembers.count()).toBe(0);
    } finally {
      release();
    }
  });
  it.each(['reloadBudget', 'reloadFiles', 'reloadReservations'] as const)(
    'routes %s through the same saved generation without invoking online hydration',
    async (method) => {
      await stored();
      cold();
      await createOfflineTripSession(s.trip_id, () => {});
      const online = vi.fn(async () => {
        throw new Error('No online fallback');
      });
      const port = withOfflineTripReads({
        places: async () => ({ places: [] }),
        days: async () => ({ days: [] }),
        [method]: online,
      });
      await port[method]?.(tripKey);
      expect(online).not.toHaveBeenCalled();
      expect(useTripStore.getState().trip?.id).toBe(tripKey);
    }
  );
  it('keeps live Costs refresh on the original coherent callback when no saved session is active', async () => {
    const online = vi.fn(async (_trip: number | string) => {});
    const port = withOfflineTripReads({
      places: async () => ({ places: [] }),
      days: async () => ({ days: [] }),
      reloadBudget: online,
    });
    await port.reloadBudget?.(tripKey);
    expect(online).toHaveBeenCalledExactlyOnceWith(tripKey);
    expect(currentOfflineTripSession()).toBeNull();
  });
  it('refuses the real native expense deletion callback before any optimistic local change', async () => {
    await stored();
    cold();
    const session = await createOfflineTripSession(s.trip_id, () => {});
    await session.load(s.trip_id);
    const before = useTripStore.getState().budgetItems,
      observations: unknown[] = [];
    const release = useTripStore.subscribe((value) => {
      if (value.budgetItems !== before) observations.push(value.budgetItems);
    });
    try {
      await expect(useTripStore.getState().deleteBudgetItem(tripKey, before[0].id)).rejects.toThrow();
      expect(observations).toEqual([]);
      expect(useTripStore.getState().budgetItems).toBe(before);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    } finally {
      release();
    }
  });
  it('does not reinterpret a failed read-only storage transaction as a permanent authority refusal', async () => {
    await stored();
    cold();
    const read = await openCompleteTripRead(s.trip_id);
    const failure = new Dexie.PrematureCommitError('Synthetic local read failure');
    const observe = vi.spyOn(plannerCacheModule, 'inspectCompleteTrip').mockRejectedValueOnce(failure);
    try {
      await expect(read.publish(() => {})).rejects.toBe(failure);
      expect(read.current()).toBe(true);
    } finally {
      observe.mockRestore();
    }
    const publication = vi.fn();
    await read.publish(publication);
    expect(publication).toHaveBeenCalledOnce();
  });
  it('propagates a publication callback failure without inventing a known access denial', async () => {
    await stored();
    cold();
    const read = await openCompleteTripRead(s.trip_id);
    await expect(
      read.publish(() => {
        throw new Error('Publication failed');
      })
    ).rejects.toThrow('Publication failed');
    expect(read.current()).toBe(true);
    await expect(read.publish(() => {})).resolves.toBeUndefined();
  });
  it('retires a known-refused publication lease so recovering work cannot revive that old view', async () => {
    await stored();
    cold();
    const read = await openCompleteTripRead(s.trip_id);
    await offlineDb.importFiles.put({
      jobId: 'known-refusal',
      fileName: 'original.bin',
      blob: new Blob(['original']),
      createdAt: 1,
    });
    await expect(read.publish(() => {})).rejects.toThrow('work');
    expect(read.current()).toBe(false);
    expect(await offlineDb.importFiles.get(['known-refusal', 'original.bin'])).toMatchObject({
      jobId: 'known-refusal',
      fileName: 'original.bin',
    });
    await offlineDb.importFiles.delete(['known-refusal', 'original.bin']);
    expect(read.current()).toBe(false);
    await expect(read.publish(() => {})).rejects.toThrow();
  });
});

function installSavedReads() {
  return installPlannerReadPort(
    withOfflineTripReads({
      places: async () => ({ places: [] }),
      days: async () => ({ days: [] }),
      budget: async (trip: number | string) =>
        offlineTripRequest({ ...request('/budget'), pathname: '/trips/' + trip + '/budget' }) as Promise<{
          items: import('../../types').BudgetItem[];
        }>,
      members: async (trip: number | string) =>
        offlineTripRequest({ ...request('/members'), pathname: '/trips/' + trip + '/members' }) as Promise<{
          members: import('../../types').TripMember[];
        }>,
    })
  );
}

it('does not relabel an older saved package as a verified empty lodging list', async () => {
  await stored();
  cold();
  const session = await createOfflineTripSession(s.trip_id, () => {});
  await session.load(s.trip_id);
  await expect(session.handle(request('/accommodations'))).rejects.toMatchObject({
    status: 503,
    code: 'saved_stays_unavailable',
  });
});
