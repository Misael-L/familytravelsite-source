import { assertWritableSession } from '../../db/readOnlySession';
import type { PackingCategoryComposer, PackingGroupObservation } from '../../repo/plannerPackingPort';
import type { FamilyIdentityRegistry } from './identity';
import type { PackingCategoryReadPacket } from './packingCategoryPresentation';
import {
  packingCategoryKey,
  packingCategoryV2Envelope,
  type PackingCategoryV2Envelope,
} from './packingCategoryV2Contract';
import { packingJson } from './packingCommandContract';
import type { PackingList } from './packingContract';
import type { projectPacking } from './plannerPacking';

type Context = {
  packet: PackingList;
  categories: PackingCategoryReadPacket | null;
  ids: FamilyIdentityRegistry;
  source: string;
  layer: 'published' | 'myDraft';
  check: () => void;
};
export function identityCategory<C extends Context>(c: C, key: string) {
  if (c.categories?.version !== 2) throw Error('A current category identity snapshot is required');
  const category = c.categories.categories.find((x) => packingCategoryKey(x.id) === key);
  if (!category || (category.owner_person_id !== null && category.owner_person_id !== c.packet.scope.person_id))
    throw Error('This category is not writable in the original view');
  return category;
}
function categoryEnvelope(args: {
  c: Context;
  kind: 'create' | 'fill' | 'dismiss';
  category: ReturnType<typeof identityCategory> | null;
  operation: string;
  target: string;
  view: 'common' | 'personal';
  name: string;
}) {
  const { c, kind, category, operation, target, view, name } = args;
  const scope = {
    version: 2,
    operation_id: operation,
    scope: c.packet.scope,
    expected_collection_revision: c.packet.collection_revision,
  };
  const command =
    kind === 'create'
      ? {
          ...scope,
          kind: 'packing-category-lifecycle',
          action: 'category-create',
          target_id: target,
          observed_category: null,
          values: { name, visibility: view },
        }
      : kind === 'fill'
        ? {
            ...scope,
            kind: 'packing-category-item',
            action: 'category-item-create',
            target_id: target,
            expected_revision: null,
            category_id: category?.id,
            observed_category: category,
            values: { name },
          }
        : {
            ...scope,
            kind: 'packing-category-lifecycle',
            action: 'category-dismiss-empty',
            target_id: target,
            observed_category: category,
            values: {},
          };
  const packet = packingCategoryV2Envelope.parse({
    version: 2,
    source_url: c.source,
    view_layer: c.layer,
    command,
    ...(kind === 'fill' ? { original_item: null, original_category_id: null } : {}),
  });
  return packet;
}
/** Original category/collection/operation are captured at composer opening, never resolved from a later label. */
export function createPackingIdentityComposer<C extends Context>(args: {
  capture: (trip: number | string) => C;
  allowed: () => boolean;
  send: (c: C, p: PackingCategoryV2Envelope, check: () => void) => Promise<ReturnType<typeof projectPacking>>;
}) {
  const open = (
    trip: number | string,
    kind: 'create' | 'fill' | 'dismiss',
    view: 'common' | 'personal',
    key?: string
  ): PackingCategoryComposer => {
    assertWritableSession();
    const c = args.capture(trip);
    if (c.categories?.version !== 2 || c.layer !== 'published' || !args.allowed())
      throw Error('Category authoring is unavailable');
    const category = kind === 'create' ? null : identityCategory(c, key ?? '');
    if (kind === 'dismiss' && c.categories.item_categories.some((x) => x.category_id === category?.id))
      throw Error('Nonempty category Trash is not connected');
    const operation = crypto.randomUUID(),
      target = kind === 'dismiss' ? (category?.id ?? '') : crypto.randomUUID();
    let closed = false,
      completed = false,
      original: PackingCategoryV2Envelope | null = null,
      flight: Promise<void> | null = null;
    const check = () => {
      c.check();
      assertWritableSession();
      if (closed || !args.allowed()) throw Error('The original category composer ended');
    };
    return {
      current: () => {
        try {
          check();
          return true;
        } catch {
          return false;
        }
      },
      close: () => {
        closed = true;
      },
      async save(name) {
        check();
        if (completed) throw Error('This category save already completed');
        const packet = categoryEnvelope({ c, kind, category, operation, target, view, name });
        if (original && packingJson(original) !== packingJson(packet))
          throw Error('Recover the original category save before changing it');
        original ??= packet;
        if (flight !== null) return flight;
        const retained = original;
        flight = (async () => {
          await args.send(c, retained, check);
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
  };
  return {
    create: (trip: number | string, view: 'common' | 'personal') => open(trip, 'create', view),
    fill: (trip: number | string, key: string) => open(trip, 'fill', 'common', key),
    dismiss: (trip: number | string, key: string): PackingGroupObservation => {
      const composer = open(trip, 'dismiss', 'common', key);
      return {
        current: composer.current,
        close: composer.close,
        submit: async (intent) => {
          if (intent.action !== 'group-trash' || Object.keys(intent.values).length)
            throw Error('Empty category dismissal only');
          await composer.save('');
        },
      };
    },
  };
}
