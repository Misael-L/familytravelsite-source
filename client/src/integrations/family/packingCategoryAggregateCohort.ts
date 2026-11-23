import { PackingCategoryAggregateCommandSession } from './packingCategoryAggregateCommandSession';
import {
  packingCategoryAggregateEnvelope,
  type PackingCategoryAggregateEnvelope,
} from './packingCategoryAggregateContract';
import { createPackingCategoryAggregateTransport } from './packingCategoryAggregateTransport';
import { PackingCategorySnapshotCohort, type PackingCategoryEditorEnvironment } from './packingCategorySnapshotCohort';
import { createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import type { FamilyFrontendRepository } from './repository';

/** SDK-only coupled state. Does not activate native aggregate controls or change saved packages. */
export class PackingCategoryAggregateCohort extends PackingCategorySnapshotCohort {
  constructor(
    repo: FamilyFrontendRepository,
    private environment: PackingCategoryEditorEnvironment,
    private reads = createPackingCategoryAggregateTransport(),
    canonicalReads = createPackingCategoryV2Transport()
  ) {
    super(repo, environment, canonicalReads, () => environment.current?.());
  }
  async lane(trip: string, visibility: 'common' | 'personal') {
    const c = this.capture(trip),
      p = await this.reads.lane(await c.fence(), visibility);
    await c.fence();
    c.check();
    return p;
  }
  async observation(trip: string, category: string, deleted = false) {
    const c = this.capture(trip),
      p = await this.reads.observation(await c.fence(), category, deleted);
    await c.fence();
    c.check();
    return p;
  }
  async batches(trip: string, limit = 50, before: import('./packingContract').PackingCursor | null = null) {
    const c = this.capture(trip),
      p = await this.reads.batches(await c.fence(), limit, before);
    await c.fence();
    c.check();
    return p;
  }
  async submit(original: PackingCategoryAggregateEnvelope) {
    const p = packingCategoryAggregateEnvelope.parse(original),
      c = this.capture(p.command.scope.trip_id);
    if (c.source !== p.source_url) this.changed();
    const session = new PackingCategoryAggregateCommandSession(this.repo, this.environment, p, this.reads);
    const result = await session.submit();
    // Historical acknowledgement is proof only. No publication if a newer generation won this cohort.
    c.check();
    await this.load(p.command.scope.trip_id);
    return result;
  }
}
