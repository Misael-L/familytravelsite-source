import type { z } from 'zod';
import { assertWritableSession } from '../../db/readOnlySession';
import { acquireQueueLock } from '../../sync/queueLock';
import type { captureWriteSession } from '../../sync/writeSession';
import type { PackingAggregateContext, PackingOrderObservation } from './packingAggregateComposer';
import type { packingCategoryBatchesV3, packingCategoryObservationV3 } from './packingCategoryAggregateContract';
import type { createPackingCategoryAggregateTransport } from './packingCategoryAggregateTransport';
import { packingCategoryV2Envelope } from './packingCategoryV2Contract';
import { packingJson } from './packingCommandContract';
import type { RetainedPackingEnvelope } from './packingIntentQueue';

type Observation = z.infer<typeof packingCategoryObservationV3>;
export type PackingCategoryTrashPage = {
  listing: z.infer<typeof packingCategoryBatchesV3>;
  observations: Observation[];
};
type Context = PackingAggregateContext & {
  owner: ReturnType<typeof captureWriteSession>;
  native: number;
  fence: () => Promise<void>;
};
/** Page membership, original manifest and retry ownership remain private to this publication. */
type TrashArgs<C extends Context> = {
  capture: () => C;
  allowed: () => boolean;
  unchanged: (c: C) => boolean;
  reads: ReturnType<typeof createPackingCategoryAggregateTransport>;
  restore: (trip: number, observed: Observation) => PackingOrderObservation;
  send: (c: C, p: RetainedPackingEnvelope, check: () => void, accepted: () => void) => Promise<unknown>;
};
const changed = () => Error('The original category Trash page changed. Reload Trash before restoring.');
async function readPage<C extends Context>(
  args: TrashArgs<C>,
  c: C,
  check: (c: C) => void,
  cursor: PackingCategoryTrashPage['listing']['next_cursor']
) {
  const listing = await args.reads.batches(c.packet.scope, 50, cursor);
  check(c);
  if (
    packingJson(listing.scope) !== packingJson(c.packet.scope) ||
    listing.collection_revision !== c.packet.collection_revision
  )
    throw changed();
  const observations: Observation[] = [];
  for (const row of listing.categories) {
    const observed = await args.reads.observation(c.packet.scope, row.category.id, true);
    check(c);
    if (
      packingJson([
        observed.scope,
        observed.collection_revision,
        observed.category,
        observed.batch,
        observed.items.length,
      ]) !== packingJson([listing.scope, listing.collection_revision, row.category, row.batch, row.item_count])
    )
      throw changed();
    observations.push(observed);
  }
  return { listing, observations };
}
export function createPackingAggregateTrash<C extends Context>(args: TrashArgs<C>) {
  let pages = new WeakMap<
    PackingCategoryTrashPage,
    { original: PackingCategoryTrashPage; c: C; restores: Map<number, () => Promise<void>> }
  >();
  const check = (c: C) => {
    assertWritableSession();
    c.check();
    if (!args.allowed() || !args.unchanged(c)) throw changed();
  };
  return {
    reset: () => {
      pages = new WeakMap();
    },
    async page(previous: PackingCategoryTrashPage | null = null): Promise<PackingCategoryTrashPage> {
      const c = args.capture();
      check(c);
      if (previous) {
        const prior = pages.get(previous);
        if (!prior || !previous.listing.next_cursor || packingJson(previous) !== packingJson(prior.original))
          throw changed();
      }
      await c.fence();
      check(c);
      const release = await acquireQueueLock(c.owner, 'shared', true);
      if (!release) throw changed();
      try {
        const pending = await c.owner.db.mutationQueue.toArray();
        check(c);
        if (pending.some((row) => row.tripId === c.native || row.url.startsWith(`/trips/${c.packet.scope.trip_id}/`)))
          throw changed();
        const { listing, observations } = await readPage(args, c, check, previous?.listing.next_cursor ?? null);
        await c.fence();
        check(c);
        const page = { listing, observations };
        pages.set(page, { original: structuredClone(page), c, restores: new Map() });
        return page;
      } finally {
        release();
      }
    },
    async restore(page: PackingCategoryTrashPage, index: number) {
      const held = pages.get(page);
      if (
        !held ||
        packingJson(page) !== packingJson(held.original) ||
        !Number.isInteger(index) ||
        !held.original.observations[index]
      )
        throw changed();
      let save = held.restores.get(index);
      if (!save) {
        check(held.c);
        const observed = held.original.observations[index];
        if (observed.batch) {
          const bound = args.restore(held.c.native, observed);
          save = () => bound.save([]);
        } else {
          if (observed.items.length) throw changed();
          let accepted = false;
          const p = packingCategoryV2Envelope.parse({
            version: 2,
            source_url: held.c.source,
            view_layer: held.c.layer,
            command: {
              version: 2,
              kind: 'packing-category-lifecycle',
              operation_id: crypto.randomUUID(),
              scope: observed.scope,
              action: 'category-restore-empty',
              target_id: observed.category.id,
              expected_collection_revision: observed.collection_revision,
              observed_category: observed.category,
              values: {},
            },
          });
          save = async () => {
            await args.send(
              held.c,
              p,
              () => {
                assertWritableSession();
                held.c.check();
                if (!args.allowed() || (!accepted && !args.unchanged(held.c))) throw changed();
              },
              () => {
                accepted = true;
              }
            );
          };
        }
        held.restores.set(index, save);
      }
      await save();
    },
  };
}
