import '@testing-library/jest-dom/vitest';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import {
  completeAt,
  completeSource,
  completeTripCaptureFixture,
  completeTripData,
  completeId as id,
  completeScope as scope,
} from '../../../tests/helpers/familyCompleteTrip';
import { canonicalPackingBag, canonicalPackingList, canonicalPackingRow } from '../../../tests/helpers/familyPacking';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { cleanup, fireEvent, render, screen } from '../../../tests/helpers/render';
import { packingApi, tripsApi } from '../../api/client';
import PackingListPanel from '../../components/Packing/PackingListPanel';
import {
  groupPackingItems,
  packingGroupKey,
  packingProgress,
  packingViewItems,
} from '../../components/Packing/packingListModel';
import { usePackingBags } from '../../components/Packing/usePackingBags';
import { usePackingCategoryActions } from '../../components/Packing/usePackingCategoryActions';
import { usePackingSnapshot } from '../../components/Packing/usePackingSnapshot';
import { installReadOnlySession } from '../../db/readOnlySession';
import { useTranslation } from '../../i18n';
import MPackingListTab from '../../mobile/screens/trip/tabs/MPackingListTab';
import {
  bindPackingOrigin,
  guardPackingGroupAction,
  installPlannerPackingPort,
  type PlannerPackingPort,
} from '../../repo/plannerPackingPort';
import { installSavedPackingReadPort } from '../../repo/savedPackingReadPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { projectCompleteTrip } from './completeTripProjection';
import { parseCompleteTrip, serializeCompleteTrip } from './completeTripSnapshot';
import { FamilyIdentityRegistry, type IdentityKind } from './identity';
import { packingCategoryKey, packingCategorySnapshotV2 } from './packingCategoryV2Contract';
import { plannerCacheKey, plannerCacheOwnerKey } from './plannerCache';
import { createPreparationReadiness } from './preparationReadiness';
import { selectPreparationFile } from './privateFileAcquisition';
import { createPublicImagePreparation } from './publicImagePreparation';
import { createPublicVariantCache } from './publicVariantCache';
import { createSavedPackingReader } from './savedPackingReader';

const environment = vi.hoisted(() => ({ source: 'http://127.0.0.1:55631' }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => environment.source }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => toast }));
const source124 = 'http://127.0.0.1:55631';
const nativeIds = new FamilyIdentityRegistry(scope.user_id),
  nativeTrip = nativeIds.register('trip', scope.trip_id),
  nativeUser = nativeIds.register('person', scope.person_id);
