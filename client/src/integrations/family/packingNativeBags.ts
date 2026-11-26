import { listPackingCategoryPeople } from '@family/backend/supabase/packingCategoryRoster';
import { PACKING_TERMINAL_ARCHIVE_KEY, hasPendingPackingTerminal } from '../../db/packingTerminalArchive';
import { assertWritableSession } from '../../db/readOnlySession';
import type { PackingBagOrigin, PlannerPackingBagPort } from '../../repo/plannerPackingBagPort';
import { isEffectivelyOffline } from '../../sync/networkMode';
import type { captureWriteSession } from '../../sync/writeSession';
import type { PackingBag } from '../../types';
import type { PackingAggregateContext } from './packingAggregateComposer';
import {
  equalBagFacts as equal,
  packingBagEnvelope,
  type PackingBagEnvelope,
  type PackingBagObservation,
  type PackingBagTrashPage,
} from './packingBagContract';
import { createPackingBagTransport } from './packingBagTransport';
type Context = PackingAggregateContext & {
  view: { items: import('../../types').PackingItem[]; bags: PackingBag[] };
  owner: ReturnType<typeof captureWriteSession>;
  native: number;
  fence: () => Promise<void>;
};
const changed: () => never = () => {
  throw Error('The original bag observation changed. Reopen it before saving.');
};
type BagBindingDependencies<C extends Context> = {
  args: Pick<Parameters<typeof createNativePackingBags<C>>[0], 'send'>;
  reads: ReturnType<typeof createPackingBagTransport>;
  guard: (c: C, accepted?: boolean) => void;
  clean: (c: C) => Promise<void>;
};

class NativeBagBinding<C extends Context> {
  constructor(private dependencies: BagBindingDependencies<C>) {}
  bind(c: C, bag: PackingBag | null, deleted?: PackingBagObservation): PackingBagOrigin {
    const { args, reads, guard, clean } = this.dependencies;
    guard(c);
    let closed = false,
      accepted = false,
      done = false,
      packet: PackingBagEnvelope | null = null,
      flight: Promise<PackingBag> | null = null;
    const check = () => {
      guard(c, accepted);
      if (closed && !accepted) changed();
    };
    if (bag && !c.view.bags.some((b) => equal(b, bag))) changed();
    const target = deleted?.bag.id ?? (bag ? c.ids.uuid('packingBag', bag.id) : crypto.randomUUID());
    // Read immediately at opening, bound to the publication captured synchronously above.
    const ready = (async () => {
      await clean(c);
      const snapshot = await reads.list(c.packet.scope);
      await c.fence();
      check();
      if (!equal(snapshot.packing, c.packet)) changed();
      const o = deleted ?? snapshot.bags.find((o) => o.bag.id === target) ?? null;
      if ((bag || deleted) && !o) changed();
      if (
        deleted &&
        (!equal(deleted.scope, snapshot.scope) || deleted.collection_revision !== snapshot.collection_revision)
      )
        changed();
      return { snapshot, o };
    })();
    void ready.catch(() => {});
    const submit = async (action: PackingBagEnvelope['command']['action'], values: unknown): Promise<PackingBag> => {
      check();
      if (done) changed();
      const { snapshot, o } = await ready;
      check();
      if (action === 'bag-members') {
        const wanted = (values as { person_ids: string[] }).person_ids;
        if (
          wanted.some(
            (id) => !o?.member_person_ids.includes(id) && !snapshot.people.some((p) => p.id === id && p.eligible)
          )
        )
          changed();
      }
      const next = packingBagEnvelope.parse({
        version: 1,
        source_url: c.source,
        view_layer: 'published',
        command: {
          version: 1,
          kind: 'packing-bag',
          scope: snapshot.scope,
          operation_id: packet?.command.operation_id ?? crypto.randomUUID(),
          action,
          target_id: target,
          expected_revision: o?.bag.revision ?? null,
          expected_collection_revision: snapshot.collection_revision,
          observed: o,
          values,
        },
      });
      if (packet && !equal(packet, next)) throw Error('Resolve the original bag save before another edit.');
      packet ??= next;
      const original = packet;
      if (flight) return flight;
      flight = (async () => {
        const result = await args.send(c, original, check, () => {
          accepted = true;
        });
        check();
        done = true;
        return result.bags.find((b) => c.ids.uuid('packingBag', b.id) === target) ?? bag ?? changed();
      })();
      try {
        return await flight;
      } finally {
        flight = null;
      }
    };
    return {
      matches: (trip, id) => {
        try {
          check();
          return (String(trip) === String(c.native) || trip === c.packet.scope.trip_id) && id === (bag?.id ?? null);
        } catch {
          return false;
        }
      },
      current: () => {
        try {
          check();
          return !closed && !done;
        } catch {
          return false;
        }
      },
      close: () => {
        closed = true;
      },
      save: (values) => submit(bag ? 'bag-update' : 'bag-create', values),
      members: async (people) => {
        const ids = people.map((id) => c.ids.uuid('person', id)).sort();
        if (new Set(ids).size !== ids.length) changed();
        await submit('bag-members', { person_ids: ids });
      },
      trash: async () => {
        if (!bag) changed();
        const { snapshot } = await ready;
        check();
        if (
          snapshot.packing.items.some((i) => i.bag_id === target) ||
          (snapshot.packing.bags.find((b) => b.id === target)?.total_weight_grams ?? 0) > 0
        )
          throw Error('Move the items out of this bag before moving it to Trash.');
        await submit('bag-trash-empty', {});
      },
      ...(deleted ? { save: () => submit('bag-restore', {}) } : {}),
    };
  }
}

