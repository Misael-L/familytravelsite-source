import { act, renderHook } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import {
  completeAt,
  completeTripData,
  completeId as id,
  completeScope as scope,
} from '../../../tests/helpers/familyCompleteTrip';
import { canonicalPackingBag, canonicalPackingList, canonicalPackingRow } from '../../../tests/helpers/familyPacking';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { packingApi } from '../../api/client';
import PackingListPanel from '../../components/Packing/PackingListPanel';
import { usePackingBags } from '../../components/Packing/usePackingBags';
import {
  createPackingCategoryActions,
  usePackingCategoryActions,
} from '../../components/Packing/usePackingCategoryActions';
import { usePackingCategoryAssignees } from '../../components/Packing/usePackingCategoryAssignees';
import { usePackingBagTracking, usePackingSnapshot } from '../../components/Packing/usePackingSnapshot';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { hasReadOnlySession } from '../../db/readOnlySession';
import { useTranslation } from '../../i18n';
import MPackingListTab from '../../mobile/screens/trip/tabs/MPackingListTab';
import {
  bindPackingOrigin,
  guardPackingGroupAction,
  installPlannerPackingPort,
  packingActionAvailable,
  packingGroupActionsAvailable,
  packingItemControlsDisabled,
  packingSliceOrigin,
  packingSlicePort,
  type PlannerPackingPort,
} from '../../repo/plannerPackingPort';
import { currentSavedPackingReadPort } from '../../repo/savedPackingReadPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { clearSignedOut } from '../../utils/signedOut';
import { serializeCompleteTrip } from './completeTripSnapshot';
import { FamilyIdentityRegistry } from './identity';
import { createOfflineTripSession, currentOfflineTripSession } from './offlineTripSession';
import { packingCategoryPacket } from './packingCategoryContract';
import { guardedPlannerCache, plannerCacheDb } from './plannerCache';
import { guardedPlannerRead } from './plannerReadGuard';
import { familyAuthStore } from './repository';
const environment = vi.hoisted(() => ({ source: 'http://127.0.0.1:55431' }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => environment.source }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => toast }));
const source = environment.source,
  ids = new FamilyIdentityRegistry(scope.user_id),
  nativeUser = ids.register('person', scope.person_id),
  nativeTrip = ids.register('trip', scope.trip_id);
