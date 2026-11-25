import { useTripStore } from '../../store/tripStore';
import { captureWriteSession } from '../../sync/writeSession';
import { PackingBagCommandSession } from './packingBagCommandSession';
import {
  equalBagFacts as equal,
  packingBagEnvelope,
  type PackingBagEnvelope,
  type PackingBagSnapshot,
} from './packingBagContract';
import { PackingBagDependency } from './packingBagDependency';
import { createPackingBagTransport } from './packingBagTransport';
import type { PackingCategorySnapshotV2 } from './packingCategoryV2Contract';
import { createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import type { PackingCursor } from './packingContract';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
export type PackingBagPublication = { bags: PackingBagSnapshot; categories: PackingCategorySnapshotV2 | null };
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** SDK-only stable publication; does not install native bag management or mutate saved formats. */
export class PackingBagCohort {
  private epoch = 0;
  private value: Readonly<PackingBagPublication> | null = null;
  private current: (() => void) | null = null;
  private listeners = new Set<() => void>();
  constructor(
    private repo: FamilyFrontendRepository,
    private environment: { source: () => string; disposed: () => boolean; current?: () => boolean },
    private reads = createPackingBagTransport(),
    private categories = createPackingCategoryV2Transport()
  ) {}
  dependencies(trip: string) {
    return new PackingBagDependency(this.repo, trip, this.environment, { bags: this.reads });
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }
  reset() {
    this.epoch++;
    this.value = null;
    this.current = null;
    this.notify();
  }
  snapshot() {
    try {
      this.current?.();
      return this.value;
    } catch {
      return null;
    }
  }
  private changed(): never {
    throw new FamilyApiError(409, 'packing_bag_cohort_changed', 'The original bag publication ended.');
  }
  private capture(trip: string) {
    const owner = captureWriteSession(),
      context = this.repo.captureContext(trip, { revision: false }),
      source = this.environment.source(),
      ids = this.repo.knownViews()?.ids,
      epoch = this.epoch,
      native = ids?.register('trip', trip);
    const check = () => {
      owner.assertCurrent();
      context.assertCurrent();
      if (
        this.environment.disposed() ||
        this.environment.current?.() === false ||
        source !== this.environment.source() ||
        ids !== this.repo.knownViews()?.ids ||
        epoch !== this.epoch ||
        native === undefined ||
        String(useTripStore.getState().trip?.id) !== String(native) ||
        this.repo.getLayer(trip) !== 'published'
      )
        this.changed();
    };
    check();
    const fence = async () => {
      check();
      const s = await this.repo.session();
      check();
      return { trip_id: trip, family_id: s.familyId, user_id: s.userId, person_id: s.personId };
    };
    return { check, fence, source };
  }
  async load(trip: string, coupleCategories = false) {
    this.reset();
    const c = this.capture(trip),
      identity = await c.fence();
    const [bags, categories] = await Promise.all([
      this.reads.list(identity),
      coupleCategories ? this.categories.list(identity) : Promise.resolve(null),
    ]);
    const now = await c.fence();
    c.check();
    if (!equal(identity, now)) this.changed();
    if (categories) {
      if (
        !equal(categories.scope, bags.scope) ||
        categories.collection_revision !== bags.collection_revision ||
        !equal(categories.packing, bags.packing)
      )
        this.changed();
      const common = new Map<string, { display_name: string; eligible: boolean }>(
        categories.people.map((p) => [p.id, p] as const)
      );
      if (
        bags.people.some((p) => {
          const q = common.get(p.id);
          return q && (q.display_name !== p.display_name || q.eligible !== p.eligible);
        })
      )
        this.changed();
    }
    this.value = freeze({ bags, categories });
    this.current = c.check;
    this.notify();
    return this.value;
  }
  async observation(trip: string, bag: string, includeDeleted = false) {
    const c = this.capture(trip),
      identity = await c.fence(),
      p = await this.reads.observation(identity, bag, includeDeleted);
    if (!equal(identity, await c.fence())) this.changed();
    c.check();
    return p;
  }
  async trash(trip: string, limit = 50, before: PackingCursor | null = null) {
    const c = this.capture(trip),
      identity = await c.fence(),
      p = await this.reads.trash(identity, limit, before);
    if (!equal(identity, await c.fence())) this.changed();
    c.check();
    return p;
  }
  async submit(original: PackingBagEnvelope) {
    const p = packingBagEnvelope.parse(original),
      c = this.capture(p.command.scope.trip_id);
    if (c.source !== p.source_url) this.changed();
    const session = new PackingBagCommandSession(
      this.repo,
      {
        ...this.environment,
        current: () => {
          try {
            c.check();
            return true;
          } catch {
            return false;
          }
        },
      },
      p,
      this.reads
    );
    const result = await session.submit();
    c.check();
    await this.load(p.command.scope.trip_id, this.value?.categories !== null && this.value !== null);
    return result;
  }
}