export function createNativePackingBags<C extends Context>(
  args: {
    capture: (trip?: number | string) => C;
    allowed: () => boolean;
    unchanged: (c: C) => boolean;
    send: (c: C, p: PackingBagEnvelope, check: () => void, accepted: () => void) => Promise<{ bags: PackingBag[] }>;
  },
  reads = createPackingBagTransport()
): PlannerPackingBagPort {
  const pages = new WeakMap<PackingBagTrashPage, { c: C; page: PackingBagTrashPage }>();
  const guard = (c: C, accepted = false) => {
    assertWritableSession();
    c.check();
    if (!args.allowed() || isEffectivelyOffline() || c.layer !== 'published' || (!accepted && !args.unchanged(c)))
      changed();
  };
  const clean = async (c: C) => {
    guard(c);
    await c.fence();
    const rows = await c.owner.db.mutationQueue.toArray();
    const archive = await c.owner.db.syncMeta.get(PACKING_TERMINAL_ARCHIVE_KEY);
    guard(c);
    if (
      rows.some(
        (r) => r.tripId === c.native || r.tripId === 0 || r.url.startsWith('/trips/' + c.packet.scope.trip_id + '/')
      ) ||
      hasPendingPackingTerminal(archive, c.packet.scope.trip_id)
    )
      changed();
  };
  const binding = new NativeBagBinding<C>({ args, reads, guard, clean });
  const bind = (c: C, bag: PackingBag | null, deleted?: PackingBagObservation): PackingBagOrigin =>
    binding.bind(c, bag, deleted);
  return {
    available: (trip) => {
      try {
        guard(args.capture(trip));
        return true;
      } catch {
        return false;
      }
    },
    bind: (trip, bag) => bind(args.capture(trip), bag),
    async people(trip) {
      const c = args.capture(trip);
      await clean(c);
      const snapshot = await reads.list(c.packet.scope);
      const eligible = await listPackingCategoryPeople(c.packet.scope.trip_id, c.packet.scope.family_id);
      await c.fence();
      guard(c);
      if (!equal(snapshot.packing, c.packet)) changed();
      const all = new Map(
        snapshot.people.map((p) => [
          p.id,
          { id: c.ids.register('person', p.id), username: p.display_name, eligible: p.eligible },
        ])
      );
      for (const p of eligible)
        all.set(p.personId, { id: c.ids.register('person', p.personId), username: p.displayName, eligible: true });
      return [...all.values()];
    },
    async trashPage(previous = null) {
      const c = args.capture();
      await clean(c);
      if (previous) {
        const p = pages.get(previous);
        if (!p || !equal(p.page, previous) || !args.unchanged(p.c) || !previous.next_cursor) changed();
      }
      const page = await reads.trash(c.packet.scope, 50, previous?.next_cursor ?? null);
      await c.fence();
      guard(c);
      if (!equal(page.scope, c.packet.scope) || page.collection_revision !== c.packet.collection_revision) changed();
      pages.set(page, { c, page: structuredClone(page) });
      return page;
    },
    async restore(page, index) {
      const entry = pages.get(page);
      const observed = entry?.page.bags[index];
      if (!entry || !equal(page, entry.page) || !Number.isInteger(index) || !observed) changed();
      guard(entry.c);
      const origin = bind(entry.c, null, observed);
      try {
        await origin.save({});
      } finally {
        origin.close();
      }
    },
  };
}
