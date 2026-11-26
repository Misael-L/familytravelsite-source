import api from '../../api/client';
import { MUTATION_SCHEMA_VERSION, type QueuedMutation } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { captureWriteSession } from '../../sync/writeSession';
import { packingBagEnvelope, type PackingBagEnvelope } from './packingBagContract';
import {
  dependencyBounded,
  dependencyIdentity,
  PACKING_DEPENDENCY_QUEUE_FORMAT,
  packingDependencyChild,
  packingDependencyDescriptor,
  packingDependencyHash,
  type PackingDependencyChild,
  type PackingDependencyDescriptor,
} from './packingBagDependencyContract';
import { checkPackingBagAcknowledgement, createPackingBagTransport } from './packingBagTransport';
import { packingCategoryObservationV3 } from './packingCategoryAggregateContract';
import {
  checkPackingCategoryAggregateAcknowledgement,
  createPackingCategoryAggregateTransport,
} from './packingCategoryAggregateTransport';
import { packingJson } from './packingCommandContract';
import { checkPackingAcknowledgement } from './packingCommandTransport';
import { packingIdentity, type PackingRow } from './packingContract';
import { inspectPackingDependencyPair } from './packingDependencyPair';
import { acknowledgePackingIntent, matchesPackingIntent, packingIntentUrl } from './packingIntentQueue';
import { createPackingTransport } from './packingTransport';
import type { RetainedTask } from './plannerTaskRecovery';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

