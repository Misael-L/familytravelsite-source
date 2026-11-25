import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import {
  packingFixtureAt as at,
  canonicalPackingList,
  canonicalPackingRow,
  packingFixtureId as id,
} from '../../../tests/helpers/familyPacking';
import { canonicalPackingAck } from '../../../tests/helpers/familyPackingCommands';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api, { packingApi } from '../../api/client';
import { KategorieGruppe } from '../../components/Packing/PackingListPanelCategoryGroup';
import { ArtikelZeile } from '../../components/Packing/PackingListPanelItemRow';
import { usePackingBags } from '../../components/Packing/usePackingBags';
import { usePackingCategoryAssignees } from '../../components/Packing/usePackingCategoryAssignees';
import { createPackingDraft } from '../../components/Packing/usePackingDraft';
import { usePackingImport } from '../../components/Packing/usePackingImport';
import { usePackingItemActions } from '../../components/Packing/usePackingItemActions';
import { usePackingBagTracking } from '../../components/Packing/usePackingSnapshot';
import { usePackingTemplates } from '../../components/Packing/usePackingTemplates';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { installReadOnlySession } from '../../db/readOnlySession';
import MPackItemSheet from '../../mobile/screens/trip/tabs/MPackItemSheet';
import {
  bindPackingOrigin,
  installPlannerPackingPort,
  packingRowArgs,
  packingSetArgs,
} from '../../repo/plannerPackingPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { FamilyPackingTrash } from './FamilyPackingTrash';
import { packingCommand, packingJson } from './packingCommandContract';
import { createPackingCommandHandler } from './packingCommandHandler';
import type { PackingCommandRpc } from './packingCommandTransport';
import type { PackingAck, PackingList, PackingRow } from './packingContract';
import { createPackingTransport, type PackingRpc } from './packingTransport';
import { plannerActionAvailable } from './plannerActionAvailability';
import { PlannerCohortPacking } from './plannerCohortPacking';
import { projectPacking } from './plannerPacking';
import { FamilyApiError, FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';
import { familyCanDo, type FamilyPermissionController } from './uiPermissions';

let repo: FamilyFrontendRepository,
  writer: PlannerCohortPacking,
  data: PackingList,
  trash: PackingRow[],
  source: string,
  disposed: boolean,
  allowed: boolean,
  native: number;
let stop: () => void, stopPort: () => void;
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => toast }));
function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Expected a concrete native test observation');
  return value;
}
let session: FamilySession;
let revalidate: () => Promise<void>;
const priorAdapter = api.defaults.adapter;
const receipts = new Map<string, { body: string; ack: PackingAck }>();
const rpc = vi.fn<PackingCommandRpc>();
const readRpc = vi.fn<PackingRpc>();
let lose = false,
  redacted = false;
