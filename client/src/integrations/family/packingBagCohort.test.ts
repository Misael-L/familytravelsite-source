import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { bagAck, bagSnapshot, bagUpdate } from '../../../tests/helpers/familyPackingBags';
import { snapshotV2 } from '../../../tests/helpers/familyPackingCategoryV2';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import { invalidateOfflineSession } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { PackingBagCohort } from './packingBagCohort';
import { createPackingBagTransport, type PackingBagRpc } from './packingBagTransport';
import { createPackingCategoryV2Transport, type PackingCategoryV2Rpc } from './packingCategoryV2Transport';
import { FamilyFrontendRepository, type FamilySession } from './repository';
let repo: FamilyFrontendRepository, session: FamilySession, source: string, current: boolean, native: number;
const rpc = vi.fn<PackingBagRpc>(),
  categories = vi.fn<PackingCategoryV2Rpc>();
const cohort = () =>
  new PackingBagCohort(
    repo,
    { source: () => source, disposed: () => !current },
    createPackingBagTransport(rpc),
    createPackingCategoryV2Transport(categories)
  );
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  setAuthed(true);
  const p = bagSnapshot();
  source = 'http://127.0.0.1:55831';
  current = true;
  session = {
    userId: p.scope.user_id,
    familyId: p.scope.family_id,
    personId: p.scope.person_id,
    user: { username: 'SDK', email: 'sdk@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  };
  repo = new FamilyFrontendRepository(
    async () => session,
    undefined,
    () => ({ userId: session.userId, personId: session.personId, familyId: session.familyId, source })
  );
  await repo.session();
  native = (await repo.views()).ids.register('trip', p.scope.trip_id);
  useTripStore.setState({ trip: { id: native, title: 'Original', user_id: 0 } as never });
  rpc.mockReset().mockResolvedValue(p);
  categories.mockReset();
});
afterEach(async () => {
  vi.restoreAllMocks();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
function categoryPacket() {
  const p = snapshotV2(),
    b = bagSnapshot();
  p.packing = structuredClone(b.packing);
  p.packing.items = [];
  p.packing.category_assignees = { Gear: [id(4), id(7)] };
  p.item_categories = [];
  p.categories[0].assignments = [id(4), id(7)].map((person_id) => ({
    person_id,
    assigned_at: null,
    assigned_by_person_id: null,
  }));
  p.people = b.people.map((p) => ({ ...p, is_guest: false }));
  return p;
}
function emptyBagItems() {
  const p = bagSnapshot();
  p.packing.items = [];
  p.packing.category_assignees = { Gear: [id(4), id(7)] };
  return p;
}
it('publishes one stable deeply immutable SDK view without native/cache mutation', async () => {
  const c = cohort(),
    before = useTripStore.getState().packingItems;
  await c.load(bagSnapshot().scope.trip_id);
  const p = c.snapshot();
  expect(p).toBe(c.snapshot());
  expect(Object.isFrozen(p?.bags.bags[0].bag)).toBe(true);
  expect(() => {
    if (p) p.bags.bags[0].bag.name = 'Borrowed';
  }).toThrow();
  expect(useTripStore.getState().packingItems).toBe(before);
  c.reset();
  expect(c.snapshot()).toBeNull();
});
it('latest requested load wins across reordered promises', async () => {
  const c = cohort();
  let finish!: (x: unknown) => void;
  rpc.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      })
  );
  const old = c.load(bagSnapshot().scope.trip_id);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  await c.load(bagSnapshot().scope.trip_id);
  const newer = c.snapshot();
  finish(bagSnapshot());
  await expect(old).rejects.toBeDefined();
  expect(c.snapshot()).toBe(newer);
});
it('couples categories only with identical scope/revision/packing', async () => {
  rpc.mockResolvedValue(emptyBagItems());
  categories.mockResolvedValue(categoryPacket());
  const c = cohort();
  await c.load(bagSnapshot().scope.trip_id, true);
  expect(c.snapshot()?.categories?.version).toBe(2);
});
it.each(['scope', 'collection', 'packing', 'people'])('rejects torn category/bag %s publication', async (kind) => {
  rpc.mockResolvedValue(emptyBagItems());
  const p = categoryPacket();
  if (kind === 'scope') p.scope.trip_lifecycle_revision++;
  if (kind === 'collection') {
    p.collection_revision++;
    p.packing.collection_revision++;
  }
  if (kind === 'packing') p.packing.bags[0].name = 'different';
  if (kind === 'people') p.people[0].display_name = 'different';
  categories.mockResolvedValue(p);
  const c = cohort();
  await expect(c.load(bagSnapshot().scope.trip_id, true)).rejects.toBeDefined();
  expect(c.snapshot()).toBeNull();
});
it.each(['source', 'trip', 'layer', 'person', 'account', 'family', 'logout', 'disposed'])(
  'refuses a delayed read when %s changes',
  async (kind) => {
    const c = cohort();
    let finish!: (x: unknown) => void;
    rpc.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        })
    );
    const pending = c.load(bagSnapshot().scope.trip_id);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    if (kind === 'source') source = 'changed';
    if (kind === 'trip') useTripStore.setState({ trip: { id: native + 1 } as never });
    if (kind === 'layer') repo.setLayer(bagSnapshot().scope.trip_id, 'myDraft');
    if (kind === 'person') session = { ...session, personId: id(999) };
    if (kind === 'account') session = { ...session, userId: id(999) };
    if (kind === 'family') session = { ...session, familyId: id(999) };
    if (kind === 'logout') invalidateOfflineSession();
    if (kind === 'disposed') current = false;
    finish(bagSnapshot());
    await expect(pending).rejects.toBeDefined();
    expect(c.snapshot()).toBeNull();
  }
);
it('an observation and a historical ack never become current publication', async () => {
  const c = cohort(),
    p = bagUpdate();
  rpc.mockResolvedValue(p.command.observed);
  expect(await c.observation(p.command.scope.trip_id, p.command.target_id)).toEqual(p.command.observed);
  expect(c.snapshot()).toBeNull();
  expect(bagAck(p).collection_revision).toBeGreaterThan(p.command.expected_collection_revision);
});
