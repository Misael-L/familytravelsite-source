import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nativeStayIntentFixture } from '../../../tests/helpers/familyNativeStays';
import { canonicalPackingEnvelope } from '../../../tests/helpers/familyPackingCommands';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { offlineDb, type QueuedMutation } from '../../db/offlineDb';
import { PACKING_TERMINAL_ARCHIVE_KEY } from '../../db/packingTerminalArchive';
import { setAuthed } from '../../sync/authGate';
import { captureWriteSession } from '../../sync/writeSession';
import { retainNativeStayIntent } from './nativeStayIntentQueue';
import { retainPackingIntent } from './packingIntentQueue';

const native = 74;
const other = 741;
const otherTrip = '00000000-0000-4000-8000-000000000007';

function competing(tripId: number, url: string): QueuedMutation {
  return {
    id: 'pending-operation',
    tripId,
    method: 'PATCH',
    url,
    body: { fixture: true },
    createdAt: 42,
    status: 'pending',
    attempts: 0,
    lastError: null,
  };
}

beforeEach(async () => {
  await resetOfflineTestDatabase();
  setAuthed(true);
});
afterEach(async () => {
  setAuthed(false);
  await resetOfflineTestDatabase();
});

describe.each([
  {
    name: 'packing',
    errorPrefix: 'packing',
    bind() {
      const packet = canonicalPackingEnvelope();
      return { packet, retain: () => retainPackingIntent(captureWriteSession(), packet, native) };
    },
  },
  {
    name: 'lodging',
    errorPrefix: 'stay',
    bind() {
      const packet = nativeStayIntentFixture().packet;
      return { packet, retain: () => retainNativeStayIntent(captureWriteSession(), packet, native) };
    },
  },
])('$name trip queue retention', ({ bind, errorPrefix }) => {
  it.each([
    ['recorded trip ID', () => competing(native, '/legacy')],
    ['canonical trip route', (trip) => competing(other, `/trips/${trip}/todo`)],
    ['direct canonical trip route', (trip) => competing(other, `/trips/${trip}`)],
    ['numeric trip route', () => competing(other, `/trips/${native}/todo`)],
    ['direct numeric trip route', () => competing(other, `/trips/${native}`)],
    ['unattributed work', () => competing(0, '/legacy')],
  ] satisfies [string, (trip: string) => QueuedMutation][])(
    'preserves competing work when identified by %s',
    async (_label, rowFor) => {
      const { packet, retain } = bind();
      const row = rowFor(packet.command.scope.trip_id);
      await offlineDb.mutationQueue.add(row);

      const outcome: unknown = await retain().catch((error: unknown) => error);
      expect(await offlineDb.mutationQueue.toArray()).toEqual([row]);
      expect(outcome).toMatchObject({ status: 409, code: `${errorPrefix}_older_work` });
    }
  );

  it('keeps unsupported queue routing intact and returns the competing-work refusal', async () => {
    const row = { ...competing(other, '/legacy'), url: null } as unknown as QueuedMutation;
    await offlineDb.mutationQueue.add(row);

    await expect(bind().retain()).rejects.toMatchObject({ status: 409, code: `${errorPrefix}_older_work` });
    expect(await offlineDb.mutationQueue.toArray()).toEqual([row]);
  });

  it('permits a known different trip including a numeric path with a shared prefix', async () => {
    const row = competing(other, `/trips/${other}/todo`);
    await offlineDb.mutationQueue.add(row);
    const { packet, retain } = bind();
    await retain();
    const stored = await offlineDb.mutationQueue.get(packet.command.operation_id);
    expect(stored).toMatchObject({ body: packet, tripId: native });
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);

    await retain();
    expect(await offlineDb.mutationQueue.get(packet.command.operation_id)).toEqual(stored);
    await offlineDb.mutationQueue.update(packet.command.operation_id, { body: { newer: true } });
    await expect(retain()).rejects.toMatchObject({ status: 409, code: `${errorPrefix}_queue_changed` });
    expect((await offlineDb.mutationQueue.get(packet.command.operation_id))?.body).toEqual({ newer: true });
  });

  it.each([true, false])('keeps pending archive protection when same trip is %s', async (sameTrip) => {
    const { packet, retain } = bind();
    const meta = {
      tripId: PACKING_TERMINAL_ARCHIVE_KEY,
      lastSyncedAt: null,
      status: 'idle' as const,
      tilesBbox: null,
      filesCachedCount: 0,
      familyPackingTerminalArchive: {
        version: 1,
        entries: [
          {
            state: 'pending',
            row: { body: { command: { scope: { trip_id: sameTrip ? packet.command.scope.trip_id : otherTrip } } } },
          },
        ],
      },
    };
    await offlineDb.syncMeta.put(meta);
    if (sameTrip) {
      await expect(retain()).rejects.toMatchObject({ status: 409, code: `${errorPrefix}_queue_changed` });
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    } else {
      await retain();
      expect(await offlineDb.mutationQueue.count()).toBe(1);
    }
    expect(await offlineDb.syncMeta.get(PACKING_TERMINAL_ARCHIVE_KEY)).toEqual(meta);
  });
});