function currentItem() {
  const item = useTripStore.getState().packingItems[0];
  if (!item) throw new Error('No projected item');
  return item;
}
function publish() {
  const ids = repo.knownViews()?.ids;
  if (!ids) throw new Error('Missing fixture identity registry');
  const projection = projectPacking(data, ids, [
    { personId: data.scope.person_id, displayName: 'Current Person' },
    { personId: id(7), displayName: 'Other Person' },
  ]);
  writer.publish(data, projection);
  useTripStore.setState({ packingItems: projection.items });
}
function refusal(): never {
  throw new FamilyApiError(409, 'stale', 'Original revision changed');
}
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  data = canonicalPackingList();
  trash = [];
  receipts.clear();
  source = 'https://fixture.supabase.invalid';
  disposed = false;
  allowed = true;
  revalidate = async () => {};
  lose = redacted = false;
  const s = data.scope;
  session = {
    userId: s.user_id,
    personId: s.person_id,
    familyId: s.family_id,
    user: { username: 'Packing member', email: 'packing@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  };
  repo = new FamilyFrontendRepository(async () => session);
  await repo.session();
  const ids = (await repo.views()).ids;
  native = ids.register('trip', s.trip_id);
  vi.spyOn(repo.readers, 'listTripTravelers').mockResolvedValue([
    { personId: s.person_id, displayName: 'Current Person', color: null },
    { personId: id(7), displayName: 'Other Person', color: null },
  ]);
  useTripStore.setState({ trip: { id: native, title: 'Packing test', user_id: 0 } as never });
  readRpc.mockReset().mockImplementation(async (name, args) => {
    if (name === 'get_family_trip_packing_v1') return structuredClone(data);
    if (name === 'list_family_trip_packing_trash_v1')
      return {
        version: 1,
        scope: data.scope,
        collection_revision: data.collection_revision,
        items: structuredClone(trash),
        next_cursor: null,
      };
    const r = receipts.get(String(args.p_operation_id));
    return {
      version: 1,
      trip_id: s.trip_id,
      operation_id: args.p_operation_id,
      scope: data.scope,
      status: r ? 'committed' : 'unknown',
      result_redacted: !!r && redacted,
      result: r && !redacted ? r.ack : null,
    };
  });
  rpc.mockReset().mockImplementation(async (_name, args) => {
    const command = packingCommand.parse({
      version: 1,
      scope: args.p_scope,
      operation_id: args.p_operation_id,
      action: args.p_action,
      target_id: args.p_target_id,
      expected_revision: args.p_expected_revision,
      expected_collection_revision: args.p_expected_collection_revision,
      values: args.p_values,
    });
    if (!allowed) throw new FamilyApiError(403, 'denied', 'Denied');
    const prior = receipts.get(command.operation_id);
    if (prior) {
      if (prior.body !== packingJson(command)) refusal();
      return structuredClone(prior.ack);
    }
    const row = command.target_id ? [...data.items, ...trash].find((r) => r.id === command.target_id) : null;
    if (command.action !== 'create' && command.action !== 'reorder' && row?.revision !== command.expected_revision)
      refusal();
    if (command.action === 'reorder' && command.expected_collection_revision !== data.collection_revision) refusal();
    const ack = canonicalPackingAck(command);
    if (ack.item && row) {
      ack.item = { ...structuredClone(row), ...ack.item, revision: row.revision + 2 };
      // The fixture helper supplies default values; preserve source values for fields outside this command.
      const next = {
        ...structuredClone(row),
        revision: row.revision + 2,
        deleted_at: command.action === 'trash' ? at : null,
        deleted_by_person_id: command.action === 'trash' ? s.person_id : null,
      };
      if (command.action === 'update') Object.assign(next, command.values);
      if (command.action === 'packed-state') {
        if ('checked' in command.values) {
          next.checked = command.values.checked;
          next.packed_quantity = null;
        } else {
          const count = command.values.packed_quantity ?? 0;
          next.checked = count === next.quantity;
          next.packed_quantity = count > 0 && count < next.quantity ? count : null;
        }
      }
      ack.item = next;
    }
    if (command.action === 'create' && ack.item) ack.item.sort_order = data.items.length;
    if (command.action === 'reorder') {
      data.items = command.values.ids.map((uuid, index) => ({
        ...(data.items.find((r) => r.id === uuid) ?? refusal()),
        sort_order: index,
      }));
    } else if (ack.item) {
      const savedId = ack.item.id;
      data.items = data.items.filter((r) => r.id !== savedId);
      trash = trash.filter((r) => r.id !== savedId);
      if (command.action === 'trash') trash.push(ack.item);
      else data.items.push(ack.item);
      data.items.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
    }
    data.collection_revision++;
    data.trash_count = trash.length;
    ack.collection_revision = data.collection_revision;
    receipts.set(command.operation_id, { body: packingJson(command), ack: structuredClone(ack) });
    if (lose) {
      lose = false;
      throw new Error('Response lost after commit');
    }
    return structuredClone(ack);
  });
  writer = new PlannerCohortPacking(
    repo,
    { source: () => source, disposed: () => disposed, allowed: () => allowed, revalidate: () => revalidate() },
    createPackingTransport(readRpc)
  );
  api.defaults.adapter = createFamilyAxiosAdapter(
    createPackingCommandHandler(
      repo,
      () => source,
      () => disposed,
      rpc
    )
  );
  stop = installFamilyCommandRetention();
  publish();
  stopPort = installPlannerPackingPort(writer);
  useAuthStore.setState({ user: buildUser({ id: ids.register('person', s.person_id), role: 'admin' }) });
});
afterEach(async () => {
  cleanup();
  stopPort();
  stop();
  api.defaults.adapter = priorAdapter;
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});

