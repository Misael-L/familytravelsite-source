// organize-imports-ignore
// sort-imports-ignore
// Preserve existing module evaluation order during formatting.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/helpers/msw/server';
import { buildTrip } from '../../tests/helpers/factories';
import { offlineDb, type QueuedMutation } from '../db/offlineDb';
import { tripRepo } from './tripRepo';
import { resetOfflineTestDatabase } from '../../tests/helpers/offlineDb';

const original: QueuedMutation = {
  id: 'retained-trip-task',
  tripId: 71,
  method: 'POST',
  url: '/trips/71/family/tasks/commands',
  body: { original: 'do not rebase or replay' },
  retentionPolicy: 'family-original-v1',
  status: 'pending',
  attempts: 0,
  createdAt: 1,
  lastError: null,
  schemaVersion: 1,
};
function online(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, writable: true, configurable: true });
}
beforeEach(async () => {
  await resetOfflineTestDatabase();
  online(true);
});
afterEach(async () => {
  await resetOfflineTestDatabase();
  vi.restoreAllMocks();
  online(true);
});

describe('Trip list with retained originals and a cleared logout cache', () => {
  it('refuses an unobserved empty list instead of claiming no trips; never sends or alters original work', async () => {
    const fetch = vi.fn();
    server.use(
      http.get('/api/trips', () => {
        fetch();
        return HttpResponse.json({ trips: [] });
      })
    );
    await offlineDb.mutationQueue.put(original);
    await expect(tripRepo.list()).rejects.toThrow('Trip list refresh is held');
    expect(fetch).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.toArray()).toEqual([original]);
  });
  it('retains a nonempty coherent cached list without overlaying an outstanding edit', async () => {
    await offlineDb.trips.put(buildTrip({ id: 71, title: 'Kept local trip' }));
    await offlineDb.mutationQueue.put(original);
    expect((await tripRepo.list()).trips.map((t) => t.title)).toEqual(['Kept local trip']);
    expect(await offlineDb.mutationQueue.toArray()).toEqual([original]);
  });
  it('also retains an archived-only coherent cache', async () => {
    await offlineDb.trips.put(buildTrip({ id: 71, is_archived: 1 }));
    await offlineDb.mutationQueue.put(original);
    const result = await tripRepo.list();
    expect(result.trips).toEqual([]);
    expect(result.archivedTrips.map((t) => t.id)).toEqual([71]);
  });
  it('refuses if work arrives during the canonical fetch and the retained cache is empty', async () => {
    server.use(
      http.get('/api/trips', async () => {
        await offlineDb.mutationQueue.put(original);
        return HttpResponse.json({ trips: [buildTrip({ id: 71 })] });
      })
    );
    await expect(tripRepo.list()).rejects.toThrow('Trip list refresh is held');
    expect(await offlineDb.trips.count()).toBe(0);
    expect(await offlineDb.mutationQueue.toArray()).toEqual([original]);
  });
  it('accepts a genuinely empty canonical response when no local work blocks observation', async () => {
    server.use(http.get('/api/trips', () => HttpResponse.json({ trips: [] })));
    await expect(tripRepo.list()).resolves.toEqual({ trips: [], archivedTrips: [] });
  });
  it('keeps the existing offline cached-read contract and never treats it as a server observation', async () => {
    online(false);
    await offlineDb.mutationQueue.put(original);
    await expect(tripRepo.list()).resolves.toEqual({ trips: [], archivedTrips: [] });
    expect(await offlineDb.mutationQueue.toArray()).toEqual([original]);
  });
});
