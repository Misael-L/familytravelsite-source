import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { bagAck, bagSnapshot } from '../../../tests/helpers/familyPackingBags';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { act, cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api, { packingApi } from '../../api/client';
import { BagCard } from '../../components/Packing/PackingListPanelBagCard';
import { usePackingBags } from '../../components/Packing/usePackingBags';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { installReadOnlySession } from '../../db/readOnlySession';
import MBagsSheet from '../../mobile/screens/trip/tabs/MBagsSheet';
import { packingBagActionsAvailable } from '../../repo/plannerPackingBagPort';
import { installPlannerPackingPort, packingGroupActionsAvailable } from '../../repo/plannerPackingPort';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { createPackingBagCommandHandler } from './packingBagCommandHandler';
import { packingBagEnvelope, type PackingBagEnvelope, type PackingBagSnapshot } from './packingBagContract';
import { PlannerCohortPacking } from './plannerCohortPacking';
import { projectPacking } from './plannerPacking';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';
let state: PackingBagSnapshot,
  writer: PlannerCohortPacking,
  repo: FamilyFrontendRepository,
  session: FamilySession,
  native: number,
  source: string,
  allowed: boolean,
  disposed: boolean,
  stop: () => void,
  off: () => void;
let hold: (() => Promise<void>) | null,
  lose: boolean,
  hidden: boolean,
  deleted: import('./packingBagContract').PackingBagObservation[];
const sdkRpc = vi.hoisted(() => vi.fn());
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => ({ rpc: sdkRpc }) }));
vi.mock('@family/backend/supabase/packingCategoryRoster', () => ({
  listPackingCategoryPeople: async () => [
    { personId: id(4), displayName: 'Owner', isGuest: false },
    { personId: id(7), displayName: 'Carrier', isGuest: true },
  ],
}));
const previous = api.defaults.adapter,
  commands: PackingBagEnvelope[] = [];