function Row() {
  const item = useTripStore((s) => s.packingItems[0]);
  return item ? (
    <ArtikelZeile
      item={item}
      tripId={native}
      categories={['Clothes', 'Gear']}
      onCategoryChange={() => {}}
      onCreateBag={async () => undefined}
      canEdit
      bagTrackingEnabled
      bags={writer.snapshot()?.bags}
    />
  ) : null;
}
function itemActions() {
  return renderHook(() =>
    usePackingItemActions({
      tripId: native,
      items: useTripStore((s) => s.packingItems),
      view: 'common',
      currentUserId: 1,
      categories: ['Clothes'],
      defaultCategory: 'Other',
      actions: useTripStore.getState(),
      t: (k) => k,
      toast,
      placeholderFrom: 'items',
    })
  );
}
it('native slice refuses missing/forged origins before an optimistic, raw, cache or command effect', async () => {
  const before = useTripStore.getState().packingItems;
  await expect(
    useTripStore.getState().updatePackingItem(native, currentItem().id, { name: 'Unobserved' })
  ).rejects.toThrow('original packing draft');
  const forged = { current: () => true, close: () => {}, save: vi.fn(), trash: vi.fn() };
  await expect(
    useTripStore.getState().updatePackingItem(native, currentItem().id, { name: 'Forged' }, forged)
  ).rejects.toThrow();
  expect(useTripStore.getState().packingItems).toBe(before);
  expect(rpc).not.toHaveBeenCalled();
  expect(await offlineDb.packingItems.count()).toBe(0);
});
it('slice binds a create and refuses moving its authority to another item or Trip', async () => {
  const origin = required(bindPackingOrigin(null, native));
  await expect(useTripStore.getState().addPackingItem(native + 1, { name: 'Foreign' }, origin)).rejects.toThrow();
  await expect(
    useTripStore.getState().updatePackingItem(native, currentItem().id, { name: 'Wrong target' }, origin)
  ).rejects.toThrow();
  await useTripStore.getState().addPackingItem(native, { name: 'New' }, origin);
  expect(data.items.map((r) => r.name)).toContain('New');
  expect(await offlineDb.packingItems.count()).toBe(0);
});
it('desktop Enter+blur coalesces under a single original operation and uses the canonical answer', async () => {
  render(<Row />);
  fireEvent.click(screen.getByRole('button', { name: 'Raincoat' }));
  const name = required(
    screen.getAllByRole('textbox').find((el) => el.getAttribute('type') === 'text' && !el.getAttribute('inputmode'))
  );
  fireEvent.change(name, { target: { value: 'Storm coat' } });
  fireEvent.keyDown(name, { key: 'Enter' });
  fireEvent.blur(name);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Storm coat' })).toBeVisible());
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
it('desktop draft retains the opening revision and typed value when a newer row is published', async () => {
  render(<Row />);
  fireEvent.click(screen.getByRole('button', { name: 'Raincoat' }));
  const name = required(
    screen.getAllByRole('textbox').find((el) => el.getAttribute('type') === 'text' && !el.getAttribute('inputmode'))
  );
  fireEvent.change(name, { target: { value: 'My draft' } });
  await act(async () => {
    data.items[0].revision++;
    data.items[0].name = 'Other editor';
    publish();
  });
  expect(name).toHaveValue('My draft');
  fireEvent.keyDown(name, { key: 'Enter' });
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  expect(rpc.mock.calls[0][1].p_expected_revision).toBe(3);
  expect(data.items[0].name).toBe('Other editor');
  await waitFor(async () => expect(await offlineDb.mutationQueue.toArray()).toMatchObject([{ status: 'conflict' }]));
});
it('desktop quantity keeps a slow draft and submits one integer rather than partial keystrokes', async () => {
  render(<Row />);
  const qty = required(
    screen
      .getAllByRole('textbox')
      .find((el) => el.getAttribute('inputmode') === 'numeric' && el.getAttribute('value') === '3')
  );
  fireEvent.focus(qty);
  fireEvent.change(qty, { target: { value: '12' } });
  expect(rpc).not.toHaveBeenCalled();
  fireEvent.blur(qty);
  await waitFor(() => expect(data.items[0].quantity).toBe(12));
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[0][1].p_values).toEqual({ quantity: 12 });
});
it('desktop weight captures its revision at focus and leaves typed text intact during a live update', async () => {
  render(<Row />);
  const field = required(screen.getAllByRole('textbox').find((el) => el.getAttribute('value') === '350'));
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: '500' } });
  await act(async () => {
    data.items[0].revision++;
    data.items[0].weight_grams = 400;
    publish();
  });
  expect(field).toHaveValue('500');
  fireEvent.blur(field);
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  expect(rpc.mock.calls[0][1].p_expected_revision).toBe(3);
  expect(data.items[0].weight_grams).toBe(400);
});
it('an unresolved draft retries the exact original and cannot become a different edit', async () => {
  const draft = createPackingDraft(native);
  draft.begin(currentItem());
  setForcedOffline(true);
  const write: Parameters<ReturnType<typeof createPackingDraft>['save']>[1] = (values, origin) =>
    useTripStore.getState().updatePackingItem(native, currentItem().id, values, origin);
  await expect(draft.save({ name: 'Offline' }, write)).rejects.toBeDefined();
  const row = (await offlineDb.mutationQueue.toArray())[0];
  await expect(draft.save({ name: 'Changed' }, write)).rejects.toThrow('unchanged');
  setForcedOffline(false);
  await draft.save({ name: 'Offline' }, write);
  expect(rpc.mock.calls[0][1].p_operation_id).toBe(row.id);
});
it.each(['actor', 'source', 'layer', 'logout', 'closed'] as const)(
  'a %s change retires the form and its late callbacks',
  async (kind) => {
    const draft = createPackingDraft(native);
    draft.begin(currentItem());
    const owned = draft.guard();
    if (kind === 'actor') repo.acceptSession({ ...session, personId: id(99) });
    if (kind === 'source') source = 'https://other.invalid';
    if (kind === 'layer') repo.setLayer(data.scope.trip_id, 'myDraft');
    if (kind === 'logout') invalidateOfflineSession();
    if (kind === 'closed') draft.dispose();
    expect(owned()).toBe(false);
    await expect(
      draft.save({ name: 'Late' }, (v, o) => useTripStore.getState().updatePackingItem(native, currentItem().id, v, o))
    ).rejects.toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  }
);
it('two independent create drafts can deliberately create the same name twice', async () => {
  data = canonicalPackingList({}, true);
  publish();
  for (let i = 0; i < 2; i++) {
    const draft = createPackingDraft(native);
    draft.begin(null);
    await draft.save({ name: 'Passport' }, (v, o) =>
      useTripStore.getState().addPackingItem(native, { ...v, name: required(v.name) }, o)
    );
  }
  expect(new Set(data.items.map((r) => r.id)).size).toBe(2);
  expect(data.items.map((r) => r.name)).toEqual(['Passport', 'Passport']);
});
it('native create composer must open before it can submit a canonical item', async () => {
  const h = itemActions();
  await act(async () => {
    expect(await h.result.current.addItemToCategory('Clothes', 'Unobserved')).toBe(false);
  });
  expect(rpc).not.toHaveBeenCalled();
  await act(async () => {
    h.result.current.beginItem('Clothes');
    await h.result.current.addItemToCategory('Clothes', 'New clothes');
  });
  expect(data.items.map((r) => r.name)).toContain('New clothes');
});
it('filled placeholders become real items, and the next deliberate create gets a new identity', async () => {
  data.items[0].name = '...';
  publish();
  const original = data.items[0].id,
    h = itemActions();
  await act(async () => {
    h.result.current.beginItem('Clothes');
    await h.result.current.addItemToCategory('Clothes', 'First');
  });
  await act(async () => {
    h.result.current.beginItem('Clothes');
    await h.result.current.addItemToCategory('Clothes', 'Second');
  });
  expect(data.items.find((r) => r.id === original)?.name).toBe('First');
  expect(data.items.map((r) => r.name)).toEqual(['First', 'Second']);
});
it('single last-item Trash bypasses the native placeholder update sequence', async () => {
  const h = itemActions();
  await act(async () => {
    await h.result.current.deleteItem(currentItem());
  });
  expect(data.items).toEqual([]);
  expect(trash[0].name).toBe('Raincoat');
  expect(rpc.mock.calls.map(([, a]) => a.p_action)).toEqual(['trash']);
});
it('category/bulk actions refuse before the first item mutation', async () => {
  const h = itemActions();
  for (const action of [
    () => h.result.current.renameCategory('Clothes', 'Renamed'),
    () => h.result.current.deleteCategoryItems(useTripStore.getState().packingItems),
    () => h.result.current.clearChecked(),
  ])
    await expect(action()).rejects.toThrow('group action');
  expect(rpc).not.toHaveBeenCalled();
  expect(data.items[0].name).toBe('Raincoat');
});
it('canonical checkbox/count/reorder require their rendered observations, never the latest store fallback', async () => {
  const row = currentItem(),
    store = useTripStore.getState();
  await expect(store.togglePackingItem(native, row.id, true)).rejects.toThrow('observation');
  await expect(store.setPackedCount(native, row.id, 2)).rejects.toThrow('observation');
  await expect(store.reorderPackingItems(native, [row.id])).rejects.toThrow('observation');
  expect(rpc).not.toHaveBeenCalled();
  await store.setPackedCount(native, row.id, 2, ...packingRowArgs(row));
  expect(currentItem().packed_quantity).toBe(2);
  await store.togglePackingItem(native, currentItem().id, true, ...packingRowArgs(currentItem()));
  expect(currentItem().checked).toBe(1);
  await store.reorderPackingItems(native, [currentItem().id], ...packingSetArgs(useTripStore.getState().packingItems));
});
it('read-only saved sessions refuse even a valid original before sending or optimistic state', async () => {
  const item = currentItem(),
    origin = bindPackingOrigin(item, native),
    before = useTripStore.getState().packingItems,
    release = installReadOnlySession();
  try {
    await expect(
      useTripStore.getState().updatePackingItem(native, item.id, { name: 'Forbidden' }, origin)
    ).rejects.toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
    expect(useTripStore.getState().packingItems).toBe(before);
  } finally {
    release();
  }
});
it('native store subscribers and snapshot subscribers observe the same canonical publication', async () => {
  const records: Array<[string[], string[] | undefined]> = [];
  const observe = () =>
    records.push([
      useTripStore.getState().packingItems.map((r) => r.name),
      writer.snapshot()?.items.map((r) => r.name),
    ]);
  const a = useTripStore.subscribe(observe),
    b = writer.subscribe(observe);
  await useTripStore
    .getState()
    .updatePackingItem(native, currentItem().id, { name: 'Together' }, bindPackingOrigin(currentItem(), native));
  a();
  b();
  expect(records.length).toBeGreaterThan(0);
  expect(records.every(([items, view]) => JSON.stringify(items) === JSON.stringify(view))).toBe(true);
});
it('bags and assignees use the owned snapshot, including authoritative hidden weight and an empty replacement', async () => {
  const raw = vi.spyOn(packingApi, 'listBags'),
    assign = vi.spyOn(packingApi, 'getCategoryAssignees');
  const h = renderHook(() => ({
    bags: usePackingBags({ tripId: native, bagTrackingEnabled: true, t: (k) => k, toast }),
    assignees: usePackingCategoryAssignees({ tripId: native, t: (k) => k, toast }),
  }));
  expect(h.result.current.bags.bags[0].total_weight_grams).toBe(2200);
  expect(h.result.current.assignees.categoryAssignees.Clothes[0].username).toBe('Current Person');
  expect(raw).not.toHaveBeenCalled();
  expect(assign).not.toHaveBeenCalled();
  await act(async () => {
    data = canonicalPackingList({}, true);
    publish();
  });
  expect(h.result.current.bags.bags).toEqual([]);
  expect(h.result.current.assignees.categoryAssignees).toEqual({});
});
it('import/template/sharing/bag writes refuse before any raw HTTP, append or command', async () => {
  const imports = renderHook(() => usePackingImport({ tripId: native, t: (k) => k, toast, onImported: vi.fn() })),
    templates = renderHook(() =>
      usePackingTemplates({ tripId: native, view: 'common', t: (k) => k, toast, onApplied: vi.fn(), onSaved: vi.fn() })
    ),
    bags = renderHook(() => usePackingBags({ tripId: native, bagTrackingEnabled: true, t: (k) => k, toast }));
  const bulk = vi.spyOn(packingApi, 'bulkImport'),
    apply = vi.spyOn(packingApi, 'applyTemplate'),
    create = vi.spyOn(packingApi, 'createBag'),
    share = vi.spyOn(packingApi, 'setSharing');
  act(() => imports.result.current.setText('New item'));
  await expect(imports.result.current.runImport()).rejects.toThrow('group action');
  await expect(templates.result.current.applyTemplate(1)).rejects.toThrow('group action');
  await act(async () => {
    await bags.result.current.createBag('New');
  });
  await expect(useTripStore.getState().setPackingItemSharing(native, currentItem().id, 'common', [])).rejects.toThrow(
    'group action'
  );
  expect(bulk).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
  expect(share).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
it('phone sheet preserves its original revision through live row replacement', async () => {
  const close = vi.fn();
  function Phone() {
    const items = useTripStore((s) => s.packingItems);
    return (
      <MPackItemSheet
        planner={buildPlanner({ tripId: native, packingItems: items, tripActions: useTripStore.getState() })}
        open
        itemId={items[0]?.id ?? null}
        bagTrackingEnabled
        tripMembers={[]}
        currentUserId={1}
        onClose={close}
      />
    );
  }
  render(<Phone />);
  const name = screen.getByDisplayValue('Raincoat');
  fireEvent.change(name, { target: { value: 'My phone draft' } });
  await act(async () => {
    data.items[0].revision++;
    data.items[0].name = 'Newer';
    publish();
  });
  expect(name).toHaveValue('My phone draft');
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  expect(rpc.mock.calls[0][1].p_expected_revision).toBe(3);
  expect(close).not.toHaveBeenCalled();
  expect(data.items[0].name).toBe('Newer');
});
it('unmounting the phone sheet after SQL commit retires late close/toast and retains the original for recovery', async () => {
  const close = vi.fn();
  let resume = () => {};
  const held = new Promise<void>((r) => {
    resume = r;
  });
  const actual = required(rpc.getMockImplementation());
  rpc.mockImplementation(async (...args) => {
    const ack = await actual(...args);
    await held;
    return ack;
  });
  const item = currentItem(),
    view = render(
      <MPackItemSheet
        planner={buildPlanner({ tripId: native, packingItems: [item], tripActions: useTripStore.getState() })}
        open
        itemId={item.id}
        bagTrackingEnabled
        tripMembers={[]}
        currentUserId={1}
        onClose={close}
      />
    );
  fireEvent.change(screen.getByDisplayValue('Raincoat'), { target: { value: 'Committed late' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(receipts.size).toBe(1));
  view.unmount();
  resume();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(close).not.toHaveBeenCalled();
  expect(await offlineDb.mutationQueue.count()).toBe(1);
});
it('packing authority remains direct in either itinerary layer; proposal authority cannot enable item writes', () => {
  const controller = {
    gov: { layer: 'myDraft', actionOutcomes: { 'trip.packing.manage': 'propose' }, canMutate: true },
    supportsAction: () => true,
    isCurrent: () => true,
  } as unknown as FamilyPermissionController;
  expect(familyCanDo('packing_edit', controller)).toBe(false);
  controller.gov.actionOutcomes['trip.packing.manage'] = 'direct';
  expect(familyCanDo('packing_edit', controller)).toBe(true);
});
it('the native Trash surface restores from its exact original owned page', async () => {
  await useTripStore.getState().deletePackingItem(native, currentItem().id, bindPackingOrigin(currentItem(), native));
  render(<FamilyPackingTrash />);
  fireEvent.click(screen.getByRole('button', { name: /Packing.*Trash/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
  await waitFor(() => expect(data.items[0]?.name).toBe('Raincoat'));
  expect(rpc.mock.calls.map(([, a]) => a.p_action)).toEqual(['trash', 'restore']);
});

it('a failed weight save stays typed and retries the exact original operation', async () => {
  render(<Row />);
  const field = required(screen.getAllByRole('textbox').find((el) => el.getAttribute('value') === '350'));
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: '500' } });
  lose = true;
  fireEvent.blur(field);
  await waitFor(async () => expect(await offlineDb.mutationQueue.count()).toBe(1));
  await waitFor(() => expect(field).toHaveValue('500'));
  const row = (await offlineDb.mutationQueue.toArray())[0];
  expect(receipts.size).toBe(1);
  await act(async () => publish());
  expect(field).toHaveValue('500');
  fireEvent.focus(field);
  fireEvent.blur(field);
  await waitFor(async () => expect(await offlineDb.mutationQueue.count()).toBe(0));
  expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[1][1]);
  expect(rpc.mock.calls[1][1].p_operation_id).toBe(row.id);
  expect(data.items).toHaveLength(1);
  expect(data.items[0].weight_grams).toBe(500);
});
it('Trash pagination restores from the original second page, never a merged display object', async () => {
  data.items = [];
  trash = Array.from({ length: 51 }, (_, i) =>
    canonicalPackingRow({
      id: id(100 + i),
      name: 'Deleted ' + i,
      deleted_at: at,
      deleted_by_person_id: data.scope.person_id,
    })
  );
  data.trash_count = trash.length;
  publish();
  const read = required(readRpc.getMockImplementation());
  readRpc.mockImplementation(async (name, args) => {
    if (name !== 'list_family_trip_packing_trash_v1') return read(name, args);
    const after = String(args.p_before_id ?? ''),
      rows = trash.filter((r) => r.id > after).slice(0, 50),
      last = rows[rows.length - 1];
    return {
      version: 1,
      scope: data.scope,
      collection_revision: data.collection_revision,
      items: structuredClone(rows),
      next_cursor: rows.length === 50 ? { id: last.id, deleted_at: last.deleted_at } : null,
    };
  });
  const restore = vi.spyOn(writer, 'restore');
  render(<FamilyPackingTrash />);
  fireEvent.click(screen.getByRole('button', { name: /Packing.*Trash/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
  const row = await screen.findByText('Deleted 50');
  fireEvent.click(within(required(row.closest('li'))).getByRole('button', { name: 'Restore' }));
  await waitFor(() => expect(data.items[0]?.name).toBe('Deleted 50'));
  expect(restore.mock.calls[0][0].items).toHaveLength(1);
  expect(restore.mock.calls[0][0].items[0].name).toBe('Deleted 50');
});

it('item availability follows the installed owner; removing it immediately closes the authoring gate', () => {
  expect(plannerActionAvailable('packing_edit')).toBe(true);
  stopPort();
  expect(plannerActionAvailable('packing_edit')).toBe(false);
});
it('failed quantity saves preserve their typed draft through row refresh and retry the same operation', async () => {
  render(<Row />);
  const field = required(screen.getAllByRole('textbox').find((el) => el.getAttribute('value') === '3'));
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: '5' } });
  lose = true;
  fireEvent.blur(field);
  await waitFor(async () => expect(await offlineDb.mutationQueue.count()).toBe(1));
  await waitFor(() => expect(field).toHaveValue('5'));
  await act(async () => publish());
  expect(field).toHaveValue('5');
  const row = (await offlineDb.mutationQueue.toArray())[0];
  fireEvent.focus(field);
  fireEvent.blur(field);
  await waitFor(async () => expect(await offlineDb.mutationQueue.count()).toBe(0));
  expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[1][1]);
  expect(rpc.mock.calls[1][1].p_operation_id).toBe(row.id);
  expect(data.items[0].quantity).toBe(5);
});

it('actual canonical packing enables native bag/weight consumers without enabling the global add-on', () => {
  const h = renderHook(() => usePackingBagTracking(native));
  expect(h.result.current).toBe(true);
  act(() => {
    stopPort();
    useTripStore.setState({ packingItems: [] });
  });
  h.rerender();
  expect(h.result.current).toBe(false);
});

it('an open numeric draft stays visible but read-only during a temporary permission pause', async () => {
  const item = currentItem();
  const props = {
    item,
    tripId: native,
    categories: ['Clothes'],
    onCategoryChange: () => {},
    onCreateBag: async () => undefined,
    bagTrackingEnabled: true,
  };
  const h = render(<ArtikelZeile {...props} canEdit />),
    field = required(screen.getAllByRole('textbox').find((el) => el.getAttribute('value') === '3'));
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: '7' } });
  h.rerender(<ArtikelZeile {...props} canEdit={false} />);
  expect(field).toHaveValue('7');
  expect(field).toHaveAttribute('readonly');
  const checkbox = required(h.container.querySelector<HTMLButtonElement>('.packing-check'));
  expect(checkbox).toBeDisabled();
  fireEvent.click(checkbox);
  expect(rpc).not.toHaveBeenCalled();
  fireEvent.blur(field);
  expect(rpc).not.toHaveBeenCalled();
  h.rerender(<ArtikelZeile {...props} canEdit />);
  fireEvent.blur(field);
  await waitFor(() => expect(data.items[0].quantity).toBe(7));
  expect(rpc).toHaveBeenCalledTimes(1);
});

