import { afterEach, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { aggregateRestore } from '../../../tests/helpers/familyPackingCategoryAggregate';
import { snapshotV2 } from '../../../tests/helpers/familyPackingCategoryV2';
import { installReadOnlySession } from '../../db/readOnlySession';
import { FamilyIdentityRegistry } from './identity';
import { createPackingAggregateTrash } from './packingAggregateTrash';
import type { createPackingCategoryAggregateTransport } from './packingCategoryAggregateTransport';
const unlock = vi.fn();
vi.mock('../../sync/queueLock', () => ({ acquireQueueLock: vi.fn(async () => unlock) }));
let release: (() => void) | undefined;
afterEach(() => {
  release?.();
  release = undefined;
  vi.clearAllMocks();
});
function harness() {
  const p = aggregateRestore();
  if (p.command.action !== 'category-restore-batch') throw Error('fixture');
  const observation = p.command.observed;
  const metadata = snapshotV2();
  metadata.collection_revision = metadata.packing.collection_revision = observation.collection_revision;
  const listing = {
    version: 3 as const,
    kind: 'packing-category-trash' as const,
    scope: structuredClone(observation.scope),
    collection_revision: observation.collection_revision,
    categories: [
      {
        category: structuredClone(observation.category),
        batch: structuredClone(observation.batch),
        item_count: observation.items.length,
      },
    ],
    next_cursor: null,
  };
  let active = true,
    allowed = true,
    version = 0;
  const pending: unknown[] = [];
  const capture = () => ({
    packet: structuredClone(metadata.packing),
    categories: metadata,
    view: { items: [] },
    ids: new FamilyIdentityRegistry(metadata.scope.user_id),
    source: p.source_url,
    layer: 'published' as const,
    native: 1,
    owner: { db: { mutationQueue: { toArray: async () => pending } } } as never,
    check: () => {
      if (!active) throw Error('retired');
    },
    fence: async () => {
      if (!active) throw Error('retired');
    },
    version,
  });
  const reads = {
      batches: vi.fn(async () => structuredClone(listing)),
      observation: vi.fn(async () => structuredClone(observation)),
    },
    save = vi.fn(async (_keys: string[]) => {}),
    restore = vi.fn(() => ({ current: () => true, close: vi.fn(), save })),
    send = vi.fn(async (..._args: unknown[]) => {});
  const trash = createPackingAggregateTrash<ReturnType<typeof capture>>({
    capture,
    allowed: () => allowed,
    unchanged: (c) => c.version === version,
    reads: reads as unknown as ReturnType<typeof createPackingCategoryAggregateTransport>,
    restore,
    send,
  });
  return {
    trash,
    reads,
    listing,
    observation,
    metadata,
    restore,
    save,
    send,
    pending,
    retire: () => (active = false),
    deny: () => (allowed = false),
    change: () => version++,
  };
}
it('loads complete original manifests and restores the selected batch as one operation', async () => {
  const h = harness(),
    page = await h.trash.page();
  expect(page.observations).toEqual([h.observation]);
  await h.trash.restore(page, 0);
  expect(h.restore).toHaveBeenCalledExactlyOnceWith(1, h.observation);
  expect(h.save).toHaveBeenCalledExactlyOnceWith([]);
  expect(h.send).not.toHaveBeenCalled();
  expect(unlock).toHaveBeenCalled();
});
it.each(['scope', 'collection', 'category', 'batch', 'count'])('refuses a torn %s page', async (fault) => {
  const h = harness();
  if (fault === 'scope') h.observation.scope.trip_lifecycle_revision++;
  if (fault === 'collection') h.observation.collection_revision++;
  if (fault === 'category') h.observation.category.name = 'changed';
  if (fault === 'batch' && h.observation.batch) h.observation.batch.operation_id = id(900);
  if (fault === 'count') h.observation.items = [];
  await expect(h.trash.page()).rejects.toBeDefined();
  expect(h.restore).not.toHaveBeenCalled();
  expect(unlock).toHaveBeenCalled();
});
it.each(['copied', 'mutated', 'index', 'reset', 'publication', 'permission', 'readonly', 'membership'])(
  'refuses a %s restore before save',
  async (fault) => {
    const h = harness();
    let page = await h.trash.page(),
      index = 0;
    if (fault === 'copied') page = structuredClone(page);
    if (fault === 'mutated') page.observations[0].items[0].name = 'changed';
    if (fault === 'index') index = 1;
    if (fault === 'reset') h.trash.reset();
    if (fault === 'publication') h.change();
    if (fault === 'permission') h.deny();
    if (fault === 'readonly') release = installReadOnlySession();
    if (fault === 'membership') h.retire();
    await expect(h.trash.restore(page, index)).rejects.toBeDefined();
    expect(h.restore).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  }
);
it('an exact uncertain restore retry owns one composer and original operation', async () => {
  const h = harness(),
    page = await h.trash.page();
  h.save.mockRejectedValue(Error('lost'));
  await expect(h.trash.restore(page, 0)).rejects.toThrow('lost');
  await expect(h.trash.restore(page, 0)).rejects.toThrow('lost');
  expect(h.restore).toHaveBeenCalledTimes(1);
  expect(h.save).toHaveBeenCalledTimes(2);
});
it('pending Trip work prevents reads before any manifest can be borrowed', async () => {
  const h = harness();
  h.pending.push({ tripId: 1, url: '/other' });
  await expect(h.trash.page()).rejects.toBeDefined();
  expect(h.reads.batches).not.toHaveBeenCalled();
});
it('legacy empty dismissal is explicitly restored with its v2 original, never an aggregate fallback', async () => {
  const h = harness();
  h.observation.batch = null;
  h.observation.items = [];
  h.listing.categories[0].batch = null;
  h.listing.categories[0].item_count = 0;
  const page = await h.trash.page();
  await h.trash.restore(page, 0);
  expect(h.restore).not.toHaveBeenCalled();
  expect(h.send).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      version: 2,
      command: expect.objectContaining({
        action: 'category-restore-empty',
        target_id: h.observation.category.id,
        observed_category: h.observation.category,
      }),
    }),
    expect.any(Function),
    expect.any(Function)
  );
});