const toast = { error: vi.fn() };
function publish() {
  const ids = repo.knownViews()!.ids;
  const p = projectPacking(
    state.packing,
    ids,
    state.people.map((p) => ({ personId: p.id, displayName: p.display_name }))
  );
  writer.publish(state.packing, p);
  useTripStore.setState({ packingItems: p.items });
}
const bag = () => writer.snapshot()!.bags[0];
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  state = bagSnapshot();
  state.packing.items = [];
  state.packing.bags[0].total_weight_grams = 0;
  source = 'http://127.0.0.1:55931';
  allowed = true;
  disposed = false;
  lose = false;
  hidden = false;
  deleted = [];
  hold = null;
  commands.length = 0;
  toast.error.mockClear();
  const s = state.scope;
  session = {
    userId: s.user_id,
    familyId: s.family_id,
    personId: s.person_id,
    user: { username: 'Owner', email: 'bag@fixture.invalid', avatar_url: null, created_at: '2026-11-12' },
  };
  repo = new FamilyFrontendRepository(
    async () => session,
    undefined,
    () => ({ userId: session.userId, familyId: session.familyId, personId: session.personId, source })
  );
  await repo.session();
  vi.spyOn(repo.readers, 'listTripTravelers').mockResolvedValue(
    state.people.map((p) => ({ personId: p.id, displayName: p.display_name, color: null }))
  );
  native = (await repo.views()).ids.register('trip', s.trip_id);
  useTripStore.setState({ trip: { id: native, title: 'Native bags', user_id: 0 } as never });
  sdkRpc.mockReset().mockImplementation(async (name, args) => {
    if (name === 'get_family_trip_packing_bags_v1') return { data: structuredClone(state), error: null };
    if (name === 'get_family_trip_packing_v1') return { data: structuredClone(state.packing), error: null };
    if (name === 'list_family_trip_packing_bag_trash_v1')
      return {
        data: {
          version: 1,
          kind: 'packing-bag-trash',
          scope: state.scope,
          collection_revision: state.collection_revision,
          bags: deleted,
          next_cursor: null,
        },
        error: null,
      };
    if (name === 'execute_family_trip_packing_bag_v1') {
      if (hold) await hold();
      const p = packingBagEnvelope.parse({
        version: 1,
        source_url: source,
        view_layer: 'published',
        command: {
          version: 1,
          kind: 'packing-bag',
          scope: args.p_scope,
          operation_id: args.p_operation_id,
          action: args.p_action,
          target_id: args.p_target_id,
          expected_revision: args.p_expected_revision,
          expected_collection_revision: args.p_expected_collection_revision,
          observed: args.p_observed,
          values: args.p_values,
        },
      });
      commands.push(p);
      if (
        !allowed ||
        p.command.expected_collection_revision !== state.collection_revision ||
        (p.command.action === 'bag-trash-empty' && hidden)
      )
        return { data: null, error: { code: 'PT409' } };
      const a = bagAck(p),
        b = a.bag;
      state.collection_revision = a.collection_revision;
      state.packing.collection_revision = a.collection_revision;
      state.bags = state.bags.filter((o) => o.bag.id !== b.id);
      state.packing.bags = state.packing.bags.filter((x) => x.id !== b.id);
      if (b.deleted_at === null) {
        const o = {
          version: 1 as const,
          kind: 'packing-bag-observation' as const,
          scope: state.scope,
          collection_revision: state.collection_revision,
          bag: b,
          member_person_ids: a.member_person_ids,
        };
        state.bags.push(o);
        const { revision, deleted_at, deleted_by_person_id, ...old } = b;
        void revision;
        void deleted_at;
        void deleted_by_person_id;
        state.packing.bags.push({ ...old, member_person_ids: a.member_person_ids, total_weight_grams: 0 });
      }
      deleted = deleted.filter((o) => o.bag.id !== b.id);
      if (b.deleted_at !== null)
        deleted.push({
          version: 1,
          kind: 'packing-bag-observation',
          scope: state.scope,
          collection_revision: state.collection_revision,
          bag: b,
          member_person_ids: a.member_person_ids,
        });
      deleted.forEach((o) => (o.collection_revision = state.collection_revision));
      state.bags.forEach((o) => (o.collection_revision = state.collection_revision));
      if (lose) {
        lose = false;
        throw Error('Reply lost');
      }
      return { data: a, error: null };
    }
    throw Error('Unexpected RPC ' + name);
  });
  writer = new PlannerCohortPacking(repo, {
    bags: true,
    source: () => source,
    disposed: () => disposed,
    allowed: () => allowed,
  });
  api.defaults.adapter = createFamilyAxiosAdapter(
    createPackingBagCommandHandler(
      repo,
      () => source,
      () => disposed
    )
  );
  stop = installFamilyCommandRetention();
  publish();
  off = installPlannerPackingPort(writer);
});
afterEach(async () => {
  cleanup();
  off();
  stop();
  api.defaults.adapter = previous;
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
it('keeps generic import/template/sharing gates closed while enabling only bags', () => {
  expect(packingGroupActionsAvailable()).toBe(false);
  expect(packingBagActionsAvailable(native)).toBe(true);
  expect(packingBagActionsAvailable(native, false)).toBe(false);
});
it.each(['name', 'color', 'limit', 'members', 'trash', 'create'] as const)(
  'routes native %s through its exact retained typed handler',
  async (action) => {
    const o = writer.bags!.bind(native, action === 'create' ? null : bag());
    if (action === 'name') await o.save({ name: 'Cabin renamed' });
    if (action === 'color') await o.save({ color: '#112233' });
    if (action === 'limit') await o.save({ weight_limit_grams: null });
    if (action === 'members') await o.members([repo.knownViews()!.ids.register('person', id(7))]);
    if (action === 'trash') await o.trash();
    if (action === 'create') await o.save({ name: 'Cabin bag' });
    expect(commands).toHaveLength(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(commands[0].command.target_id).toBe(action === 'create' ? commands[0].command.target_id : id(6));
    if (action === 'create') expect(new Set(writer.snapshot()!.bags.map((b) => b.id)).size).toBe(2);
  }
);
it('coalesces Enter/blur while the original save is slow', async () => {
  let release!: () => void;
  hold = () => new Promise<void>((r) => (release = r));
  const o = writer.bags!.bind(native, bag());
  const a = o.save({ name: 'Once' }),
    b = o.save({ name: 'Once' });
  await waitFor(() => expect(release).toBeTypeOf('function'));
  release();
  await Promise.all([a, b]);
  expect(commands).toHaveLength(1);
});
it('does not replace a lost reply with a new operation or drop the retained original', async () => {
  lose = true;
  const o = writer.bags!.bind(native, bag());
  await expect(o.save({ name: 'Lost' })).rejects.toBeDefined();
  const row = (await offlineDb.mutationQueue.toArray())[0];
  expect(row.body).toMatchObject({ command: { operation_id: commands[0].command.operation_id } });
  await expect(o.save({ name: 'Changed' })).rejects.toBeDefined();
  expect((await offlineDb.mutationQueue.toArray())[0]).toEqual(row);
});
it.each(['scope', 'publication', 'retire', 'account', 'trip', 'permission', 'offline', 'readonly'] as const)(
  'refuses a stale %s editor without raw fallback',
  async (cause) => {
    const raw = vi.spyOn(packingApi, 'updateBag');
    const o = writer.bags!.bind(native, bag());
    let release = () => {};
    if (cause === 'scope') source = 'http://127.0.0.1:55831';
    if (cause === 'publication') {
      state.collection_revision++;
      state.packing.collection_revision++;
      state.bags.forEach((o) => o.collection_revision++);
      publish();
    }
    if (cause === 'retire') invalidateOfflineSession();
    if (cause === 'account') session = { ...session, userId: id(99) };
    if (cause === 'trip') useTripStore.setState({ trip: null });
    if (cause === 'permission') allowed = false;
    if (cause === 'offline') setForcedOffline(true);
    if (cause === 'readonly') release = installReadOnlySession();
    await expect(o.save({ name: 'Never' })).rejects.toBeDefined();
    expect(commands).toHaveLength(0);
    expect(raw).not.toHaveBeenCalled();
    release();
  }
);
function Harness({ phone = false }: { phone?: boolean }) {
  const port = writer;
  const p = port.snapshot()!;
  const hook = usePackingBags({ tripId: native, bagTrackingEnabled: true, t: (k) => k, toast });
  const b = hook.bags[0];
  if (!b) return null;
  const members = hook.people ?? [];
  return phone ? (
    <MBagsSheet
      planner={buildPlanner({ tripId: native, t: ((k: string) => k) as never })}
      open
      onClose={() => {}}
      bags={hook.bags}
      items={[]}
      tripMembers={members}
      canEdit
      currentUserId={null}
      onCreateBag={hook.createBag}
      onUpdateBag={hook.updateBag}
      onDeleteBag={hook.deleteBag}
      onSetBagMembers={hook.setBagMembers}
    />
  ) : (
    <BagCard
      bag={b}
      bagItems={p.items}
      totalWeight={0}
      pct={0}
      tripId={native}
      tripMembers={members}
      canEdit
      onDelete={() => void hook.deleteBag(b.id)}
      onUpdate={hook.updateBag}
      onSetMembers={hook.setBagMembers}
      t={(k: string) => k}
    />
  );
}
describe.each([false, true])('actual native phone=%s', (phone) => {
  it('keeps the name field until the typed save acknowledges, then shows canonical data', async () => {
    render(<Harness phone={phone} />);
    fireEvent.click(screen.getByRole('button', { name: bag().name }));
    const input = screen.getByDisplayValue(bag().name);
    fireEvent.change(input, { target: { value: 'Native renamed' } });
    let release!: () => void;
    hold = () => new Promise<void>((r) => (release = r));
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(release).toBeTypeOf('function'));
    expect(input).toBeInTheDocument();
    await act(async () => release());
    await waitFor(() => expect(commands).toHaveLength(1));
    await waitFor(() => expect(screen.queryByDisplayValue('Native renamed')).not.toBeInTheDocument());
    expect(writer.snapshot()!.bags[0].name).toBe('Native renamed');
  });
});

it('maps native Delete only to recoverable empty Trash and restores the same identity', async () => {
  const original = bag();
  await writer.bags!.bind(native, original).trash();
  expect(writer.snapshot()!.bags).toEqual([]);
  const page = await writer.bags!.trashPage();
  expect(page.bags[0].bag.id).toBe(id(6));
  await writer.bags!.restore(page, 0);
  expect(writer.snapshot()!.bags[0].id).toBe(original.id);
  expect(commands.map((p) => p.command.action)).toEqual(['bag-trash-empty', 'bag-restore']);
});
it('restores the observed Trash row when the displayed row changes after the click', async () => {
  const port = writer.bags;
  if (!port) throw Error('Missing packing bag port');
  const original = bag();
  await port.bind(native, original).trash();
  const page = await port.trashPage();
  const observed = structuredClone(page.bags[0]);

  const restoring = port.restore(page, 0);
  page.bags[0].bag.name = 'Changed local display';
  await restoring;

  expect(commands).toHaveLength(2);
  expect(commands[1].command).toMatchObject({ action: 'bag-restore', target_id: observed.bag.id, observed });
  expect(writer.snapshot()?.bags[0].name).toBe(original.name);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
it('refuses a Trash restore after the packing collection revision changes', async () => {
  const port = writer.bags;
  if (!port) throw Error('Missing packing bag port');
  await port.bind(native, bag()).trash();
  const page = await port.trashPage();
  state.collection_revision++;
  state.packing.collection_revision = state.collection_revision;
  publish();
  const calls = sdkRpc.mock.calls.length;

  await expect(port.restore(page, 0)).rejects.toThrow('The original bag observation changed.');
  expect(sdkRpc.mock.calls).toHaveLength(calls);
  expect(commands).toHaveLength(1);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
it('preserves bag and hidden occupancy when nonempty Trash is refused', async () => {
  hidden = true;
  const before = structuredClone(state);
  await expect(writer.bags!.bind(native, bag()).trash()).rejects.toBeDefined();
  expect(state).toEqual(before);
  expect(await offlineDb.mutationQueue.count()).toBe(1);
});
it('rejects copied or modified Trash pages instead of borrowing their authority', async () => {
  await writer.bags!.bind(native, bag()).trash();
  const page = await writer.bags!.trashPage();
  await expect(writer.bags!.restore(structuredClone(page), 0)).rejects.toBeDefined();
  page.bags[0].bag.name = 'Forged';
  await expect(writer.bags!.restore(page, 0)).rejects.toBeDefined();
  expect(commands).toHaveLength(1);
});
it('retains unchanged historical carriers but rejects adding an ineligible Person', async () => {
  state.people.find((p) => p.id === id(7))!.eligible = false;
  state.bags[0].member_person_ids = [];
  state.packing.bags[0].member_person_ids = [];
  publish();
  await expect(
    writer.bags!.bind(native, bag()).members([repo.knownViews()!.ids.register('person', id(7))])
  ).rejects.toBeDefined();
  expect(commands).toHaveLength(0);
});