it('a paused create composer stays mounted and cannot turn its autofocus into a second draft', async () => {
  const h = itemActions(),
    item = currentItem();
  const props = {
    kategorie: 'Clothes',
    items: [item],
    tripId: native,
    allCategories: ['Clothes'],
    onRename: vi.fn(),
    onDeleteAll: vi.fn(),
    onDeleteItem: vi.fn(),
    onAddItem: (category: string, name: string) => h.result.current.addItemToCategory(category, name),
    onBeginItem: (category: string) => h.result.current.beginItem(category),
    onCancelItem: (category: string) => h.result.current.cancelItem(category),
    assignees: [],
    tripMembers: [],
    onSetAssignees: vi.fn(),
    onCreateBag: async () => undefined,
    allItems: [item],
    onReorder: vi.fn(),
  };
  const display = render(<KategorieGruppe {...props} canEdit />);
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
  const field = screen.getByPlaceholderText('Item name...');
  fireEvent.change(field, { target: { value: 'Passport' } });
  const original = required(rpc.getMockImplementation());
  let resume = () => {};
  const held = new Promise<void>((r) => {
    resume = r;
  });
  rpc.mockImplementation(async (...args) => {
    const ack = await original(...args);
    await held;
    return ack;
  });
  fireEvent.keyDown(field, { key: 'Enter' });
  await waitFor(() => expect(receipts.size).toBe(1));
  display.rerender(<KategorieGruppe {...props} canEdit={false} />);
  expect(screen.getByPlaceholderText('Item name...')).toBe(field);
  expect(field).toHaveValue('Passport');
  expect(field).toHaveAttribute('readonly');
  display.rerender(<KategorieGruppe {...props} canEdit />);
  resume();
  await waitFor(() => expect(field).toHaveValue(''));
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(data.items.map((x) => x.name)).toEqual(['Raincoat', 'Passport']);
});

