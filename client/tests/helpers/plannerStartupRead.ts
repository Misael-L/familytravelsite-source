import { expect, vi } from 'vitest';
import { offlineDb } from '../../src/db/offlineDb';
import { budgetRepo } from '../../src/repo/budgetRepo';
import { fileRepo } from '../../src/repo/fileRepo';
import { useTripStore } from '../../src/store/tripStore';
import { waitFor } from './render';

/** Exercise the actual installed cohort and native tab loader during a held startup. */
export async function assertStartupAncillaryReadJoins(
  resource: 'files' | 'budget',
  trip: string,
  nativeId: () => Promise<number>,
  startupGate: () => Promise<{ entered: () => boolean; finish: () => void }>
) {
  useTripStore.getState().resetTrip();
  const legacy =
    resource === 'files'
      ? vi.spyOn(fileRepo, 'list').mockResolvedValue({ files: [] })
      : vi.spyOn(budgetRepo, 'list').mockResolvedValue({ items: [] });
  const gate = await startupGate();
  const root = useTripStore
    .getState()
    .loadTrip(trip)
    .catch((error) => error);
  await waitFor(() => expect(gate.entered()).toBe(true));
  const native = await nativeId();
  const ancillary =
    resource === 'files' ? useTripStore.getState().loadFiles(native) : useTripStore.getState().loadBudgetItems(native);
  gate.finish();
  const [result] = await Promise.all([root, ancillary]);
  expect(legacy).not.toHaveBeenCalled();
  expect(result).toBeUndefined();
  expect(useTripStore.getState().trip).not.toBeNull();
  expect(await offlineDb.tripFiles.count()).toBe(0);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
}
