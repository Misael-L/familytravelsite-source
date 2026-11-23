import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildTrip } from '../../../tests/helpers/factories';
import { snapshotV2 } from '../../../tests/helpers/familyPackingCategoryV2';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { PackingCategoryAggregateCohort } from './packingCategoryAggregateCohort';
import { PackingCategoryV2Cohort } from './packingCategoryV2Cohort';
import { createPackingCategoryV2Transport, type PackingCategoryV2Rpc } from './packingCategoryV2Transport';
import { FamilyFrontendRepository } from './repository';

beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  setAuthed(true);
});
afterEach(async () => {
  vi.restoreAllMocks();
  setAuthed(false);
  await resetOfflineTestDatabase();
});

async function fixture() {
  const snapshot = snapshotV2();
  const { trip_id: trip, user_id: userId, family_id: familyId, person_id: personId } = snapshot.scope;
  const repo = new FamilyFrontendRepository(async () => ({
    userId,
    familyId,
    personId,
    user: { username: 'Packing fixture', email: 'packing@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  }));
  const { ids } = await repo.views();
  const native = ids.register('trip', trip);
  useTripStore.setState({ trip: buildTrip({ id: native, title: 'Packing fixture' }) });
  let editorCurrent = true;
  const environment = {
    source: () => 'https://packing.fixture.invalid',
    disposed: () => false,
    current: () => editorCurrent,
  };
  const aggregateRpc = vi.fn<PackingCategoryV2Rpc>().mockResolvedValue(snapshot);
  const v2Rpc = vi.fn<PackingCategoryV2Rpc>().mockResolvedValue(snapshot);
  const aggregate = new PackingCategoryAggregateCohort(
    repo,
    environment,
    undefined,
    createPackingCategoryV2Transport(aggregateRpc)
  );
  const v2 = new PackingCategoryV2Cohort(repo, environment, createPackingCategoryV2Transport(v2Rpc));
  return {
    snapshot,
    trip,
    aggregate,
    aggregateRpc,
    v2,
    retireEditor: () => {
      editorCurrent = false;
    },
  };
}

it('resetting an aggregate snapshot retires its pending load and preserves the v2 snapshot', async () => {
  const { snapshot, trip, aggregate, aggregateRpc, v2 } = await fixture();
  await aggregate.load(trip);
  await v2.load(trip);
  let resolve!: (raw: unknown) => void;
  aggregateRpc.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const pending = expect(aggregate.load(trip)).rejects.toMatchObject({ code: 'packing_v2_cohort_changed' });
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
  aggregate.reset();
  resolve(snapshot);
  await pending;
  expect(aggregate.snapshot()).toBeNull();
  expect(v2.snapshot()).toEqual(snapshot);
  await expect(v2.load(trip)).resolves.toEqual(snapshot);
});

it('an editor lifetime restriction applies to the aggregate and leaves an ordinary v2 load valid', async () => {
  const { snapshot, trip, aggregate, v2, retireEditor } = await fixture();
  await aggregate.load(trip);
  await v2.load(trip);
  retireEditor();
  expect(aggregate.snapshot()).toBeNull();
  await expect(aggregate.load(trip)).rejects.toMatchObject({ code: 'packing_v2_cohort_changed' });
  expect(v2.snapshot()).toEqual(snapshot);
  await expect(v2.load(trip)).resolves.toEqual(snapshot);
});
