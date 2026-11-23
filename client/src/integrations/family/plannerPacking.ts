import { BAG_COLORS } from '../../components/Packing/packingListPanel.constants';
import type { PackingBag, PackingItem } from '../../types';
import type { FamilyIdentityRegistry } from './identity';
import { NOT_HANDLED } from './listHandler';
import { createPackingBagTransport } from './packingBagTransport';
import { packingCategoryPeople } from './packingCategoryContract';
import { packingCategoryPresentation, type PackingCategoryReadPacket } from './packingCategoryPresentation';
import { packingJson } from './packingCommandContract';
import type { PackingCursor, PackingList, PackingScope } from './packingContract';
import { packingCursor, packingScope } from './packingContract';
import { createPackingTransport } from './packingTransport';
import { guardedPlannerRead, preparePlannerReadScope, type PlannerReadGuard } from './plannerReadGuard';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';

export type NativePacking = PackingItem & {
  family_packing: {
    version: 1;
    id: string;
    trip_id: string;
    revision: number;
    scope: PackingScope;
    collection_revision: number;
    category_id?: string;
    owner_person_id: string | null;
    recipient_person_ids: string[];
    contributor_person_ids: string[];
  };
};
type Person = { personId: string; displayName: string };
export function projectPacking(
  packet: PackingList,
  ids: FamilyIdentityRegistry,
  roster: Person[],
  categories?: PackingCategoryReadPacket
) {
  const identityPacket = categories?.version === 2 ? categories : undefined;
  const links = new Map(identityPacket?.item_categories.map((x) => [x.item_id, x.category_id]));
  const person = (id: string) => ({
    user_id: ids.register('person', id),
    username: roster.find((p) => p.personId === id)?.displayName ?? '',
  });
  const items: NativePacking[] = packet.items.map((r) => ({
    id: ids.register('packing', r.id),
    trip_id: ids.register('trip', r.trip_id),
    name: r.name,
    category: r.category,
    checked: r.checked ? 1 : 0,
    quantity: r.quantity,
    packed_quantity: r.packed_quantity,
    weight_grams: r.weight_grams,
    bag_id: r.bag_id ? ids.register('packingBag', r.bag_id) : null,
    sort_order: r.sort_order,
    is_private: r.is_private ? 1 : 0,
    owner_id: r.owner_person_id ? ids.register('person', r.owner_person_id) : null,
    owner_username: r.owner_person_id ? person(r.owner_person_id).username : null,
    recipients: r.recipient_person_ids.map(person),
    contributors: r.contributor_person_ids.map((id) => ({ ...person(id), status: 'active' })),
    created_at: r.created_at,
    updated_at: r.updated_at,
    family_packing: {
      version: 1,
      ...(identityPacket ? { category_id: links.get(r.id) } : {}),
      id: r.id,
      trip_id: r.trip_id,
      revision: r.revision,
      scope: structuredClone(packet.scope),
      collection_revision: packet.collection_revision,
      owner_person_id: r.owner_person_id,
      recipient_person_ids: [...r.recipient_person_ids],
      contributor_person_ids: [...r.contributor_person_ids],
    },
  }));
  const bags: PackingBag[] = packet.bags.map((b) => ({
    id: ids.register('packingBag', b.id),
    trip_id: ids.register('trip', b.trip_id),
    name: b.name,
    color: b.color ?? BAG_COLORS[0],
    weight_limit_grams: b.weight_limit_grams,
    sort_order: b.sort_order,
    created_at: b.created_at,
    members: b.member_person_ids.map(person),
    total_weight_grams: b.total_weight_grams,
  }));
  return {
    ...(identityPacket ? { categoryViews: packingCategoryPresentation(identityPacket) } : {}),
    items,
    bags,
    assignees: Object.fromEntries(
      Object.entries(packet.category_assignees).map(([name, people]) => [name, people.map(person)])
    ),
  };
}
function createOwnedPackingRead(repo: FamilyFrontendRepository, disposed: () => boolean, source: () => string) {
  async function owned<T>(
    value: number | string,
    signal: AbortSignal | undefined,
    inherited: PlannerReadGuard | undefined,
    work: (
      identity: import('./packingContract').PackingIdentity,
      ids: FamilyIdentityRegistry,
      fence: () => Promise<void>,
      guard: PlannerReadGuard
    ) => Promise<T>
  ) {
    const { owner, session, trip, ids, fence } = await preparePlannerReadScope(repo, value, {
      disposed,
      source,
      signal,
      kind: 'packing',
    });
    await fence();
    return guardedPlannerRead(
      owner,
      { uuid: trip, native: ids.register('trip', trip) },
      () => new FamilyApiError(409, 'packing_local_work', 'Packing refresh is held to preserve local work.'),
      async (guard) => {
        try {
          await fence();
          await repo.tripHeader(trip);
          await fence();
          await guard.check();
          await fence();
          const result = await work(
            { trip_id: trip, family_id: session.familyId, user_id: session.userId, person_id: session.personId },
            ids,
            fence,
            guard
          );
          await fence();
          await guard.check();
          await fence();
          return result;
        } catch (error) {
          await fence();
          throw error;
        }
      },
      inherited
    );
  }
  return owned;
}
/** Canonical published packing; never an itinerary draft, persisted native cache, default writer or empty fallback. */
export function createPlannerPackingReader(
  repo: FamilyFrontendRepository,
  disposed: () => boolean,
  source: () => string,
  transport = createPackingTransport(),
  categories?: { list: (identity: import('./packingContract').PackingIdentity) => Promise<PackingCategoryReadPacket> },
  bags = false
) {
  const owned = createOwnedPackingRead(repo, disposed, source);
  return {
    read(value: number | string, signal?: AbortSignal, inherited?: PlannerReadGuard) {
      return owned(value, signal, inherited, async (identity, ids, fence, guard) => {
        const categoryPacket = categories ? await categories.list(identity) : undefined;
        if (categories && bags) await fence();
        const bagPacket = bags ? await createPackingBagTransport().list(identity) : undefined;
        const packet = bagPacket?.packing ?? categoryPacket?.packing ?? (await transport.list(identity));
        if (categoryPacket && bagPacket && packingJson(categoryPacket.packing) !== packingJson(packet))
          throw Error('Packing publications changed');
        await fence();
        await guard.check();
        // An empty observation needs no unrelated directory request or invented Person.
        const needsRoster =
          packet.items.some(
            (r) => r.owner_person_id !== null || r.recipient_person_ids.length || r.contributor_person_ids.length
          ) ||
          packet.bags.some((b) => b.member_person_ids.length) ||
          Object.values(packet.category_assignees).some((people) => people.length);
        if (needsRoster) await fence();
        const roster = needsRoster ? await repo.readers.listTripTravelers(identity.trip_id) : [];
        await fence();
        await guard.check();
        await fence();
        return {
          packet,
          ...projectPacking(
            packet,
            ids,
            [
              ...(bagPacket?.people.map((p) => ({ personId: p.id, displayName: p.display_name })) ?? []),
              ...packingCategoryPeople(categoryPacket, roster),
            ],
            categoryPacket
          ),
          fence,
          ...(categoryPacket ? { categoryPacket } : {}),
        };
      });
    },
    trash(
      value: number | string,
      limit = 50,
      before: PackingCursor | null = null,
      observed?: Pick<PackingList, 'scope' | 'collection_revision'>,
      signal?: AbortSignal
    ) {
      if (before !== null && !observed)
        return Promise.reject(
          new FamilyApiError(
            409,
            'packing_trash_observation',
            'Continue Trash with its original scope and collection revision.'
          )
        );
      const cursor = before === null ? null : packingCursor.parse(before);
      const observation = observed
        ? { scope: packingScope.parse(observed.scope), collection_revision: observed.collection_revision }
        : null;
      if (
        observation &&
        (!Number.isSafeInteger(observation.collection_revision) || observation.collection_revision < 0)
      )
        return Promise.reject(
          new FamilyApiError(400, 'packing_trash_observation', 'A valid original Trash observation is required.')
        );
      return owned(value, signal, undefined, async (identity, _ids, fence) => {
        const page = await transport.trash(identity, limit, cursor);
        await fence();
        if (
          observation &&
          (JSON.stringify(page.scope) !== JSON.stringify(observation.scope) ||
            page.collection_revision !== observation.collection_revision)
        )
          throw new FamilyApiError(409, 'packing_trash_changed', 'Packing Trash changed; restart its pages.');
        return { packet: page, fence };
      });
    },
    receipt(value: number | string, operation: string, signal?: AbortSignal) {
      return owned(value, signal, undefined, async (identity, _ids, fence) => {
        const packet = await transport.receipt(identity, operation);
        await fence();
        return { packet, fence };
      });
    },
  };
}
export function createPlannerPackingHandler(packing: ReturnType<typeof createPlannerPackingReader>) {
  return async (request: FamilyRequest) => {
    const m = request.pathname.match(/^\/trips\/([^/]+)\/packing(?:\/(.*))?$/);
    if (!m) return NOT_HANDLED;
    if (request.method !== 'GET')
      throw new FamilyApiError(409, 'packing_writer_not_cut_over', 'Native packing writing is not connected.');
    if (![undefined, 'bags', 'category-assignees'].includes(m[2]) || request.query.size)
      throw new FamilyApiError(422, 'packing_read_unavailable', 'Only complete canonical packing reads are connected.');
    const result = await packing.read(m[1], request.signal);
    await result.fence();
    const observation = {
      family_packing_scope: result.packet.scope,
      collection_revision: result.packet.collection_revision,
      trash_count: result.packet.trash_count,
    };
    if (m[2] === 'category-assignees') return { ...observation, assignees: result.assignees };
    if (m[2] === 'bags')
      return { ...observation, bags: result.bags, unassigned_weight_grams: result.packet.unassigned_weight_grams };
    return {
      ...observation,
      items: result.items,
      bags: result.bags,
      unassigned_weight_grams: result.packet.unassigned_weight_grams,
    };
  };
}