type Environment = { source: () => string; current?: () => boolean; disposed?: () => boolean };
type Reads = {
  bags: ReturnType<typeof createPackingBagTransport>;
  items: ReturnType<typeof createPackingTransport>;
  aggregates: ReturnType<typeof createPackingCategoryAggregateTransport>;
};
type Pair = {
  child: QueuedMutation;
  parent: QueuedMutation;
  packet: PackingDependencyChild;
  bag: PackingBagEnvelope;
  descriptor: PackingDependencyDescriptor;
};
const equal = (a: unknown, b: unknown) => packingJson(a) === packingJson(b);
const rowSet = (rows: QueuedMutation[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
const fail: () => never = () => {
  throw new FamilyApiError(
    409,
    'packing_dependency_changed',
    'The original recovery dependency changed. Both commands are preserved.'
  );
};
/** One deliberate bag restore alongside one unchanged refused child. Never a general second-write capability. */
export class PackingBagDependency {
  private owner = captureWriteSession();
  private context: ReturnType<FamilyFrontendRepository['captureContext']>;
  private native: number;
  private ids: ReturnType<FamilyFrontendRepository['knownViews']>;
  private source: string;
  private openingTrip = useTripStore.getState().trip?.id;
  private reads: Reads;
  constructor(
    private repo: FamilyFrontendRepository,
    private trip: string,
    private env: Environment,
    reads: Partial<Reads> = {}
  ) {
    this.context = repo.captureContext(trip, { revision: false });
    this.ids = repo.knownViews();
    if (!this.ids) fail();
    this.native = this.ids.ids.register('trip', trip);
    this.source = env.source();
    this.reads = {
      bags: createPackingBagTransport(),
      items: createPackingTransport(),
      aggregates: createPackingCategoryAggregateTransport(),
      ...reads,
    };
    this.check();
  }
  private check() {
    this.owner.assertCurrent();
    this.context.assertCurrent();
    if (
      this.env.disposed?.() ||
      this.env.current?.() === false ||
      this.source !== this.env.source() ||
      this.ids !== this.repo.knownViews() ||
      this.repo.getLayer(this.trip) !== 'published' ||
      useTripStore.getState().trip?.id !== this.openingTrip ||
      (this.openingTrip !== undefined && String(this.openingTrip) !== String(this.native))
    )
      fail();
  }
  private async fence(packet?: PackingDependencyChild | PackingBagEnvelope) {
    this.check();
    const s = await this.repo.session();
    this.check();
    if (
      packet &&
      (packet.source_url !== this.source ||
        packet.view_layer !== 'published' ||
        packet.command.scope.trip_id !== this.trip ||
        s.userId !== packet.command.scope.user_id ||
        s.personId !== packet.command.scope.person_id ||
        s.familyId !== packet.command.scope.family_id)
    )
      fail();
    return s;
  }
  private affects = (row: QueuedMutation) =>
    !Number.isSafeInteger(row.tripId) ||
    row.tripId === 0 ||
    typeof row.url !== 'string' ||
    row.tripId === this.native ||
    [this.trip, String(this.native)].includes(row.url.match(/^\/trips\/([^/]+)(?:\/|$)/)?.[1] ?? '');
  private async rows() {
    const rows = (await this.owner.db.mutationQueue.toArray()).filter(this.affects);
    this.check();
    return rows;
  }
  private child(row: QueuedMutation) {
    const p = packingDependencyChild.safeParse(row.body);
    if (
      !dependencyBounded(row) ||
      !p.success ||
      row.status !== 'conflict' ||
      row.schemaVersion !== MUTATION_SCHEMA_VERSION ||
      !matchesPackingIntent(row, p.data, this.native) ||
      !Number.isSafeInteger(row.createdAt) ||
      !Number.isSafeInteger(row.attempts) ||
      row.attempts < 0
    )
      fail();
    return p.data;
  }
  private async unchanged(expected: QueuedMutation[]) {
    if (dependencyIdentity(rowSet(await this.rows())) !== dependencyIdentity(rowSet(expected))) fail();
  }
  private async pair(rows: QueuedMutation[]): Promise<Pair> {
    const pair = await inspectPackingDependencyPair(rows, this.native);
    this.check();
    return pair;
  }
  private async locked<T>(visible: () => boolean, work: (active: () => void) => Promise<T>) {
    const active = () => {
      this.check();
      if (!visible()) fail();
    };
    active();
    if (isEffectivelyOffline())
      throw new FamilyApiError(
        503,
        'packing_dependency_offline',
        'Reconnect to confirm the original recovery dependency.'
      );
    const release = await acquireQueueLock(
      {
        ...this.owner,
        current: () => {
          try {
            active();
            return true;
          } catch {
            return false;
          }
        },
      },
      'exclusive',
      true
    );
    if (!release) fail();
    try {
      active();
      return await work(active);
    } finally {
      release();
    }
  }
  private async receipt(child: PackingDependencyChild) {
    await this.fence(child);
    const c = child.command;
    const r =
      c.action === 'category-restore-batch' && child.version === 3
        ? await this.reads.aggregates.receipt(child)
        : await this.reads.items.receipt(c.scope, c.operation_id);
    await this.fence(child);
    if (r.result) {
      if (child.version === 3) checkPackingCategoryAggregateAcknowledgement(r.result, child);
      else checkPackingAcknowledgement(r.result, child.command);
    }
    return r;
  }
  private async witness(
    child: PackingDependencyChild,
    bagId: string
  ): Promise<{ item: PackingRow | null; collection: number }> {
    const c = child.command,
      identity = packingIdentity.parse(c.scope);
    if (child.version === 3 && c.action === 'category-restore-batch') {
      const o = await this.reads.aggregates.observation(identity, c.target_id, true);
      await this.fence(child);
      if (!equal(o, c.observed) || !o.items.some((r) => r.bag_id === bagId)) fail();
      return { item: null, collection: o.collection_revision };
    }
    if (c.action !== 'restore') return fail();
    let before = null,
      collection: number | null = null;
    for (let n = 0; n < 20; n++) {
      const page = await this.reads.items.trash(identity, 100, before);
      await this.fence(child);
      if (!equal(page.scope, c.scope) || (collection !== null && collection !== page.collection_revision)) fail();
      collection = page.collection_revision;
      const row = page.items.find((r) => r.id === c.target_id);
      if (row) {
        if (row.revision !== c.expected_revision || row.bag_id !== bagId || row.deleted_at === null) fail();
        return { item: row, collection };
      }
      if (!page.next_cursor) break;
      before = page.next_cursor;
    }
    fail();
  }
  /** Authorized missing-parent choices; preparing/confirming remains a separate decision. */
  async candidates(visible = () => true) {
    return this.locked(visible, async (active) => {
      const rows = await this.rows();
      if (rows.length !== 1) fail();
      const child = this.child(rows[0]);
      await this.fence(child);
      let ids: string[] = [];
      if (child.version === 3) {
        if (child.command.action !== 'category-restore-batch') fail();
        ids = [
          ...new Set(
            packingCategoryObservationV3
              .parse(child.command.observed)
              .items.map((i) => i.bag_id)
              .filter((id): id is string => id !== null)
          ),
        ];
      } else {
        let cursor = null;
        for (let n = 0; n < 20; n++) {
          const page = await this.reads.items.trash(packingIdentity.parse(child.command.scope), 100, cursor);
          await this.fence(child);
          active();
          const item = page.items.find((i) => i.id === child.command.target_id);
          if (item) {
            if (item.revision !== child.command.expected_revision) fail();
            ids = item.bag_id ? [item.bag_id] : [];
            break;
          }
          if (!page.next_cursor) break;
          cursor = page.next_cursor;
        }
      }
      const parents = [];
      for (const id of ids) {
        await this.witness(child, id);
        const o = await this.reads.bags.observation(packingIdentity.parse(child.command.scope), id, true);
        await this.fence(child);
        active();
        if (o.bag.deleted_at !== null) parents.push({ id, name: o.bag.name });
      }
      await this.unchanged(rows);
      active();
      return parents;
    });
  }
  /** Prepare from current authenticated facts; caller must explicitly confirm submit. No queue mutation yet. */
  async prepare(bagId: string, visible = () => true) {
    return this.locked(visible, async (active) => {
      const rows = await this.rows();
      if (rows.length !== 1) fail();
      const child = rows[0],
        p = this.child(child);
      await this.fence(p);
      const r = await this.receipt(p);
      active();
      await this.unchanged(rows);
      if (r.status === 'committed') {
        await acknowledgePackingIntent(this.owner, p, this.native, child);
        active();
        return { status: 'child-committed' as const };
      }
      const witness = await this.witness(p, bagId),
        o = await this.reads.bags.observation(packingIdentity.parse(p.command.scope), bagId, true);
      await this.fence(p);
      active();
      await this.unchanged(rows);
      if (o.bag.deleted_at === null || !equal(o.scope, p.command.scope) || o.collection_revision !== witness.collection)
        fail();
      const parent = packingBagEnvelope.parse({
        version: 1,
        source_url: this.source,
        view_layer: 'published',
        command: {
          version: 1,
          kind: 'packing-bag',
          action: 'bag-restore',
          operation_id: crypto.randomUUID(),
          target_id: bagId,
          scope: o.scope,
          expected_revision: o.bag.revision,
          expected_collection_revision: o.collection_revision,
          observed: o,
          values: {},
        },
      });
      const descriptor = packingDependencyDescriptor.parse({
        version: 1,
        kind: 'packing-bag-restore-dependency',
        child_operation_id: p.command.operation_id,
        child_sha256: await packingDependencyHash(p),
        child_row_sha256: await packingDependencyHash(child),
        parent_operation_id: parent.command.operation_id,
        bag_id: bagId,
        child_item: witness.item,
      });
      active();
      let flight: Promise<'committed' | 'unknown'> | null = null;
      const submit = () => {
        if (flight) return flight;
        const run = this.confirm(child, parent, descriptor, visible);
        flight = run;
        void run.then(
          () => {
            flight = null;
          },
          () => {
            flight = null;
          }
        );
        return run;
      };
      return {
        status: 'prepared' as const,
        get original() {
          return structuredClone(parent);
        },
        submit,
      };
    });
  }
  private async confirm(
    child: QueuedMutation,
    packet: PackingBagEnvelope,
    descriptor: PackingDependencyDescriptor,
    visible: () => boolean
  ) {
    return this.locked(visible, async (active) => {
      const rows = await this.rows();
      if (rows.length === 1) {
        await this.unchanged([child]);
        const p = this.child(child);
        await this.fence(p);
        const receipt = await this.receipt(p);
        active();
        await this.unchanged([child]);
        if (receipt.status !== 'unknown') fail();
        const witness = await this.witness(p, descriptor.bag_id),
          observed = await this.reads.bags.observation(packingIdentity.parse(p.command.scope), descriptor.bag_id, true);
        await this.fence(p);
        active();
        await this.unchanged([child]);
        if (
          !equal(witness.item, descriptor.child_item) ||
          !equal(observed, packet.command.observed) ||
          witness.collection !== observed.collection_revision
        )
          fail();
        const parent: QueuedMutation = {
          id: packet.command.operation_id,
          tripId: this.native,
          method: 'POST',
          url: packingIntentUrl(packet),
          body: structuredClone(packet),
          familyPackingDependency: structuredClone(descriptor),
          retentionPolicy: 'family-original-v1',
          status: 'pending',
          attempts: 0,
          lastError: null,
          schemaVersion: PACKING_DEPENDENCY_QUEUE_FORMAT,
          createdAt: Math.max(Date.now(), child.createdAt + 1),
          buildVersion: typeof __TREK_UI_VERSION__ === 'string' ? __TREK_UI_VERSION__ : '',
        };
        await this.pair([child, parent]);
        active();
        await this.owner.db.transaction('rw', this.owner.db.mutationQueue, async () => {
          await this.unchanged([child]);
          active();
          await this.owner.db.mutationQueue.add(parent);
          active();
        });
      }
      const pair = await this.pair(await this.rows());
      if (!equal(pair.child, child) || !equal(pair.bag, packet) || !equal(pair.descriptor, descriptor)) fail();
      active();
      return this.runPair(pair, true, active);
    });
  }
  /** Resume exactly one validated pair after interruption. Lookup itself never sends a command. */
  async pending(visible = () => true): Promise<RetainedTask | null> {
    this.check();
    const rows = await this.rows();
    if (rows.length !== 2) {
      if (rows.some((r) => Object.prototype.hasOwnProperty.call(r, 'familyPackingDependency'))) fail();
      return null;
    }
    if (!rows.some((r) => Object.prototype.hasOwnProperty.call(r, 'familyPackingDependency'))) return null;
    const pair = await this.pair(rows);
    await this.fence(pair.packet);
    if (!visible()) fail();
    return {
      domain: 'packing',
      name: 'Restore bag before the retained packing restore',
      action: 'bag-restore',
      check: () => this.locked(visible, (active) => this.runPair(pair, false, active)),
      retry: () => this.locked(visible, (active) => this.runPair(pair, true, active)),
    };
  }
  private async runPair(pair: Pair, retry: boolean, active: () => void): Promise<'committed' | 'unknown'> {
    const expected = [pair.child, pair.parent];
    await this.fence(pair.packet);
    await this.unchanged(expected);
    active();
    const childReceipt = await this.receipt(pair.packet);
    active();
    await this.unchanged(expected);
    const receipt = await this.reads.bags.receipt(pair.bag);
    await this.fence(pair.bag);
    active();
    await this.unchanged(expected);
    if (receipt.status === 'unknown') {
      if (!retry) return 'unknown';
      if (childReceipt.status !== 'unknown') fail();
      const witness = await this.witness(pair.packet, pair.descriptor.bag_id);
      active();
      if (!equal(witness.item, pair.descriptor.child_item)) fail();
      const bag = await this.reads.bags.observation(
        packingIdentity.parse(pair.packet.command.scope),
        pair.descriptor.bag_id,
        true
      );
      await this.fence(pair.packet);
      active();
      await this.unchanged(expected);
      if (!equal(bag, pair.bag.command.observed) || witness.collection !== bag.collection_revision) fail();
      const out = (
        await api.post(packingIntentUrl(pair.bag), structuredClone(pair.bag), {
          headers: { 'X-Idempotency-Key': pair.bag.command.operation_id },
        })
      ).data;
      checkPackingBagAcknowledgement(out, pair.bag);
      await this.fence(pair.bag);
      active();
      await this.unchanged(expected);
    }
    // A visible or redacted typed committed parent proof releases only the parent.
    await this.owner.db.transaction('rw', this.owner.db.mutationQueue, async () => {
      await this.unchanged(expected);
      active();
      await this.owner.db.mutationQueue.delete(pair.parent.id);
      active();
    });
    active();
    return 'committed';
  }
}
