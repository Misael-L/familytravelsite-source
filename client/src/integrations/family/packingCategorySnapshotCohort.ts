import { useTripStore } from '../../store/tripStore';
import { captureWriteSession } from '../../sync/writeSession';
import type { PackingCategorySnapshotV2 } from './packingCategoryV2Contract';
import type { createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

export type PackingCategoryEnvironment = { source: () => string; disposed: () => boolean };
export type PackingCategoryEditorEnvironment = PackingCategoryEnvironment & { current?: () => boolean };

/** Holds one coupled SDK snapshot for each category module instance. */
export class PackingCategorySnapshotCohort {
  private generation = 0;
  private value: PackingCategorySnapshotV2 | null = null;
  private current: (() => void) | null = null;
  constructor(
    protected readonly repo: FamilyFrontendRepository,
    private connection: PackingCategoryEnvironment,
    private canonicalReads: Pick<ReturnType<typeof createPackingCategoryV2Transport>, 'list'>,
    private editorCurrent?: () => boolean | undefined
  ) {}
  reset() {
    this.generation++;
    this.value = null;
    this.current = null;
  }
  snapshot() {
    try {
      this.current?.();
      return this.value ? structuredClone(this.value) : null;
    } catch {
      return null;
    }
  }
  protected changed(): never {
    throw new FamilyApiError(409, 'packing_v2_cohort_changed', 'The original category cohort changed.');
  }
  protected capture(trip: string) {
    const owner = captureWriteSession(),
      context = this.repo.captureContext(trip, { revision: false }),
      source = this.connection.source(),
      ids = this.repo.knownViews()?.ids,
      generation = this.generation,
      native = ids?.register('trip', trip),
      layer = this.repo.getLayer(trip);
    const check = () => {
      owner.assertCurrent();
      context.assertCurrent();
      if (
        this.connection.disposed() ||
        this.editorCurrent?.() === false ||
        source !== this.connection.source() ||
        ids !== this.repo.knownViews()?.ids ||
        generation !== this.generation ||
        layer !== 'published' ||
        this.repo.getLayer(trip) !== layer ||
        native === undefined ||
        String(useTripStore.getState().trip?.id) !== String(native)
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
    return { check, fence, source, generation };
  }
  async load(trip: string) {
    const c = this.capture(trip),
      identity = await c.fence(),
      p = await this.canonicalReads.list(identity);
    await c.fence();
    c.check();
    this.value = p;
    this.generation++;
    const current = this.capture(trip);
    this.current = current.check;
    return structuredClone(p);
  }
}
