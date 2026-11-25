import type { z } from 'zod';
import { assertWritableSession } from '../../db/readOnlySession';
import type { PackingGroupObservation } from '../../repo/plannerPackingPort';
import type { PackingItem } from '../../types';
import type { FamilyIdentityRegistry } from './identity';
import {
  packingCategoryAggregateEnvelope,
  packingCategoryObservationV3,
  type PackingCategoryAggregateEnvelope,
} from './packingCategoryAggregateContract';
import type { PackingCategoryReadPacket } from './packingCategoryPresentation';
import { packingCategoryKey } from './packingCategoryV2Contract';
import { packingJson } from './packingCommandContract';
import type { PackingList } from './packingContract';
import { identityCategory } from './packingIdentityComposer';

export type PackingAggregateContext = {
  packet: PackingList;
  view: { items: PackingItem[] };
  categories: PackingCategoryReadPacket | null;
  ids: FamilyIdentityRegistry;
  source: string;
  layer: 'published' | 'myDraft';
  check: () => void;
};
export type PackingOrderObservation = {
  current: () => boolean;
  close: () => void;
  save: (keys: string[]) => Promise<void>;
  settled?: () => boolean;
};
type ComposerArgs<C extends PackingAggregateContext> = {
  confirmed?: (operation: string) => boolean;
  capture: (trip: number | string) => C;
  allowed: () => boolean;
  unchanged: (c: C) => boolean;
  send: (c: C, p: PackingCategoryAggregateEnvelope, check: () => void, accepted: () => void) => Promise<unknown>;
};
function bindAggregate<C extends PackingAggregateContext>(
  args: ComposerArgs<C>,
  c: C,
  build: (operation: string) => PackingCategoryAggregateEnvelope
): PackingOrderObservation {
  const operation = crypto.randomUUID();
  let closed = false,
    completed = false,
    accepted = false,
    original: PackingCategoryAggregateEnvelope | null = null,
    flight: Promise<void> | null = null;
  const check = () => {
    assertWritableSession();
    c.check();
    if ((closed && !accepted) || !args.allowed() || (!accepted && !args.unchanged(c)))
      throw Error('The original category observation changed');
  };
  return {
    current: () => {
      try {
        check();
        return !closed && !completed && !args.confirmed?.(operation);
      } catch {
        return false;
      }
    },
    settled: () => completed || args.confirmed?.(operation) === true,
    close: () => {
      closed = true;
    },
    async save(keys) {
      check();
      if (completed || args.confirmed?.(operation)) throw Error('The category operation completed');
      const p = build(operation);
      if (p.command.action === 'category-reorder')
        p.command.values.ordered_ids = keys.map((k) => {
          const category = c.categories?.categories.find((x) => packingCategoryKey(x.id) === k);
          if (!category) throw Error('Unknown category identity');
          return category.id;
        });
      const parsed = packingCategoryAggregateEnvelope.parse(p);
      if (original && packingJson(original) !== packingJson(parsed))
        throw Error('Recover the original category operation first');
      original ??= parsed;
      const held = original;
      if (flight !== null) return flight;
      flight = (async () => {
        await args.send(c, held, check, () => {
          accepted = true;
        });
        check();
        completed = true;
      })();
      try {
        await flight;
      } finally {
        flight = null;
      }
    },
  };
}
const aggregatePacket = <C extends PackingAggregateContext>(
  { c, operation }: { c: C; operation: string },
  action: 'category-reorder' | 'category-trash-batch' | 'category-restore-batch',
  target: string | null,
  observed: unknown,
  values: unknown
) =>
  packingCategoryAggregateEnvelope.parse({
    version: 3,
    source_url: c.source,
    view_layer: c.layer,
    command: {
      version: 3,
      kind: 'packing-category-aggregate',
      operation_id: operation,
      scope: c.packet.scope,
      action,
      target_id: target,
      expected_collection_revision: c.packet.collection_revision,
      observed,
      values,
    },
  });

export function createPackingAggregateComposer<C extends PackingAggregateContext>(args: ComposerArgs<C>) {
  const confirmed = new Set<string>();
  const bindingArgs = { ...args, confirmed: (operation: string) => confirmed.has(operation) };

  const requireContext = (trip: number | string) => {
    assertWritableSession();
    const c = args.capture(trip);
    if (c.categories?.version !== 2 || c.layer !== 'published' || !args.allowed())
      throw Error('Category aggregates unavailable');
    return c;
  };
  return {
    confirmed: (operation: string) => {
      confirmed.add(operation);
    },
    reset: () => {
      confirmed.clear();
    },
    order(trip: number | string, view: 'common' | 'personal', keys: string[]) {
      const c = requireContext(trip);
      const metadata = c.categories;
      if (metadata?.version !== 2) throw Error('Category identity missing');
      const owner = view === 'common' ? null : c.packet.scope.person_id;
      const categories = metadata.categories
        .filter((x) => x.owner_person_id === owner)
        .sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : 1));
      if (packingJson(keys) !== packingJson(categories.map((x) => packingCategoryKey(x.id))))
        throw Error('A complete owned category lane is required');
      return bindAggregate(bindingArgs, c, (op) =>
        aggregatePacket(
          { c, operation: op },
          'category-reorder',
          null,
          {
            version: 3,
            kind: 'packing-category-lane',
            scope: c.packet.scope,
            collection_revision: c.packet.collection_revision,
            lane: view,
            owner_person_id: owner,
            categories,
          },
          { ordered_ids: categories.map((x) => x.id) }
        )
      );
    },
    restore(trip: number | string, observed: z.infer<typeof packingCategoryObservationV3>): PackingOrderObservation {
      const c = requireContext(trip);
      if (
        packingJson(observed.scope) !== packingJson(c.packet.scope) ||
        observed.collection_revision !== c.packet.collection_revision ||
        !observed.batch
      )
        throw Error('Original category Trash observation required');
      return bindAggregate(bindingArgs, c, (op) =>
        aggregatePacket(
          { c, operation: op },
          'category-restore-batch',
          observed.category.id,
          structuredClone(observed),
          {}
        )
      );
    },
    trash(trip: number | string, key: string, rendered: PackingItem[]): PackingGroupObservation {
      const c = requireContext(trip),
        category = identityCategory(c, key);
      const metadata = c.categories;
      if (metadata?.version !== 2) throw Error('Category identity missing');
      const linked = new Set(
        metadata.item_categories.filter((x) => x.category_id === category.id).map((x) => x.item_id)
      );
      const items = c.packet.items.filter((x) => linked.has(x.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
      const expected = items.map((row) => c.view.items.find((x) => x.id === c.ids.register('packing', row.id)));
      if (
        expected.some((x) => !x) ||
        packingJson([...rendered].sort((a, b) => a.id - b.id)) !==
          packingJson(expected.sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0)))
      )
        throw Error('The complete original category items are required');
      const origin = bindAggregate(bindingArgs, c, (op) =>
        aggregatePacket(
          { c, operation: op },
          'category-trash-batch',
          category.id,
          {
            version: 3,
            kind: 'packing-category-observation',
            scope: c.packet.scope,
            collection_revision: c.packet.collection_revision,
            category,
            items,
            batch: null,
          },
          {}
        )
      );
      return {
        settled: origin.settled,
        current: origin.current,
        close: origin.close,
        submit: async (intent) => {
          if (intent.action !== 'group-trash' || Object.keys(intent.values).length)
            throw Error('Original category Trash only');
          await origin.save([]);
        },
      };
    },
  };
}
