import { listPackingCategoryPeople } from '@family/backend/supabase/packingCategoryRoster';
import api from '../../api/client';
import type {
  PackingCategoryBinding,
  PackingCategorySelector,
  PackingEditOrigin,
  PackingGroupIntent,
  PackingValues,
  PackingView,
  PlannerPackingPort,
} from '../../repo/plannerPackingPort';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { captureReadSession } from '../../sync/readSession';
import { captureWriteSession } from '../../sync/writeSession';
import type { PackingItem } from '../../types';
import { createPackingAggregateComposer } from './packingAggregateComposer';
import { createPackingAggregateTrash } from './packingAggregateTrash';
import { PackingBagDependency } from './packingBagDependency';
import { dependencyIdentity } from './packingBagDependencyContract';
import { createPackingBagTransport } from './packingBagTransport';
import { createPackingCategoryAggregateTransport } from './packingCategoryAggregateTransport';
import {
  packingCategoryEnvelope,
  packingCategoryPeople,
  type PackingCategoryEnvelope,
  type PackingCategoryIntent,
} from './packingCategoryContract';
import { observePackingCategoryForWrite, type PackingCategoryReadPacket } from './packingCategoryPresentation';
import { checkPackingCategoryPacket, createPackingCategoryTransport } from './packingCategoryTransport';
import { checkPackingCategorySnapshotV2, createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import { packingCommand, packingEnvelope, packingJson, type PackingEnvelope } from './packingCommandContract';
import { packingList, type PackingList, type PackingRow, type PackingTrashPage } from './packingContract';
import { packingGroupEnvelope, selectedPackingRows, type PackingGroupSelector } from './packingGroupContract';
import { createPackingGroupTransport } from './packingGroupTransport';
import { createPackingIdentityComposer, identityCategory } from './packingIdentityComposer';
import {
  acknowledgePackingIntent,
  assertPackingObservedIntent,
  inspectPackingIntent,
  packingIntentUrl,
  parkPackingRefusal,
  retainPackingIntent,
  retainedPackingEnvelope,
  type RetainedPackingEnvelope,
} from './packingIntentQueue';
import { createNativePackingBags } from './packingNativeBags';
import { retainedPackingReceipt, validateRetainedPackingAck } from './packingRetainedReceipt';
import { retainedPackingScopeMismatch } from './packingRetainedScope';
import { packingNeedsRoster } from './packingRosterRequirement';
import { PackingTerminalSettlement } from './packingTerminalSettlement';
import { createPackingTransport } from './packingTransport';
import { projectPacking, type NativePacking } from './plannerPacking';
import { nativePackingCategory } from './plannerPackingCategories';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

type Environment = {
  aggregates?: boolean;
  bags?: boolean;
  bagRecovery?: boolean;
  source: () => string;
  disposed: () => boolean;
  allowed: () => boolean;
  revalidate?: (trip: string) => Promise<void>;
};
/** Original observations and canonical publication; never an optimistic packing database. */
export class PlannerCohortPacking implements PlannerPackingPort {
  private bagReads = createPackingBagTransport();
  private aggregateReads = createPackingCategoryAggregateTransport();
  private packet: PackingList | null = null;
  private categories: PackingCategoryReadPacket | null = null;
  private publication = 0;
  private view: PackingView | null = null;
  private viewCurrent: (() => void) | null = null;
  private epoch = 0;
  private pages = new WeakMap<PackingTrashPage, { epoch: number; packet: PackingTrashPage }>();
  private listeners = new Set<() => void>();
  private categoryV2Reads = createPackingCategoryV2Transport();
  constructor(
    private repo: FamilyFrontendRepository,
    private environment: Environment,
    private reads = createPackingTransport(),
    private groupReads = createPackingGroupTransport(),
    private categoryReads = createPackingCategoryTransport()
  ) {
    this.bags = environment.bags
      ? createNativePackingBags({
          capture: (trip) => this.capture(trip),
          allowed: () => this.environment.allowed(),
          unchanged: (c) => packingJson(this.packet) === packingJson(c.packet),
          send: (c, p, check, accepted) => this.send(c, p, check, accepted),
        })
      : undefined;
  }
  readonly bags?: import('../../repo/plannerPackingBagPort').PlannerPackingBagPort;
  terminalRecoveryMode = () =>
    this.environment.bagRecovery === true && this.environment.source() === 'http://127.0.0.1:56041';
  recovery = () => {
    const c = this.capture();
    return createPlannerPackingRecovery(this.repo, c.packet.scope.trip_id, {
      bagCommands: this.terminalRecoveryMode(),
      source: () => this.environment.source(),
      current: () => {
        try {
          c.check();
          return true;
        } catch {
          return false;
        }
      },
    });
  };
  reloadPacking = async () => {
    const c = this.capture();
    const release = await acquireQueueLock(c.owner, 'shared', true);
    if (!release) this.changed();
    try {
      await this.refresh(c, c.check, false);
    } finally {
      release();
    }
  };
  private identityComposers = createPackingIdentityComposer({
    capture: (trip) => this.capture(trip),
    allowed: () => this.environment.allowed(),
    send: (c, p, check) => this.send(c, p, check),
  });
  clearCompletedAvailable(trip: number | string, view: 'common' | 'personal') {
    try {
      const c = this.capture(trip);
      return (
        this.environment.allowed() &&
        !isEffectivelyOffline() &&
        c.packet.items
          .filter((r) => r.checked && r.is_private === (view === 'personal'))
          .every((r) => r.owner_person_id === null || r.owner_person_id === c.packet.scope.person_id)
      );
    } catch {
      return false;
    }
  }
  categoryIdentityMode = () => this.snapshot() !== null && this.categories?.version === 2;
  categoryAggregateMode = () => this.categoryIdentityMode() && this.environment.aggregates === true;
  private aggregateComposers = createPackingAggregateComposer({
    capture: (trip) => this.capture(trip),
    allowed: () => this.categoryAggregateMode() && this.environment.allowed() && !isEffectivelyOffline(),
    unchanged: (c) =>
      packingJson(this.packet) === packingJson(c.packet) && packingJson(this.categories) === packingJson(c.categories),
    send: (c, p, check, accepted) => this.send(c, p, check, accepted),
  });
  observeCategoryOrder = (trip: number | string, view: 'common' | 'personal', keys: string[]) =>
    this.aggregateComposers.order(trip, view, keys);

  private aggregateTrash = createPackingAggregateTrash({
    capture: () => this.capture(),
    allowed: () => this.categoryAggregateMode() && this.environment.allowed() && !isEffectivelyOffline(),
    unchanged: (c) =>
      packingJson(this.packet) === packingJson(c.packet) && packingJson(this.categories) === packingJson(c.categories),
    reads: this.aggregateReads,
    restore: (trip, observation) => this.aggregateComposers.restore(trip, observation),
    send: (c, p, check, accepted) => this.send(c, p, check, accepted),
  });
  categoryBatchPage = (previous?: import('./packingAggregateTrash').PackingCategoryTrashPage | null) =>
    this.aggregateTrash.page(previous);
  restoreCategoryBatch = (page: import('./packingAggregateTrash').PackingCategoryTrashPage, index: number) =>
    this.aggregateTrash.restore(page, index);
  bindNewCategory = (trip: number | string, view: 'common' | 'personal') => this.identityComposers.create(trip, view);
  bindCategoryItem = (trip: number | string, key: string) => this.identityComposers.fill(trip, key);
  categoryGroupAvailable(trip: number | string, key: string, action: 'packed-state' | 'trash') {
    try {
      const c = this.capture(trip),
        category = identityCategory(c, key);
      if (!this.environment.allowed() || isEffectivelyOffline()) return false;
      const linked =
        c.categories?.item_categories
          .filter((x) => x.category_id === category.id)
          .map((x) => x.item_id)
          .sort() ?? [];
      if (action === 'trash') return linked.length === 0 || this.categoryAggregateMode();
      const selected = selectedPackingRows(c.packet.items, {
        view: category.owner_person_id === null ? 'common' : 'personal',
        status: 'all',
        categories: [category.name],
      }).map((x) => x.id);
      return linked.length > 0 && packingJson(linked) === packingJson(selected);
    } catch {
      return false;
    }
  }
  observeIdentityCategory(
    trip: number | string,
    key: string,
    selector: import('../../repo/plannerPackingPort').PackingGroupSelection,
    rows: PackingItem[]
  ) {
    const c = this.capture(trip),
      category = identityCategory(c, key);
    if (selector.view !== (category.owner_person_id === null ? 'common' : 'personal')) this.changed();
    if (!rows.length) return this.identityComposers.dismiss(trip, key);
    const trash =
      this.categoryAggregateMode() && selector.status === 'all' ? this.aggregateComposers.trash(trip, key, rows) : null;
    const packed = this.categoryGroupAvailable(trip, key, 'packed-state')
      ? this.observeGroup(trip, { ...selector, categories: [category.name] }, rows)
      : null;
    if (!trash && !packed) this.changed();
    return {
      settled: () => trash?.settled?.() === true,
      current: () => !!(trash?.current() ?? packed?.current()),
      close: () => {
        trash?.close();
        packed?.close();
      },
      submit: async (intent: PackingGroupIntent) => {
        if (intent.action === 'group-trash' && trash) return trash.submit(intent);
        if (intent.action === 'group-packed-state' && packed) return packed.submit(intent);
        throw Error('Category action unavailable');
      },
    };
  }
  snapshot = () => {
    try {
      this.viewCurrent?.();
      return this.view;
    } catch {
      return null;
    }
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  reset() {
    this.epoch++;
    this.aggregateComposers.reset();
    this.packet = null;
    this.categories = null;
    this.view = null;
    this.viewCurrent = null;
    this.pages = new WeakMap();
    this.aggregateTrash.reset();
    this.notify();
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }
  publish(
    packet: PackingList,
    projection: ReturnType<typeof projectPacking>,
    notify = true,
    categories?: PackingCategoryReadPacket
  ) {
    const categoryPacket = categories
      ? categories.version === 2
        ? checkPackingCategorySnapshotV2(categories, packet.scope)
        : checkPackingCategoryPacket(categories, packet.scope)
      : null;
    if (categoryPacket && packingJson(categoryPacket.packing) !== packingJson(packet)) this.changed();
    const owner = captureReadSession(),
      context = this.repo.captureContext(packet.scope.trip_id, { revision: false }),
      source = this.environment.source(),
      layer = this.repo.getLayer(packet.scope.trip_id),
      ids = this.repo.knownViews()?.ids;
    this.viewCurrent = () => {
      owner.assertCurrent();
      context.assertCurrent();
      if (
        this.environment.disposed() ||
        source !== this.environment.source() ||
        layer !== this.repo.getLayer(packet.scope.trip_id) ||
        ids !== this.repo.knownViews()?.ids ||
        String(useTripStore.getState().trip?.id) !== String(ids?.register('trip', packet.scope.trip_id))
      )
        this.changed();
    };
    this.packet = packingList.parse(packet);
    this.categories = categoryPacket;
    this.publication++;
    this.view = structuredClone({ ...projection, unassigned_weight_grams: packet.unassigned_weight_grams });
    this.pages = new WeakMap();
    this.aggregateTrash.reset();
    if (notify) this.notify();
  }
  private changed(): never {
    throw new FamilyApiError(
      409,
      'packing_observation_changed',
      'The original packing view changed. Reopen it before editing.'
    );
  }
  private capture(trip?: number | string) {
    const packet = this.packet,
      view = this.snapshot(),
      epoch = this.epoch,
      owner = captureWriteSession(),
      ids = this.repo.knownViews()?.ids,
      source = this.environment.source();
    if (!packet || !view || !ids) return this.changed();
    const context = this.repo.captureContext(packet.scope.trip_id, { revision: false }),
      layer = this.repo.getLayer(packet.scope.trip_id),
      native = ids.register('trip', packet.scope.trip_id);
    if (trip !== undefined && String(trip) !== String(native) && trip !== packet.scope.trip_id) this.changed();
    const check = () => {
      owner.assertCurrent();
      context.assertCurrent();
      if (
        this.environment.disposed() ||
        epoch !== this.epoch ||
        source !== this.environment.source() ||
        ids !== this.repo.knownViews()?.ids ||
        layer !== this.repo.getLayer(packet.scope.trip_id) ||
        String(useTripStore.getState().trip?.id) !== String(native)
      )
        this.changed();
    };
    const fence = async () => {
      check();
      const now = await this.repo.session();
      check();
      if (
        now.userId !== packet.scope.user_id ||
        now.personId !== packet.scope.person_id ||
        now.familyId !== packet.scope.family_id
      )
        this.changed();
    };
    check();
    return {
      packet: structuredClone(packet),
      categories: this.categories ? structuredClone(this.categories) : null,
      view: structuredClone(view),
      owner,
      ids,
      source,
      layer,
      native,
      check,
      fence,
    };
  }
  private row(c: ReturnType<PlannerCohortPacking['capture']>, item: PackingItem) {
    const meta = (item as NativePacking).family_packing,
      row = meta && c.packet.items.find((r) => r.id === meta.id),
      projected = c.view.items.find((r) => r.id === item.id);
    if (!row || !projected || packingJson(projected) !== packingJson(item)) this.changed();
    return row;
  }
  bind(item: PackingItem | null, trip: number | string): PackingEditOrigin {
    try {
      const c = this.capture(trip),
        row = item ? this.row(c, item) : null;
      let closed = false,
        completed = false,
        intent: PackingEnvelope | null = null,
        flight: Promise<PackingItem> | null = null;
      const check = () => {
        c.check();
        if (closed || completed) this.changed();
      };
      const write = async (action: 'create' | 'update' | 'trash', values: Record<string, unknown>) => {
        check();
        if (c.categories?.version === 2 && (row === null || ('category' in values && values.category !== row.category)))
          throw Error('Use the original category identity composer');
        const command = packingCommand.parse({
          version: 1,
          operation_id: intent?.command.operation_id ?? crypto.randomUUID(),
          scope: c.packet.scope,
          action,
          target_id: row?.id ?? intent?.command.target_id ?? crypto.randomUUID(),
          expected_revision: row?.revision ?? null,
          expected_collection_revision: null,
          values,
        });
        if (intent && packingJson(intent.command) !== packingJson(command))
          throw new FamilyApiError(
            409,
            'packing_pending_intent',
            'Retry the unresolved packing save unchanged before another edit.'
          );
        intent ??= { version: 1, source_url: c.source, view_layer: c.layer, command };
        if (flight !== null) return flight;
        const original = intent;
        const run = async () => {
          const result = await this.send(c, original, check);
          check();
          const saved = result.items.find((r) => r.family_packing.id === command.target_id);
          if (!saved && action !== 'trash') this.changed();
          // A completed form origin is one logical operation, not authority for a second mutation.
          completed = true;
          return saved ?? item ?? this.changed();
        };
        flight = run();
        try {
          return await flight;
        } finally {
          flight = null;
        }
      };
      return {
        current: () => {
          try {
            c.check();
            return !closed;
          } catch {
            return false;
          }
        },
        close: () => {
          closed = true;
        },
        save: (values) => write(row ? 'update' : 'create', packingValues(values, c.ids)),
        trash: async () => {
          if (!row) this.changed();
          await write('trash', {});
        },
      };
    } catch (error) {
      return {
        current: () => false,
        close: () => {},
        save: async () => {
          throw error;
        },
        trash: async () => {
          throw error;
        },
      };
    }
  }
  bindGroup(
    trip: number | string,
    selector: PackingGroupSelector,
    rendered: PackingItem[],
    intent: PackingGroupIntent
  ) {
    const observed = this.observeGroup(trip, selector, rendered),
      originalIntent = structuredClone(intent);
    return { current: observed.current, close: observed.close, submit: () => observed.submit(originalIntent) };
  }
  /** Capture the menu's scope/set now; allocate one immutable command only when its action is chosen. */
  observeGroup(trip: number | string, selector: PackingGroupSelector, rendered: PackingItem[]) {
    const c = this.capture(trip),
      selected = selectedPackingRows(c.packet.items, selector);
    const ids = rendered.map((row) => this.row(c, row).id).sort();
    if (packingJson(ids) !== packingJson(selected.map((row) => row.id))) this.changed();
    const selection = structuredClone(selector);
    let closed = false,
      completed = false,
      packet: import('./packingGroupContract').PackingGroupEnvelope | null = null,
      flight: Promise<void> | null = null;
    const check = () => {
      c.check();
      if (closed || completed) this.changed();
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
      submit: async (intent: PackingGroupIntent) => {
        check();
        if (
          packet &&
          packingJson({ action: packet.command.action, values: packet.command.values }) !== packingJson(intent)
        )
          throw new FamilyApiError(
            409,
            'packing_pending_intent',
            'Resolve the original packing group before another action.'
          );
        packet ??= packingGroupEnvelope.parse({
          version: 1,
          source_url: c.source,
          view_layer: c.layer,
          original_items: selected,
          command: {
            version: 1,
            kind: 'packing-group',
            operation_id: crypto.randomUUID(),
            scope: c.packet.scope,
            expected_collection_revision: c.packet.collection_revision,
            selector: selection,
            observed_items: selected.map(({ id, revision, checked }) => ({ id, revision, checked })),
            ...intent,
          },
        });
        if (flight !== null) return flight;
        const original = packet;
        flight = (async () => {
          await this.send(c, original, check);
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
  categoryAccess(trip: number | string, selector: PackingCategorySelector, rendered: PackingItem[]) {
    try {
      const view = this.snapshot(),
        ids = this.repo.knownViews()?.ids,
        packet = this.packet;
      if (
        !view ||
        !ids ||
        !packet ||
        (String(trip) !== String(ids.register('trip', packet.scope.trip_id)) && trip !== packet.scope.trip_id)
      )
        return null;
      return nativePackingCategory({
        categories: this.categories,
        canonical: view.items,
        rendered,
        selector,
        ids,
        allowed: this.environment.allowed() && !isEffectivelyOffline(),
      });
    } catch {
      return null;
    }
  }
  bindCategory(trip: number | string, id: string): PackingCategoryBinding {
    const c = this.capture(trip),
      category = c.categories?.categories.find((x) => x.id === id);
    if (
      !category ||
      !this.environment.allowed() ||
      isEffectivelyOffline() ||
      (category.owner_person_id !== null && category.owner_person_id !== c.packet.scope.person_id)
    )
      this.changed();
    const original = this.observeCategory(trip, id);
    return {
      current: original.current,
      close: original.close,
      rename: (name) => original.submit({ action: 'category-rename', values: { name } }),
      assign: (people) => {
        if (category.owner_person_id !== null)
          return Promise.reject(new Error('Personal responsibility is unavailable.'));
        const person_ids = people.map((p) => c.ids.uuid('person', p)).sort();
        return original.submit({ action: 'category-assignees', values: { person_ids } });
      },
    };
  }
  async categoryMembers(trip: number | string) {
    const c = this.capture(trip);
    if (!c.categories || !this.environment.allowed() || isEffectivelyOffline()) this.changed();
    await c.fence();
    const people = await listPackingCategoryPeople(c.packet.scope.trip_id, c.packet.scope.family_id);
    await c.fence();
    return people.map((p) => ({
      id: c.ids.register('person', p.personId),
      username: p.displayName,
      is_guest: p.isGuest,
      eligible: true,
    }));
  }
  categorySnapshot() {
    if (!this.snapshot() || !this.categories) return null;
    return structuredClone(this.categories);
  }
  async loadCategories() {
    const c = this.capture();
    await c.fence();
    if (isEffectivelyOffline())
      throw new FamilyApiError(503, 'packing_category_offline', 'Reconnect for a complete category observation.');
    const release = await acquireQueueLock(c.owner, 'shared', true);
    if (!release) this.changed();
    try {
      await this.refresh(c, c.check, true, true);
    } finally {
      release();
    }
  }
  /** One explicit canonical category ID, never a first-match display-label lookup. */
  observeCategory(trip: number | string, id: string) {
    const c = this.capture(trip);
    if (!c.categories)
      throw new FamilyApiError(409, 'packing_category_observation', 'Refresh category metadata before editing.');
    const observed = observePackingCategoryForWrite(c.categories, id);
    let closed = false,
      completed = false,
      original: PackingCategoryEnvelope | null = null,
      flight: Promise<void> | null = null;
    const check = () => {
      c.check();
      if (closed || completed) this.changed();
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
      submit: async (intent: PackingCategoryIntent) => {
        check();
        if (
          original &&
          packingJson({ action: original.command.action, values: original.command.values }) !== packingJson(intent)
        )
          throw new FamilyApiError(
            409,
            'packing_pending_intent',
            'Resolve the original category command before changing its intent.'
          );
        original ??= packingCategoryEnvelope.parse({
          version: 1,
          source_url: c.source,
          view_layer: c.layer,
          original_items: observed.items,
          command: {
            version: 1,
            kind: 'packing-category',
            operation_id: crypto.randomUUID(),
            scope: c.packet.scope,
            expected_collection_revision: c.packet.collection_revision,
            observed_category: observed.category,
            ...intent,
          },
        });
        if (flight !== null) return flight;
        const packet = original;
        flight = (async () => {
          await this.send(c, packet, check);
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
  async packed(
    trip: number | string,
    item: PackingItem,
    values: { checked: boolean } | { packed_quantity: number | null }
  ) {
    const c = this.capture(trip),
      row = this.row(c, item);
    await this.send(
      c,
      this.envelope(c, {
        action: 'packed-state',
        target_id: row.id,
        expected_revision: row.revision,
        expected_collection_revision: null,
        values,
      }),
      c.check
    );
  }
  async reorder(trip: number | string, rows: PackingItem[], order: number[]) {
    const c = this.capture(trip);
    if (rows.length !== c.packet.items.length || new Set(rows.map((r) => r.id)).size !== rows.length) this.changed();
    const byId = new Map(rows.map((item) => [item.id, this.row(c, item).id])),
      ids = order.map((id) => byId.get(id) ?? this.changed());
    if (ids.length !== rows.length || new Set(ids).size !== rows.length) this.changed();
    await this.send(
      c,
      this.envelope(c, {
        action: 'reorder',
        target_id: null,
        expected_revision: null,
        expected_collection_revision: c.packet.collection_revision,
        values: { ids },
      }),
      c.check
    );
  }
  private envelope(c: ReturnType<PlannerCohortPacking['capture']>, fields: Record<string, unknown>): PackingEnvelope {
    return packingEnvelope.parse({
      version: 1,
      source_url: c.source,
      view_layer: c.layer,
      command: { version: 1, operation_id: crypto.randomUUID(), scope: c.packet.scope, ...fields },
    });
  }
  async trashPage(previous: PackingTrashPage | null = null) {
    const c = this.capture();
    const prior = previous && this.pages.get(previous);
    if (
      previous &&
      (!prior ||
        prior.epoch !== this.epoch ||
        packingJson(previous) !== packingJson(prior.packet) ||
        !previous.next_cursor)
    )
      this.changed();
    await c.fence();
    if (isEffectivelyOffline())
      throw new FamilyApiError(503, 'packing_trash_offline', 'Reconnect to inspect packing Trash.');
    const release = await acquireQueueLock(c.owner, 'shared', true);
    if (!release) this.changed();
    try {
      await c.fence();
      const pending = await c.owner.db.mutationQueue.toArray();
      c.check();
      if (pending.some((row) => row.tripId === c.native || row.url.startsWith(`/trips/${c.packet.scope.trip_id}/`)))
        this.changed();
      const page = await this.reads.trash(c.packet.scope, 50, previous?.next_cursor ?? null);
      await c.fence();
      if (
        packingJson(page.scope) !== packingJson(c.packet.scope) ||
        page.collection_revision !== c.packet.collection_revision ||
        (previous &&
          (page.collection_revision !== previous.collection_revision ||
            packingJson(page.scope) !== packingJson(previous.scope)))
      )
        this.changed();
      this.pages.set(page, { epoch: this.epoch, packet: structuredClone(page) });
      return page;
    } finally {
      release();
    }
  }
  async restore(page: PackingTrashPage, row: PackingRow) {
    const c = this.capture(),
      observed = this.pages.get(page);
    if (
      !observed ||
      observed.epoch !== this.epoch ||
      packingJson(observed.packet) !== packingJson(page) ||
      !observed.packet.items.some((r) => packingJson(r) === packingJson(row)) ||
      row.deleted_at === null ||
      row.trip_id !== c.packet.scope.trip_id ||
      packingJson(page.scope) !== packingJson(c.packet.scope) ||
      page.collection_revision !== c.packet.collection_revision
    )
      this.changed();
    await this.send(
      c,
      this.envelope(c, {
        action: 'restore',
        target_id: row.id,
        expected_revision: row.revision,
        expected_collection_revision: null,
        values: {},
      }),
      c.check
    );
  }
  async reconcile(): Promise<'committed' | 'unknown' | 'none'> {
    const c = this.capture();
    await c.fence();
    if (isEffectivelyOffline())
      throw new FamilyApiError(503, 'packing_receipt_offline', 'Reconnect to inspect the retained packing save.');
    const terminal = await new PackingTerminalSettlement(this.repo, c.packet.scope.trip_id, {
      source: () => c.source,
      current: () => {
        try {
          c.check();
          return true;
        } catch {
          return false;
        }
      },
    }).pending();
    if (terminal) {
      const result = await terminal.check();
      c.check();
      const remaining = (await c.owner.db.mutationQueue.toArray()).some(
        (row) => row.tripId === c.native || row.url.startsWith(`/trips/${c.packet.scope.trip_id}/`)
      );
      c.check();
      if (result === 'unknown' || remaining) return 'unknown';
      await this.refresh(c, c.check, false);
      return result === 'committed' ? 'committed' : 'none';
    }
    const dependencyRows = (await c.owner.db.mutationQueue.toArray()).filter(
      (row) => row.tripId === c.native || row.url.startsWith(`/trips/${c.packet.scope.trip_id}/`)
    );
    c.check();
    if (dependencyRows.length === 2) {
      const dependency = new PackingBagDependency(
        this.repo,
        c.packet.scope.trip_id,
        {
          source: () => c.source,
          current: () => {
            try {
              c.check();
              return true;
            } catch {
              return false;
            }
          },
        },
        { bags: this.bagReads, items: this.reads, aggregates: this.aggregateReads }
      );
      const pending = await dependency.pending();
      if (!pending) this.changed();
      await pending.check();
      c.check();
      // A confirmed parent never implies that its retained child has committed.
      return 'unknown';
    }
    const release = await acquireQueueLock(c.owner, 'exclusive', true);
    if (!release) this.changed();
    try {
      await c.fence();
      const rows = await c.owner.db.mutationQueue.toArray();
      c.check();
      const pending = rows.filter(
        (row) =>
          row.url === `/trips/${c.packet.scope.trip_id}/family/packing/commands` ||
          row.url === `/trips/${c.packet.scope.trip_id}/family/packing/group-commands` ||
          row.url === `/trips/${c.packet.scope.trip_id}/family/packing/category-commands` ||
          row.url === `/trips/${c.packet.scope.trip_id}/family/packing/category-lifecycle-v2` ||
          row.url === `/trips/${c.packet.scope.trip_id}/family/packing/category-items-v2` ||
          row.url === `/trips/${c.packet.scope.trip_id}/family/packing/category-aggregate-v3` ||
          row.url === `/trips/${c.packet.scope.trip_id}/family/packing/bag-commands`
      );
      if (!pending.length) {
        await this.refresh(c, c.check, false);
        return 'none';
      }
      if (pending.length !== 1) this.changed();
      const p = retainedPackingEnvelope.parse(pending[0].body),
        scope = p.command.scope;
      if (retainedPackingScopeMismatch(p, scope, c) || !(await inspectPackingIntent(c.owner, p, c.native)))
        this.changed();
      await c.fence();
      if (
        rows.filter((row) => row.tripId === c.native || row.url.startsWith(`/trips/${c.packet.scope.trip_id}/`))
          .length !== 1
      )
        this.changed();
      const pendingReceipt = retainedPackingReceipt(p, c.packet.scope, {
        bag: this.bagReads,
        aggregate: this.aggregateReads,
        categoryV2: this.categoryV2Reads,
        category: this.categoryReads,
        group: this.groupReads,
        base: this.reads,
      });
      const receipt = await pendingReceipt.receipt;
      await c.fence();
      if (receipt.status === 'unknown') return 'unknown';
      if (receipt.result) validateRetainedPackingAck(receipt.result, p);
      await acknowledgePackingIntent(c.owner, p, c.native, pending[0]);
      c.check();
      if (pendingReceipt.aggregate) this.aggregateComposers.confirmed(p.command.operation_id);
      await this.refresh(c, c.check, false);
      return 'committed';
    } finally {
      release();
    }
  }
  private async refresh(
    c: ReturnType<PlannerCohortPacking['capture']>,
    check: () => void,
    sameLifecycle = true,
    forceCategories = false
  ) {
    const before = useTripStore.getState().packingItems,
      publication = this.publication;
    const categories =
      c.categories?.version === 2
        ? await this.categoryV2Reads.list(c.packet.scope)
        : c.categories || forceCategories
          ? await this.categoryReads.list(c.packet.scope)
          : undefined;
    const bagPacket = this.environment.bags ? await this.bagReads.list(c.packet.scope) : undefined;
    const packet = bagPacket?.packing ?? categories?.packing ?? (await this.reads.list(c.packet.scope));
    if (categories && bagPacket && packingJson(categories.packing) !== packingJson(packet)) this.changed();
    await c.fence();
    check();
    if (sameLifecycle && packingJson(packet.scope) !== packingJson(c.packet.scope)) this.changed();
    const needRoster = packingNeedsRoster(packet);
    const roster = needRoster ? await this.repo.readers.listTripTravelers(packet.scope.trip_id) : [];
    await c.fence();
    check();
    const projected = projectPacking(
      packet,
      c.ids,
      [
        ...(bagPacket?.people.map((p) => ({ personId: p.id, displayName: p.display_name })) ?? []),
        ...packingCategoryPeople(categories, roster),
      ],
      categories
    );
    await c.owner.db.transaction('r!', c.owner.db.mutationQueue, async () => {
      const pending = await c.owner.db.mutationQueue.toArray();
      check();
      if (
        pending.some((r) => r.tripId === c.native || r.url.startsWith(`/trips/${packet.scope.trip_id}/`)) ||
        before !== useTripStore.getState().packingItems ||
        publication !== this.publication
      )
        this.changed();
      // Both stores are updated synchronously within the same guarded lease/transaction turn.
      this.publish(packet, projected, false, categories);
      useTripStore.setState({ packingItems: projected.items });
      this.notify();
    });
    check();
    return projected;
  }
  private async send(
    c: ReturnType<PlannerCohortPacking['capture']>,
    packet: RetainedPackingEnvelope,
    check: () => void,
    accepted?: () => void
  ) {
    check();
    await c.fence();
    check();
    if (!this.environment.allowed())
      throw new FamilyApiError(403, 'packing_access_denied', 'Packing editing is not authorized.');
    const release = await acquireQueueLock(c.owner, 'exclusive', true);
    let result: ReturnType<typeof projectPacking>;
    try {
      await c.fence();
      check();
      await assertPackingObservedIntent(c.owner, packet, () => this.packet, check);
      const retained = await retainPackingIntent(c.owner, packet, c.native);
      const current = await c.owner.db.mutationQueue.get(retained.id);
      check();
      if (!current || dependencyIdentity(current, true) !== dependencyIdentity(retained, true)) this.changed();
      if (!release || isEffectivelyOffline())
        throw new FamilyApiError(503, 'packing_queued', 'Packing save retained locally. Reconnect to confirm it.');
      try {
        const response = await api.post(packingIntentUrl(packet), structuredClone(packet), {
          headers: { 'X-Idempotency-Key': packet.command.operation_id },
        });
        validateRetainedPackingAck(response.data, packet);
      } catch (error) {
        check();
        await parkPackingRefusal(c.owner, packet, c.native, error, retained);
        throw error;
      }
      await c.fence();
      check();
      await acknowledgePackingIntent(c.owner, packet, c.native, retained);
      check();
      accepted?.();
      result = await this.refresh(c, check);
    } finally {
      release?.();
    }
    check();
    // A passive planner refresh may have paused authority while this original was pending.
    // Revalidate only after releasing the exclusive queue lease; never turn an acknowledgement into permission.
    try {
      await this.environment.revalidate?.(c.packet.scope.trip_id);
    } catch {
      // The guarded reader owns any refresh problem or newer publication.
      // This operation is already acknowledged and canonically read: a racing
      // ancillary refresh must not turn it back into an unresolved form save.
      // No authority is restored here; subsequent writes still require it.
      check();
    }
    check();
    return result;
  }
}
function packingValues(
  data: PackingValues,
  ids: NonNullable<ReturnType<FamilyFrontendRepository['knownViews']>>['ids']
) {
  const result = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  if (result.bag_id !== undefined && result.bag_id !== null)
    result.bag_id = ids.uuid('packingBag', result.bag_id as number);
  return result;
}
