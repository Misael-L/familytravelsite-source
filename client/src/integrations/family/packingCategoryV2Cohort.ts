import { PackingCategorySnapshotCohort, type PackingCategoryEnvironment } from './packingCategorySnapshotCohort';
import { PackingCategoryV2CommandSession } from './packingCategoryV2CommandSession';
import { packingCategoryV2Envelope, type PackingCategoryV2Envelope } from './packingCategoryV2Contract';
import { createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import type { FamilyFrontendRepository } from './repository';

/** SDK-only coupled state. Does not alter native views or saved packages (C3b3). */
export class PackingCategoryV2Cohort extends PackingCategorySnapshotCohort {
  constructor(
    repo: FamilyFrontendRepository,
    private environment: PackingCategoryEnvironment,
    private reads = createPackingCategoryV2Transport()
  ) {
    super(repo, environment, reads);
  }
  async lookup(trip: string, visibility: 'common' | 'personal', name: string) {
    const c = this.capture(trip),
      p = await this.reads.lookup(await c.fence(), visibility, name);
    await c.fence();
    c.check();
    return p;
  }
  async trash(trip: string, limit = 50, before: import('./packingContract').PackingCursor | null = null) {
    const c = this.capture(trip),
      p = await this.reads.trash(await c.fence(), limit, before);
    await c.fence();
    c.check();
    return p;
  }
  async submit(original: PackingCategoryV2Envelope) {
    const p = packingCategoryV2Envelope.parse(original),
      c = this.capture(p.command.scope.trip_id);
    if (c.source !== p.source_url) this.changed();
    const session = new PackingCategoryV2CommandSession(this.repo, this.environment, p, this.reads);
    const result = await session.submit();
    // Historical acknowledgement is proof only. No publication if a newer generation won this cohort.
    c.check();
    await this.load(p.command.scope.trip_id);
    return result;
  }
}
