import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { nativeStayIntentFixture } from '../../../tests/helpers/familyNativeStays';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import { offlineDb } from '../../db/offlineDb';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode } from '../../sync/networkMode';
import { captureWriteSession } from '../../sync/writeSession';
import { retainNativeStayIntent } from './nativeStayIntentQueue';
import { createOriginalStayReadGuard, guardedPlannerRead } from './plannerReadGuard';
let x: ReturnType<typeof nativeStayIntentFixture>;
const trip = () => ({ uuid: x.packet.command.scope.trip_id, native: 42, blockImports: true });
beforeEach(async () => {
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  x = nativeStayIntentFixture();
  await retainNativeStayIntent(captureWriteSession(), x.packet, 42);
});
afterEach(async () => {
  setAuthed(false);
  _resetNetworkMode();
  await resetOfflineTestDatabase();
});
const fail = () => Error('Original refresh held');
async function lease() {
  const row = await offlineDb.mutationQueue.get(x.packet.command.operation_id);
  if (!row) throw Error();
  return createOriginalStayReadGuard(captureWriteSession(), trip(), row, fail);
}
it('ordinary reads still refuse a pending native intent', async () => {
  await expect(guardedPlannerRead(captureWriteSession(), trip(), fail, async () => {})).rejects.toThrow('held');
});
it('only the exact owning row is ignored, without clearing or changing it', async () => {
  const before = await offlineDb.mutationQueue.toArray(),
    l = await lease();
  await l.guard.check();
  await l.guard.commit(() => Promise.resolve());
  expect(await offlineDb.mutationQueue.toArray()).toEqual(before);
  l.close();
  await expect(l.guard.check()).rejects.toThrow('held');
});
it.each(['metadata', 'missing', 'other_work', 'native_row'] as const)(
  'refuses %s changes while a refresh is active',
  async (kind) => {
    const l = await lease(),
      id = x.packet.command.operation_id;
    const old = await offlineDb.mutationQueue.get(id);
    if (!old) throw Error();
    if (kind === 'metadata') await offlineDb.mutationQueue.put({ ...old, retryAfter: undefined });
    if (kind === 'missing') await offlineDb.mutationQueue.delete(id);
    if (kind === 'other_work') await offlineDb.mutationQueue.put({ ...old, id: crypto.randomUUID() });
    if (kind === 'native_row')
      await offlineDb.days.put({ id: 1, trip_id: 42, date: '2027-04-01', day_number: 1 } as never);
    await expect(l.guard.check()).rejects.toThrow('held');
    l.close();
  }
);
it('refuses another Trip, syncing or non-native expected row', async () => {
  const r = await offlineDb.mutationQueue.get(x.packet.command.operation_id);
  if (!r) throw Error();
  for (const patch of [{ tripId: 43 }, { status: 'syncing' }, { url: r.url.replace('native-stays', 'stay-bundles') }])
    await expect(
      createOriginalStayReadGuard(captureWriteSession(), trip(), { ...r, ...patch } as never, fail)
    ).rejects.toThrow('held');
});
it('cannot manufacture an exemption from a completed or absent original command', async () => {
  const r = await offlineDb.mutationQueue.get(x.packet.command.operation_id);
  await offlineDb.mutationQueue.delete(x.packet.command.operation_id);
  await expect(createOriginalStayReadGuard(captureWriteSession(), trip(), r, fail)).rejects.toThrow('held');
});
