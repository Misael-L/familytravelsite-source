import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { currentOfflineDatabase, invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { guardedPlannerRead } from './plannerReadGuard';
const trip = { uuid: 'd0400000-0000-4000-8000-000000000001', native: 123 };
const blocked = () => new Error('Local work held');
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  await resetOfflineTestDatabase();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => {
  setAuthed(false);
  vi.restoreAllMocks();
});
async function seed(tripId: number, selector: string, suffix = '/family/planner-editor-command') {
  const row = {
    id: crypto.randomUUID(),
    tripId,
    method: 'POST' as const,
    url: `/trips/${selector}${suffix}`,
    body: { unchanged: ['opaque'] },
    status: 'conflict' as const,
    attempts: 3,
    createdAt: 1,
    lastError: null,
    schemaVersion: 100,
  };
  await offlineDb.mutationQueue.put(row);
  return row;
}
it('allows an unrelated trip queue without interpreting or changing its opaque payload', async () => {
  const original = await seed(456, 'other-trip'),
    run = vi.fn(async () => 'read');
  expect(await guardedPlannerRead(captureReadSession(), trip, blocked, run)).toBe('read');
  expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
});
it.each([trip.uuid, String(trip.native)])(
  'recognizes the %s route identity even when the numeric queue metadata disagrees',
  async (selector) => {
    const original = await seed(456, selector),
      run = vi.fn(async () => 'read');
    await expect(guardedPlannerRead(captureReadSession(), trip, blocked, run)).rejects.toThrow('Local work held');
    expect(run).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
  }
);
it.each([trip.uuid, String(trip.native)])(
  'refuses to publish a planner read after a direct %s Trip edit arrives',
  async (selector) => {
    const publish = vi.fn();
    let edit: Awaited<ReturnType<typeof seed>> | undefined;
    await expect(
      guardedPlannerRead(captureReadSession(), trip, blocked, async (guard) => {
        edit = await seed(456, selector, '');
        return guard.commit(publish);
      })
    ).rejects.toThrow('Local work held');
    expect(publish).not.toHaveBeenCalled();
    expect(edit).toBeDefined();
    expect(await offlineDb.mutationQueue.toArray()).toEqual([edit]);
  }
);
it('passes one read lease through nested reads despite a waiting exclusive replay', async () => {
  const entered = gate(),
    finish = gate();
  let replayed = false;
  const run = guardedPlannerRead(captureReadSession(), trip, blocked, async (guard) => {
    entered.resolve();
    await finish.promise;
    return guardedPlannerRead(
      captureReadSession(),
      trip,
      blocked,
      async (nested) => {
        expect(nested).toBe(guard);
        return 'read';
      },
      guard
    );
  });
  await entered.promise;
  const replay = navigator.locks.request(`trek-mutation-flush:${offlineDb.name}`, () => {
    replayed = true;
  });
  finish.resolve();
  expect(await run).toBe('read');
  await replay;
  expect(replayed).toBe(true);
});
it('refuses an inherited lease for another trip', async () => {
  await expect(
    guardedPlannerRead(captureReadSession(), trip, blocked, async (guard) =>
      guardedPlannerRead(captureReadSession(), { ...trip, native: 456 }, blocked, async () => 'read', guard)
    )
  ).rejects.toThrow('Local work held');
});
it('keeps the native queue transaction read-only until a short local commit finishes', async () => {
  const entered = gate(),
    finish = gate();
  let queued = false;
  const run = guardedPlannerRead(captureReadSession(), trip, blocked, (guard) =>
    guard.commit(async () => {
      entered.resolve();
      await finish.promise;
    })
  ).catch((error) => error);
  await entered.promise;
  const put = offlineDb
    .transaction('rw!', offlineDb.mutationQueue, () => seed(trip.native, trip.uuid))
    .then(() => {
      queued = true;
    });
  await new Promise((resolve) => setTimeout(resolve, 15));
  expect(queued).toBe(false);
  finish.resolve();
  await put;
  // The outer final check sees the command if it committed before the read returns.
  const result = await run;
  if (result instanceof Error) expect(result.message).toBe('Local work held');
  expect(queued).toBe(true);
});
it('releases its lock after a commit error without modifying pending work', async () => {
  await expect(
    guardedPlannerRead(captureReadSession(), trip, blocked, (guard) =>
      guard.commit(() => {
        throw new Error('Cache failed');
      })
    )
  ).rejects.toThrow('Cache failed');
  let entered = false;
  await navigator.locks.request(`trek-mutation-flush:${offlineDb.name}`, () => {
    entered = true;
  });
  expect(entered).toBe(true);
});
it('a retired actor cannot enter a delayed local commit', async () => {
  const entered = gate(),
    finish = gate();
  let wrote = false;
  const run = guardedPlannerRead(captureReadSession(), trip, blocked, async (guard) => {
    entered.resolve();
    await finish.promise;
    return guard.commit(() => {
      wrote = true;
    });
  });
  const rejected = expect(run).rejects.toThrow('session');
  await entered.promise;
  invalidateOfflineSession();
  finish.resolve();
  await rejected;
  expect(wrote).toBe(false);
});
it('an unreadable queue fails closed without fetching', async () => {
  const run = vi.fn(async () => 'remote');
  vi.spyOn(currentOfflineDatabase().mutationQueue, 'toArray').mockRejectedValue(new Error('Queue unavailable'));
  await expect(guardedPlannerRead(captureReadSession(), trip, blocked, run)).rejects.toThrow('Queue unavailable');
  expect(run).not.toHaveBeenCalled();
});

it('publisher side effects start their own transaction instead of borrowing the read-only guard', async () => {
  let saved: ReturnType<typeof seed> | undefined;
  const run = guardedPlannerRead(captureReadSession(), trip, blocked, (guard) =>
    guard.commit(() => {
      saved = seed(trip.native, trip.uuid);
    })
  ).catch((error) => error);
  await run;
  const original = await saved;
  if (!original) throw new Error('Publisher did not start its side effect');
  expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
});