const originalAuth = useAuthStore.getState();
const stops: (() => void)[] = [];
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
function dataV3(empty = false) {
  const data = completeTripData();
  const city = {
    ...data.planner.view.state.locations[0],
    id: id(70),
    name: 'Puebla',
    source: { kind: 'place' as const, id: id(7) },
    cover_media_id: null,
  };
  data.planner.view.state.locations.push(city);
  data.planner.view.state.destinations.push({ source_place_id: id(7), location_id: city.id, legacy_category_id: null });
  // The same UUID occupies three distinct namespaces in the real saved projection.
  data.companions.categories.push({
    id: id(80),
    family_id: scope.family_id,
    name: 'Planner category',
    color_hex: '#123456',
    icon_key: 'tag',
    sort_order: 0,
  });
  const p = canonicalPackingList({ ...scope, layer: 'published' }, true);
  const category = (n: number, name: string, sort_order: number, owner_person_id: string | null = null) => ({
    id: id(n),
    trip_id: scope.trip_id,
    owner_person_id,
    name,
    sort_order,
    revision: 1,
    created_at: completeAt,
    updated_at: completeAt,
    retained_when_empty: true,
    deleted_at: null,
    deleted_by_person_id: null,
    assignments: [],
  });
  p.items = empty
    ? []
    : [
        canonicalPackingRow({
          id: id(80),
          trip_id: scope.trip_id,
          name: 'Shared raincoat',
          category: '',
          is_private: false,
          owner_person_id: null,
          recipient_person_ids: [],
          contributor_person_ids: [],
          bag_id: id(82),
        }),
        canonicalPackingRow({
          id: id(86),
          trip_id: scope.trip_id,
          name: 'Literal Other map',
          category: 'Other',
          sort_order: 1,
          checked: true,
          packed_quantity: null,
          is_private: false,
          owner_person_id: null,
          recipient_person_ids: [],
          contributor_person_ids: [],
          bag_id: id(82),
        }),
        canonicalPackingRow({
          id: id(81),
          trip_id: scope.trip_id,
          name: '...',
          category: 'Other',
          sort_order: 2,
          quantity: 1,
          packed_quantity: null,
          owner_person_id: scope.person_id,
          recipient_person_ids: [],
          contributor_person_ids: [],
          bag_id: null,
        }),
        canonicalPackingRow({
          id: id(87),
          trip_id: scope.trip_id,
          name: 'Peer shared socks',
          category: 'Other',
          sort_order: 3,
          quantity: 1,
          packed_quantity: null,
          weight_grams: 100,
          owner_person_id: id(88),
          recipient_person_ids: [scope.person_id],
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
  p.category_assignees = empty ? {} : { '': [id(83), id(84)] };
  p.unassigned_weight_grams = empty ? 0 : 1800;
  data.packing = p;
  data.packing_categories_v2 = packingCategorySnapshotV2.parse({
    version: 2,
    scope: p.scope,
    collection_revision: p.collection_revision,
    packing: structuredClone(p),
    categories: empty
      ? [category(402, 'Empty Kit', 0), category(404, 'Empty Personal', 0, scope.person_id)]
      : [
          {
            ...category(80, '', 0),
            assignments: [id(83), id(84)].map((person_id) => ({
              person_id,
              assigned_at: completeAt,
              assigned_by_person_id: id(85),
            })),
          },
          category(401, 'Other', 1),
          category(402, 'Empty Kit', 2),
          category(403, 'Other', 0, scope.person_id),
          category(404, 'Empty Personal', 1, scope.person_id),
          category(405, 'Other', 0, id(88)),
        ],
    item_categories: empty
      ? []
      : [
          { item_id: id(80), category_id: id(80) },
          { item_id: id(81), category_id: id(403) },
          { item_id: id(86), category_id: id(401) },
          { item_id: id(87), category_id: id(405) },
        ],
    people: empty
      ? [{ id: scope.person_id, display_name: 'Owner', is_guest: false, eligible: true }]
      : [
          { id: scope.person_id, display_name: 'Owner', is_guest: false, eligible: true },
          { id: id(83), display_name: 'Category Guest', is_guest: true, eligible: true },
          { id: id(84), display_name: 'Historical Guest', is_guest: true, eligible: false },
          { id: id(85), display_name: 'Historical Assigning Person', is_guest: false, eligible: false },
          { id: id(88), display_name: 'Peer owner', is_guest: false, eligible: true },
        ],
  });
  return data;
}
async function pipeline(options: { empty?: boolean; legacy?: boolean; source?: string } = {}) {
  const source = options.source ?? source124,
    data = dataV3(options.empty);
  for (const variant of data.planner.variants)
    for (const field of ['canonicalUrl', 'thumbUrl', 'heroUrl'] as const)
      if (variant[field]) variant[field] = variant[field].replace(completeSource, source);
  if (options.legacy) delete data.packing_categories_v2;
  const capture = {
    ...completeTripCaptureFixture(),
    source,
    capturedAt: Date.now(),
    data,
    admitReadOnly: true,
    ...(!options.legacy ? { packingFormat: 'category-identity-v2' as const } : {}),
    ownership: {
      key: plannerCacheKey(source, scope),
      ownerKey: plannerCacheOwnerKey(source, {
        user_id: scope.user_id,
        family_id: scope.family_id,
        person_id: scope.person_id,
      }),
      ownerGeneration: id(900),
      tripGeneration: id(901),
    },
  };
  const serialized = await serializeCompleteTrip(capture);
  const envelope = await parseCompleteTrip(JSON.stringify(serialized), {
    source,
    scope,
    ownership: capture.ownership,
    now: Date.now(),
  });
  let active = true;
  const check = () => {
    if (!active || environment.source !== source) throw Error('Original saved read ended');
  };
  const projection = await projectCompleteTrip(envelope, check, async () => null);
  const reader = createSavedPackingReader({
    view: { ...projection.packing, unassigned_weight_grams: envelope.data.packing.unassigned_weight_grams },
    categories: envelope.data.packing_categories_v2 ?? null,
    ids: projection.ids,
    check: (trip) => {
      check();
      if (trip !== scope.trip_id && String(trip) !== String(nativeTrip)) throw Error('Wrong saved Trip');
    },
  });
  const read = {
    envelope,
    check,
    current: () => active,
    verify: vi.fn(async () => {
      check();
    }),
  };
  return {
    serialized,
    envelope,
    projection,
    reader,
    read,
    retire: () => {
      active = false;
    },
  };
}
async function mountSaved(options: { empty?: boolean; installed?: boolean } = {}) {
  const f = await pipeline(options);
  if (options.installed !== false) stops.push(installPlannerPackingPort(writer()));
  stops.push(installReadOnlySession());
  stops.push(installSavedPackingReadPort(f.reader));
  useTripStore.setState({
    trip: f.projection.bundle.trip,
    packingItems: f.projection.packing.items,
    isLoading: false,
  });
  return f;
}
function Surface({ phone }: { phone: boolean }) {
  const { t } = useTranslation(),
    rows = useTripStore((s) => s.packingItems);
  return phone ? (
    <MPackingListTab planner={buildPlanner({ tripId: nativeTrip, packingItems: rows, t, toast, can: () => true })} />
  ) : (
    <PackingListPanel tripId={nativeTrip} items={rows} />
  );
}
function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('Required saved observation missing');
  return value;
}
beforeEach(() => {
  environment.source = source124;
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', 'local-v1');
  vi.stubEnv('VITE_FAMILY_PACKING_IDENTITY_QUALIFICATION', 'local-v2');
  vi.stubEnv('VITE_SUPABASE_URL', source124);
  _resetNetworkMode();
  setForcedOffline(true);
  useTripStore.getState().resetTrip();
  useAuthStore.setState({
    user: buildUser({ id: nativeUser }),
    isAuthenticated: true,
    isLoading: false,
    loggingOut: false,
  });
  effect.mockReset();
  toast.error.mockReset();
  vi.spyOn(tripsApi, 'getMembers').mockResolvedValue({ members: [] });
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
afterEach(() => {
  cleanup();
  for (const stop of stops.splice(0).reverse()) stop();
  useTripStore.getState().resetTrip();
  useAuthStore.setState(originalAuth, true);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  _resetNetworkMode();
});

describe('v3 saved package to native read-only category projection', () => {
  it('round trips same-UUID item/category/planner-category bindings through the actual complete projection', async () => {
    const f = await pipeline();
    expect(f.envelope.format).toBe('family.offline-trip.v3');
    expect(f.envelope.data).not.toHaveProperty('packing_categories');
    const kinds = ['packing', 'packingCategory', 'category'] as const;
    const keys = kinds.map((kind) => f.projection.ids.register(kind, id(80)));
    expect(new Set(keys).size).toBe(3);
    for (const binding of f.envelope.bindings)
      expect(f.projection.ids.uuid(binding.kind as IdentityKind, binding.key)).toBe(binding.uuid);
    for (const kind of kinds)
      expect(f.envelope.bindings).toContainEqual({ kind, uuid: id(80), key: f.projection.ids.register(kind, id(80)) });
    expect(f.projection.ids.uuid('person', f.projection.ids.register('person', id(85)))).toBe(id(85));
    expect(f.projection.packing.items).toHaveLength(4);
    expect(f.projection.packing.categoryViews).toHaveLength(6);
    expect(f.projection.bundle.familyPackingCategorySnapshot).toEqual(f.envelope.data.packing_categories_v2);
  });
  it('restores historical assignment People and empty/foreign metadata with no authoring capability', async () => {
    const f = await pipeline(),
      rows = f.projection.packing.items;
    const access = f.reader.categoryAccess(
      nativeTrip,
      { view: 'common', label: packingCategoryKey(id(80)), defaultCategory: 'Other' },
      rows
    );
    expect(access).toMatchObject({
      id: id(80),
      name: '',
      canRename: false,
      canAssign: false,
      assignees: [
        { username: 'Category Guest', is_guest: true, eligible: true },
        { username: 'Historical Guest', is_guest: true, eligible: false },
      ],
    });
    expect(
      f.reader.categoryAccess(
        nativeTrip,
        { view: 'common', label: packingCategoryKey(id(402)), defaultCategory: 'Other' },
        rows
      )
    ).toMatchObject({ id: id(402), name: 'Empty Kit', canRename: false, canAssign: false });
    expect(
      f.reader.categoryAccess(
        nativeTrip,
        { view: 'personal', label: packingCategoryKey(id(405)), defaultCategory: 'Other' },
        rows
      )
    ).toMatchObject({ id: id(405), canRename: false, canAssign: false });
    const saved = required(f.reader.snapshot(nativeTrip));
    expect(Object.isFrozen(saved.categoryViews?.[2].placeholder)).toBe(true);
    expect(() => {
      required(saved.categoryViews)[2].rawName = 'Changed';
    }).toThrow();
    expect(() => {
      saved.items.pop();
    }).toThrow();
  });
  it.each([false, true])('renders saved identity cards on the actual native surface phone=%s', async (phone) => {
    const f = await mountSaved();
    render(<Surface phone={phone} />);
    await screen.findByText('Shared raincoat', { exact: true });
    expect(screen.getByText('Literal Other map', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Empty Kit', { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText('Other', { exact: true }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Category options' })).not.toBeInTheDocument();
    if (!phone) {
      expect(screen.getByText('Historical Guest', { exact: true })).toBeInTheDocument();
      expect(screen.getByText('Category Guest', { exact: true })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: /^My list/ }));
    expect(await screen.findByText('...', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Peer shared socks', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Empty Personal', { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText('Other', { exact: true }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(effect).not.toHaveBeenCalled();
    expect(f.envelope.data.packing.items).toHaveLength(4);
  });
  it.each([false, true])('keeps metadata-only empty cards visible without inventing rows phone=%s', async (phone) => {
    const f = await mountSaved({ empty: true });
    render(<Surface phone={phone} />);
    expect(await screen.findByText('Empty Kit', { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^My list/ }));
    expect(await screen.findByText('Empty Personal', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('...', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(f.reader.snapshot(nativeTrip)?.items).toEqual([]);
    expect(packingProgress(useTripStore.getState().packingItems)).toEqual({ checked: 0, total: 0, pct: 0 });
    expect(effect).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'selects saved metadata/counts/weights independently of an installed writer=%s',
    async (installed) => {
      await mountSaved({ installed });
      const { result } = renderHook(() => ({
        snapshot: usePackingSnapshot(nativeTrip),
        bags: usePackingBags({ tripId: nativeTrip, bagTrackingEnabled: true, t: (key) => key, toast }),
        categories: usePackingCategoryActions({
          trip: nativeTrip,
          view: 'common',
          items: useTripStore.getState().packingItems,
          defaultCategory: 'Other',
          authorized: true,
          report: toast.error,
        }),
      }));
      const saved = required(result.current.snapshot.view),
        cards = required(saved.categoryViews);
      const common = packingViewItems(saved.items, 'common');
      expect(
        groupPackingItems(
          common,
          'all',
          'Other',
          cards.filter((c) => c.ownerPersonId === null)
        ).map(packingGroupKey)
      ).toEqual([80, 401, 402].map((n) => packingCategoryKey(id(n))));
      expect(packingProgress(saved.items)).toEqual({ checked: 1, total: 4, pct: 25 });
      expect(result.current.bags.bags[0].total_weight_grams).toBe(7200);
      expect(result.current.bags.unassignedWeightGrams).toBe(1800);
      expect(result.current.bags.serverWeightsFresh).toBe(true);
      expect(result.current.categories.available(packingCategoryKey(id(80)), 'rename')).toBe(false);
      expect(result.current.categories.openAssignments(packingCategoryKey(id(80)))).toBe(false);
      await act(async () => {
        await result.current.bags.createBag('Refused');
      });
      expect(() => bindPackingOrigin(null, nativeTrip)).toThrow('read only');
      expect(() => guardPackingGroupAction()).toThrow('read only');
      expect(effect).not.toHaveBeenCalled();
    }
  );
  it('retires the original saved reader without exposing a later Trip or mutable fallback', async () => {
    const f = await pipeline(),
      read = f.reader.snapshot;
    expect(read(id(999))).toBeNull();
    expect(read(nativeTrip)?.items).toHaveLength(4);
    f.retire();
    expect(read(nativeTrip)).toBeNull();
    expect(
      f.reader.assignees(
        nativeTrip,
        { view: 'common', label: packingCategoryKey(id(80)), defaultCategory: 'Other' },
        f.projection.packing.items
      )
    ).toEqual([]);
  });
});

describe('v3 preparation scope compatibility on local124', () => {
  it('admits v3 preparation metadata on124 without acquiring bytes or claiming full preparation', async () => {
    const f = await pipeline();
    expect(() => createPublicVariantCache({ source: source124 })).not.toThrow();
    const defaultImages = createPublicImagePreparation(f.read);
    stops.push(defaultImages.dispose);
    const cache = { read: vi.fn(async () => ({ status: 'miss' as const })), capture: vi.fn() };
    const images = createPublicImagePreparation(f.read, cache);
    stops.push(images.dispose);
    const status = createPreparationReadiness(f.read, { cache, privatePool: () => null });
    stops.push(status.dispose);
    expect(selectPreparationFile(f.envelope, id(40))).toMatchObject({ id: id(40), mime_type: 'application/pdf' });
    const observed = await status.inspect();
    expect(observed).toMatchObject({
      wholeTripReady: false,
      metadata: { status: 'available' },
      publicImages: { status: 'partial', counts: { missing: 2 } },
      privateFiles: { counts: { unsupported: 0, missing: 1 } },
    });
    expect(cache.capture).not.toHaveBeenCalled();
    expect(f.read.verify).toHaveBeenCalled();
  });
  it.each(['http://127.0.0.1:55631', 'http://127.0.0.1:55431'])(
    'does not broaden old v2 preparation to %s',
    async (source) => {
      environment.source = source;
      const f = await pipeline({ source, legacy: true });
      expect(f.envelope.format).toBe('family.offline-trip.v2');
      expect(() => createPublicImagePreparation(f.read)).toThrow('scope');
      expect(() => createPreparationReadiness(f.read)).toThrow('scope');
      expect(() => selectPreparationFile(f.envelope, id(40))).toThrow();
    }
  );
  it('preserves old v2 preparation at its original source and requires the explicit124 cache flag', async () => {
    environment.source = 'http://127.0.0.1:55331';
    const f = await pipeline({ source: environment.source, legacy: true });
    const images = createPublicImagePreparation(f.read);
    stops.push(images.dispose);
    const status = createPreparationReadiness(f.read);
    stops.push(status.dispose);
    expect(selectPreparationFile(f.envelope, id(40)).id).toBe(id(40));
    environment.source = source124;
    vi.stubEnv('VITE_FAMILY_PACKING_IDENTITY_QUALIFICATION', '');
    expect(() => createPublicVariantCache({ source: source124 })).toThrow('source');
  });
});