it('phone item editing opens a fresh original after a previous edit and Trash/Restore', async () => {
  const close = vi.fn();
  function Phone({ open }: { open: boolean }) {
    const items = useTripStore((s) => s.packingItems);
    return (
      <MPackItemSheet
        planner={buildPlanner({ tripId: native, packingItems: items, tripActions: useTripStore.getState() })}
        open={open}
        itemId={open ? itemId : null}
        bagTrackingEnabled
        tripMembers={[]}
        currentUserId={1}
        onClose={close}
      />
    );
  }
  const itemId = currentItem().id,
    h = render(<Phone open />);
  fireEvent.change(screen.getByDisplayValue('Raincoat'), { target: { value: 'Phone one' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  h.rerender(<Phone open={false} />);
  await act(async () => {
    await useTripStore.getState().deletePackingItem(native, itemId, bindPackingOrigin(currentItem(), native));
    const page = await writer.trashPage();
    await writer.restore(page, page.items[0]);
  });
  h.rerender(<Phone open />);
  fireEvent.change(screen.getByDisplayValue('Phone one'), { target: { value: 'Phone after restore' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(data.items[0].name).toBe('Phone after restore'));
  // Service mutation precedes queue acknowledgement and the owned editor close.
  await waitFor(() => expect(close).toHaveBeenCalledTimes(2));
  expect(rpc.mock.calls.map(([, args]) => args.p_action)).toEqual(['update', 'trash', 'restore', 'update']);
});

it('retiring an empty Family view cannot send late create/category callbacks into the ordinary writer', async () => {
  data = canonicalPackingList({}, true);
  publish();
  const h = itemActions();
  act(() => {
    h.result.current.beginItem('Other');
    h.result.current.setAddingCategory(true);
    h.result.current.setNewCategoryName('New list');
  });
  const original = h.result.current,
    raw = vi.spyOn(packingApi, 'create');
  stopPort();
  await act(async () => {
    expect(await original.addItemToCategory('Other', 'Late item')).toBe(false);
    await original.addNewCategory();
  });
  await expect(original.renameCategory('Other', 'Renamed')).rejects.toThrow('group action');
  expect(raw).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  expect(useTripStore.getState().packingItems).toEqual([]);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
  expect(await offlineDb.packingItems.count()).toBe(0);
});

it('a retired Shared-view callback cannot borrow the new My-list composer or create a public item', async () => {
  const h = renderHook(
    ({ view }: { view: 'common' | 'personal' }) =>
      usePackingItemActions({
        tripId: native,
        items: useTripStore((s) => s.packingItems),
        view,
        currentUserId: 1,
        categories: ['Clothes'],
        defaultCategory: 'Other',
        actions: useTripStore.getState(),
        t: (k) => k,
        toast,
        placeholderFrom: 'items',
      }),
    { initialProps: { view: 'common' as 'common' | 'personal' } }
  );
  const old = h.result.current;
  act(() => old.beginItem('Clothes'));
  h.rerender({ view: 'personal' });
  act(() => h.result.current.beginItem('Clothes'));
  await act(async () => {
    expect(await old.addItemToCategory('Clothes', 'Must not become public')).toBe(false);
  });
  expect(rpc).not.toHaveBeenCalled();
  await act(async () => {
    expect(await h.result.current.addItemToCategory('Clothes', 'Personal passport')).toBe(true);
  });
  expect(data.items.find((x) => x.name === 'Personal passport')?.is_private).toBe(true);
});

it('a failed ancillary refresh cannot undo an acknowledged canonical save or grant permission to another write', async () => {
  revalidate = async () => {
    allowed = false;
    throw new FamilyApiError(409, 'planner_local_work', 'A competing read changed the planner.');
  };
  const draft = createPackingDraft(native);
  draft.begin(currentItem());
  await expect(
    draft.save({ name: 'Canonically saved' }, (values, origin) =>
      useTripStore.getState().updatePackingItem(native, currentItem().id, values, origin)
    )
  ).resolves.toMatchObject({ name: 'Canonically saved' });
  expect(draft.guard()()).toBe(true);
  expect(useTripStore.getState().packingItems[0]?.name).toBe('Canonically saved');
  expect(await offlineDb.mutationQueue.count()).toBe(0);
  const next = createPackingDraft(native);
  next.begin(currentItem());
  await expect(
    next.save({ name: 'Must stay refused' }, (values, origin) =>
      useTripStore.getState().updatePackingItem(native, currentItem().id, values, origin)
    )
  ).rejects.toMatchObject({ code: 'packing_access_denied' });
  expect(rpc).toHaveBeenCalledTimes(1);
});

it('the phone sheet keeps its original draft read-only until current packing permission is available', async () => {
  let permitted = true;
  const props = () => ({
    planner: buildPlanner({
      tripId: native,
      packingItems: useTripStore.getState().packingItems,
      tripActions: useTripStore.getState(),
      can: () => permitted,
    }),
    open: true,
    itemId: currentItem().id,
    bagTrackingEnabled: true,
    tripMembers: [],
    currentUserId: 1,
    onClose: vi.fn(),
  });
  const h = render(<MPackItemSheet {...props()} />);
  fireEvent.change(required(screen.getAllByRole('textbox')[0]), { target: { value: 'Typed before pause' } });
  permitted = false;
  h.rerender(<MPackItemSheet {...props()} />);
  expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
  expect(screen.getAllByRole('textbox')[0]).toHaveAttribute('readonly');
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  expect(rpc).not.toHaveBeenCalled();
  permitted = true;
  h.rerender(<MPackItemSheet {...props()} />);
  expect(screen.getAllByRole('textbox')[0]).toHaveValue('Typed before pause');
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(useTripStore.getState().packingItems[0]?.name).toBe('Typed before pause'));
});