const originalFamily = familyAuthStore.getState();
let releaseWriter: (() => void) | undefined;
const effect = vi.fn();
function writer(): PlannerPackingPort {
  return {
    snapshot: () => null,
    subscribe: () => () => {},
    bind: effect,
    packed: effect,
    reorder: effect,
    trashPage: effect,
    restore: effect,
    reconcile: effect,
    bindCategory: effect,
    categoryMembers: effect,
    observeGroup: effect,
    categoryAccess: effect,
  };
}
function data(categories = true, empty = false) {
  const d = completeTripData();
  const city = {
    ...d.planner.view.state.locations[0],
    id: id(70),
    name: 'Puebla',
    source: { kind: 'place' as const, id: id(7) },
    cover_media_id: null,
  };
  d.planner.view.state.locations.push(city);
  d.planner.view.state.destinations.push({ source_place_id: id(7), location_id: city.id, legacy_category_id: null });
  const p = canonicalPackingList({ ...scope, layer: 'published' }, true);
  p.items = empty
    ? []
    : [
        canonicalPackingRow({
          id: id(80),
          trip_id: scope.trip_id,
          name: 'Shared raincoat',
          category: 'Gear',
          owner_person_id: null,
          is_private: false,
          recipient_person_ids: [],
          contributor_person_ids: [],
          bag_id: id(82),
        }),
        canonicalPackingRow({
          id: id(81),
          trip_id: scope.trip_id,
          name: 'Personal medicine',
          category: 'Personal Kit',
          owner_person_id: scope.person_id,
          is_private: true,
          recipient_person_ids: [],
          contributor_person_ids: [],
          bag_id: null,
        }),
      ];
  p.bags = empty
    ? []
    : [
        canonicalPackingBag({
          id: id(82),
          trip_id: scope.trip_id,
          member_person_ids: [scope.person_id],
          total_weight_grams: 7200,
        }),
      ];
  p.category_assignees = empty ? {} : { Gear: [id(83), id(84)] };
  p.unassigned_weight_grams = empty ? 0 : 1800;
  d.packing = p;
  d.companions.members.push(
    { person_id: id(83), people: { display_name: 'Category Guest', color: null } },
    { person_id: id(84), people: { display_name: 'Historical Guest', color: null } }
  );
  if (categories)
    d.packing_categories = packingCategoryPacket.parse({
      version: 1,
      scope: p.scope,
      collection_revision: p.collection_revision,
      packing: p,
      categories: empty
        ? []
        : [
            {
              id: id(90),
              trip_id: scope.trip_id,
              owner_person_id: null,
              name: 'Gear',
              revision: 1,
              created_at: completeAt,
              updated_at: completeAt,
              assignments: [id(83), id(84)].map((person_id) => ({
                person_id,
                assigned_at: null,
                assigned_by_person_id: null,
              })),
            },
            {
              id: id(91),
              trip_id: scope.trip_id,
              owner_person_id: scope.person_id,
              name: 'Personal Kit',
              revision: 1,
              created_at: completeAt,
              updated_at: completeAt,
              assignments: [],
            },
          ],
      item_categories: empty
        ? []
        : [
            { item_id: id(80), category_id: id(90) },
            { item_id: id(81), category_id: id(91) },
          ],
      people: empty
        ? []
        : [
            { id: scope.person_id, display_name: 'Synthetic member', is_guest: false, eligible: true },
            { id: id(83), display_name: 'Category Guest', is_guest: true, eligible: true },
            { id: id(84), display_name: 'Historical Guest', is_guest: true, eligible: false },
          ],
    });
  return d;
}
async function stored(categories = true, empty = false) {
  return guardedPlannerRead(
    captureReadSession(),
    { uuid: scope.trip_id, native: nativeTrip },
    () => new Error('Held'),
    async (guard) => {
      const cache = await guardedPlannerCache(guard, source, scope, {
        now: Date.now,
        blocked: () => new Error('Ended'),
      });
      const envelope = await serializeCompleteTrip({
        source,
        scope,
        capturedAt: Date.now(),
        ownership: cache.completeOwnership(),
        data: data(categories, empty),
        admitReadOnly: true,
      });
      await cache.commitComplete(envelope);
      return envelope;
    }
  );
}
async function cold(categories = true, empty = false) {
  const envelope = await stored(categories, empty);
  setAuthed(false);
  familyAuthStore.setState({ authGate: null, authCheckFailed: true });
  useAuthStore.setState({ authCheckFailed: true });
  setForcedOffline(true);
  const session = await createOfflineTripSession(scope.trip_id, () => {});
  await session.load(scope.trip_id);
  return { session, envelope };
}
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
    authUserId: scope.user_id,
    familyId: scope.family_id,
    personId: scope.person_id,
    authGate: 'ok',
    authCheckFailed: false,
  });
  effect.mockReset();
  toast.error.mockReset();
  for (const key of [
    'getCategoryAssignees',
    'listBags',
    'setCategoryAssignees',
    'createBag',
    'updateBag',
    'deleteBag',
    'setBagMembers',
  ] as const)
    vi.spyOn(packingApi, key).mockImplementation(effect);
});
afterEach(async () => {
  cleanup();
  currentOfflineTripSession()?.dispose();
  releaseWriter?.();
  releaseWriter = undefined;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  _resetNetworkMode();
  setAuthed(false);
  familyAuthStore.setState(originalFamily, true);
  await resetOfflineTestDatabase();
  await reopenAnonymous();
});
function options() {
  return {
    trip: nativeTrip,
    view: 'common' as const,
    items: useTripStore.getState().packingItems,
    defaultCategory: 'Other',
    authorized: true,
    report: toast.error,
  };
}
function hooks() {
  return renderHook(() => ({
    snapshot: usePackingSnapshot(nativeTrip),
    tracking: usePackingBagTracking(nativeTrip),
    categories: usePackingCategoryActions(options()),
    assignees: usePackingCategoryAssignees({ tripId: nativeTrip, t: (k) => k, toast }),
    bags: usePackingBags({ tripId: nativeTrip, bagTrackingEnabled: true, t: (k) => k, toast }),
  }));
}
function Surface({ phone }: { phone: boolean }) {
  const { t } = useTranslation(),
    rows = useTripStore((s) => s.packingItems);
  return phone ? (
    <MPackingListTab planner={buildPlanner({ tripId: nativeTrip, packingItems: rows, t, toast, can: () => false })} />
  ) : (
    <PackingListPanel tripId={nativeTrip} items={rows} />
  );
}
it.each([false, true])(
  'actual %s native surface uses the saved bag totals while online writer is empty',
  async (phone) => {
    releaseWriter = installPlannerPackingPort(writer());
    await cold();
    render(<Surface phone={phone} />);
    await screen.findByText('Shared raincoat', { exact: true });
    if (phone) fireEvent.click(screen.getAllByRole('button', { name: 'Bags' })[0]);
    expect(await screen.findByText('Cabin bag', { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText('7.2 kg', { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('9.0 kg', { exact: true }).length).toBeGreaterThan(0);
    if (!phone) {
      expect(screen.getByText('Category Guest')).toBeInTheDocument();
      expect(screen.getByText('Historical Guest')).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Assign members' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'List options' })).not.toBeInTheDocument();
    expect(effect).not.toHaveBeenCalled();
  }
);
it.each([false, true])(
  'saved facts select correctly with writer installed=%s; no identity or write authority is borrowed',
  async (installed) => {
    if (installed) releaseWriter = installPlannerPackingPort(writer());
    await cold();
    const { result } = hooks();
    expect(result.current.snapshot.view?.bags[0].id).toBe(ids.register('packingBag', id(82)));
    expect(result.current.tracking).toBe(true);
    expect(result.current.bags.unassignedWeightGrams).toBe(1800);
    expect(result.current.bags.serverWeightsFresh).toBe(true);
    expect(result.current.categories.assignees('Gear', [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: 'Category Guest', is_guest: true }),
        expect.objectContaining({ username: 'Historical Guest', eligible: false }),
      ])
    );
    expect(result.current.categories.available('Gear', 'assign')).toBe(false);
    expect(result.current.categories.available('Gear', 'rename')).toBe(false);
    expect(result.current.categories.openAssignments('Gear')).toBe(false);
    expect(result.current.categories.begin('Gear', 'rename')).toBe(false);
    await act(async () => {
      await result.current.bags.createBag('Refused');
      await result.current.bags.updateBag(1, { name: 'Refused' });
      await result.current.bags.deleteBag(1);
      await result.current.bags.setBagMembers(1, []);
      await result.current.assignees.setAssignees('Gear', []);
    });
    expect(() => bindPackingOrigin(null, nativeTrip)).toThrow('read only');
    expect(() => guardPackingGroupAction()).toThrow('read only');
    expect(() => packingSliceOrigin(nativeTrip, null, undefined, [])).toThrow('read only');
    expect(() => packingSlicePort(undefined, null, [])).toThrow('read only');
    expect(packingGroupActionsAvailable(true)).toBe(false);
    expect(packingActionAvailable('trash', true)).toBe(false);
    expect(packingItemControlsDisabled(true)).toBe(true);
    expect(effect).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  }
);
it('old saved packages retain assignment names without inventing canonical category IDs', async () => {
  await cold(false);
  const { result } = hooks();
  expect(result.current.categories.access('Gear')).toBeNull();
  expect(result.current.categories.assignees('Gear', []).map((a) => a.username)).toEqual([
    'Category Guest',
    'Historical Guest',
  ]);
  expect(result.current.categories.available('Gear', 'rename')).toBe(false);
});
it('empty complete observations replace all former ancillary data', async () => {
  const first = await cold();
  const { result } = hooks();
  expect(result.current.bags.bags).toHaveLength(1);
  act(() => first.session.dispose());
  setForcedOffline(false);
  setAuthed(true);
  familyAuthStore.setState({ authGate: 'ok', authCheckFailed: false });
  useAuthStore.setState({ authCheckFailed: false });
  await act(async () => {
    await cold(true, true);
  });
  expect(result.current.bags.bags).toEqual([]);
  expect(result.current.assignees.categoryAssignees).toEqual({});
  expect(result.current.snapshot.view?.items).toEqual([]);
  expect(result.current.bags.unassignedWeightGrams).toBe(0);
});
it('consumer references cannot mutate the saved authoritative weights or provenance', async () => {
  await cold();
  const { result } = hooks(),
    view = required(result.current.snapshot.view);
  expect(Object.isFrozen(view.bags[0])).toBe(true);
  expect(() => {
    view.bags[0].total_weight_grams = 0;
  }).toThrow();
  expect(() => view.items.pop()).toThrow();
  expect(view.bags[0].total_weight_grams).toBe(7200);
});
it.each([
  'source',
  'person',
  'family',
  'account',
  'trip',
  'dispose',
  'reconnect',
  'expiry',
  'body',
  'head',
  'work',
  'queue',
] as const)('retires the admitted saved reader after %s changes', async (change) => {
  releaseWriter = installPlannerPackingPort(writer());
  const { session, envelope } = await cold();
  const { result } = hooks(),
    stale = required(currentSavedPackingReadPort());
  await act(async () => {
    if (change === 'source') environment.source = 'http://127.0.0.1:55331';
    else if (change === 'person') familyAuthStore.setState({ personId: id(99) });
    else if (change === 'family') familyAuthStore.setState({ familyId: id(99) });
    else if (change === 'account') familyAuthStore.setState({ authUserId: id(99) });
    else if (change === 'trip') useTripStore.setState({ trip: { ...required(useTripStore.getState().trip), id: 999 } });
    else if (change === 'dispose') session.dispose();
    else if (change === 'reconnect') setForcedOffline(false);
    else if (change === 'expiry') vi.spyOn(Date, 'now').mockReturnValue(envelope.expiresAt + 1);
    else if (change === 'body') {
      const row = await plannerCacheDb.completeSnapshots.get(envelope.generation);
      await plannerCacheDb.completeSnapshots.put({
        ...required(row),
        value: { ...required(row).value, digest: '0'.repeat(64) },
      });
    } else if (change === 'head') await plannerCacheDb.completeHeads.delete(envelope.ownership.key);
    else if (change === 'work')
      await offlineDb.importFiles.put({ jobId: 'keep', fileName: 'keep.pdf', blob: new Blob(['keep']), createdAt: 1 });
    else
      await offlineDb.mutationQueue.put({
        id: id(99),
        tripId: nativeTrip,
        method: 'POST',
        url: '/future',
        body: { keep: true },
        createdAt: 1,
        status: 'pending',
        attempts: 0,
        lastError: null,
        schemaVersion: 999,
      });
  });
  if (change === 'trip') {
    expect(result.current.snapshot.view).toBeNull();
    expect(stale.snapshot(999)).toBeNull();
    session.dispose();
  } else await waitFor(() => expect(currentSavedPackingReadPort()).toBeNull(), { timeout: 2500 });
  expect(stale.snapshot(nativeTrip)).toBeNull();
  expect(
    stale.assignees(nativeTrip, { view: 'common', label: 'Gear', defaultCategory: 'Other' }, session.packing.items)
  ).toEqual([]);
  expect(result.current.snapshot.view).toBeNull();
  expect(effect).not.toHaveBeenCalled();
  if (change === 'work') expect(await offlineDb.importFiles.count()).toBe(1);
  if (change === 'queue') expect(await offlineDb.mutationQueue.count()).toBe(1);
});
it('old category callbacks cannot borrow a new saved read-only observation', async () => {
  releaseWriter = installPlannerPackingPort(writer());
  const owner = createPackingCategoryActions(options, effect);
  await cold();
  expect(owner.available('Gear', 'rename')).toBe(false);
  expect(owner.begin('Gear', 'rename')).toBe(false);
  expect(effect).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledOnce();
  owner.dispose();
});

it('saved display never overwrites the online writer and reconnect resumes its own publication', async () => {
  const port = writer();
  let online: import('../../repo/plannerPackingPort').PackingView | null = null;
  port.snapshot = () => online;
  releaseWriter = installPlannerPackingPort(port);
  const { session } = await cold();
  const trip = required(useTripStore.getState().trip);
  const { result } = hooks();
  expect(result.current.snapshot.view?.bags[0].total_weight_grams).toBe(7200);
  expect(port.snapshot()).toBeNull();
  act(() => {
    session.dispose();
    online = { items: [], bags: [], assignees: {}, unassigned_weight_grams: 250 };
    useTripStore.setState({ trip });
  });
  expect(result.current.snapshot.view).toBe(online);
  expect(result.current.bags.unassignedWeightGrams).toBe(250);
  expect(hasReadOnlySession()).toBe(false);
});

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Missing test observation');
  return value;
}

it('retired saved bag and responsibility callbacks remain refused after the read-only lease ends', async () => {
  const { session } = await cold();
  const { result } = hooks();
  const before = result.current;
  act(() => session.dispose());
  await act(async () => {
    await before.bags.createBag('Refused');
    await before.bags.deleteBag(1);
    await before.assignees.setAssignees('Gear', []);
  });
  expect(effect).not.toHaveBeenCalled();
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
