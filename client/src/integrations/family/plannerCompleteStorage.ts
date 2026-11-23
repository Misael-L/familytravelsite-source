import type { CompleteTripOwnership } from './completeTripSnapshot';
import type { StoredCompleteTrip } from './completeTripV4';
import type { plannerCacheDb, PlannerCacheOwnerReference } from './plannerCache';
type Database = typeof plannerCacheDb;
export type CompleteTripRow = {
  version: 1;
  id: string;
  cacheKey: string;
  ownerKey: string;
  ownerGeneration: string;
  tripGeneration: string;
  value: StoredCompleteTrip;
};
export type CompleteTripHead = Omit<CompleteTripRow, 'id' | 'cacheKey' | 'value'> & { key: string; generation: string };
function belongs(
  row: { ownerKey: string; ownerGeneration: string; version: number },
  owner: PlannerCacheOwnerReference
) {
  return row.version === 1 && row.ownerKey === owner.key && row.ownerGeneration === owner.generation;
}
/** Called only inside the shared ownership/snapshot database transaction. Unknown formats are untouched. */
export async function retireCompleteTripOwner(db: Database, owner: PlannerCacheOwnerReference) {
  const [rows, heads] = await Promise.all([
    db.completeSnapshots.where('ownerKey').equals(owner.key).toArray(),
    db.completeHeads.where('ownerKey').equals(owner.key).toArray(),
  ]);
  await db.completeSnapshots.bulkDelete(rows.filter((row) => belongs(row, owner)).map((row) => row.id));
  await db.completeHeads.bulkDelete(heads.filter((row) => belongs(row, owner)).map((row) => row.key));
}
export async function evictCompleteTripKeys(db: Database, keys: string[]) {
  for (const key of keys) {
    const rows = await db.completeSnapshots.where('cacheKey').equals(key).toArray();
    await db.completeSnapshots.bulkDelete(rows.filter((row) => row.version === 1).map((row) => row.id));
    const head = await db.completeHeads.get(key);
    if (head?.version === 1) await db.completeHeads.delete(key);
  }
}
export async function commitCompleteTripGeneration(
  db: Database,
  envelope: StoredCompleteTrip,
  previous: CompleteTripHead | undefined
) {
  if (previous && previous.version !== 1) throw new Error('Unsupported complete Trip head');
  const o = envelope.ownership;
  const current = await db.completeHeads.get(o.key);
  if (JSON.stringify(current) !== JSON.stringify(previous)) throw new Error('Complete Trip generation advanced');
  const tags = {
    version: 1 as const,
    ownerKey: o.ownerKey,
    ownerGeneration: o.ownerGeneration,
    tripGeneration: o.tripGeneration,
  };
  await db.completeSnapshots.add({ ...tags, id: envelope.generation, cacheKey: o.key, value: envelope });
  await db.completeHeads.put({ ...tags, key: o.key, generation: envelope.generation });
  if (previous?.version === 1) {
    const old = await db.completeSnapshots.get(previous.generation);
    if (old?.version === 1 && old.cacheKey === o.key && old.ownerGeneration === previous.ownerGeneration)
      await db.completeSnapshots.delete(old.id);
  }
}
export function completeTripOwnership(
  key: string,
  ownerKey: string,
  ownerGeneration: string,
  tripGeneration: string
): CompleteTripOwnership {
  return { key, ownerKey, ownerGeneration, tripGeneration };
}

/** Retract only this exact newly committed generation after an observed scope refusal. Never delete a newer head. */
export async function withdrawCompleteTripGeneration(db: Database, envelope: StoredCompleteTrip) {
  const o = envelope.ownership;
  await db.transaction('rw!', db.completeHeads, db.completeSnapshots, async () => {
    const head = await db.completeHeads.get(o.key);
    if (
      head?.version !== 1 ||
      head.generation !== envelope.generation ||
      head.ownerKey !== o.ownerKey ||
      head.ownerGeneration !== o.ownerGeneration ||
      head.tripGeneration !== o.tripGeneration
    )
      return;
    const row = await db.completeSnapshots.get(envelope.generation);
    if (
      row?.version !== 1 ||
      row.cacheKey !== o.key ||
      row.ownerKey !== o.ownerKey ||
      row.ownerGeneration !== o.ownerGeneration ||
      row.tripGeneration !== o.tripGeneration
    )
      return;
    await db.completeHeads.delete(o.key);
    await db.completeSnapshots.delete(envelope.generation);
  });
}
