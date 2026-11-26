import type { QueuedMutation } from '../../db/offlineDb';
import { PACKING_TERMINAL_ARCHIVE_KEY, hasPendingPackingTerminal } from '../../db/packingTerminalArchive';
import type { captureWriteSession } from '../../sync/writeSession';
import { createRetainedPlannerRow, creationAffects } from './creationIntentQueue';
import type { FamilyApiError } from './errors';

type Retention<Packet> = {
  matches: (row: QueuedMutation, packet: Packet, native: number) => boolean;
  url: (packet: Packet) => string;
  changed: () => never;
  olderWork: () => FamilyApiError;
};

/** Packing and lodging share the queue admission check and keep their own row validation. */
export async function retainTripIntent<Packet>(
  owner: ReturnType<typeof captureWriteSession>,
  packet: Packet,
  { id, trip, native }: { id: string; trip: string; native: number },
  policy: Retention<Packet>
): Promise<QueuedMutation> {
  owner.assertCurrent();
  const retained = await owner.db.transaction('rw', owner.db.mutationQueue, owner.db.syncMeta, async () => {
    owner.assertCurrent();
    if (hasPendingPackingTerminal(await owner.db.syncMeta.get(PACKING_TERMINAL_ARCHIVE_KEY), trip)) policy.changed();
    const rows = await owner.db.mutationQueue.toArray();
    owner.assertCurrent();
    if (rows.some((row) => row.id !== id && creationAffects(row, trip, native))) throw policy.olderWork();
    const existing = rows.find((row) => row.id === id);
    if (existing) {
      if (!policy.matches(existing, packet, native)) policy.changed();
      return existing;
    }
    const row = createRetainedPlannerRow(id, native, policy.url(packet), packet, rows);
    await owner.db.mutationQueue.add(row);
    owner.assertCurrent();
    return row;
  });
  owner.assertCurrent();
  return retained;
}
