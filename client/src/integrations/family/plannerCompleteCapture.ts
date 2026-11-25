import { completeTripHeader, readCompleteTripCompanions } from './completeTripCompanions';
import { serializeCompleteTrip } from './completeTripSnapshot';
import { offlineTripQualificationEnabled } from './offlineTripQualification';
import type { PackingCategoryReadPacket } from './packingCategoryPresentation';
import type { PackingList } from './packingContract';
import type { PlannerBookingView } from './plannerBookingContract';
import type { CachedPlanner, guardedPlannerCache } from './plannerCache';
import type { TaskList } from './taskContract';
export const completeTripCapture = Symbol('complete canonical Trip capture');
export type PlannerCompleteCapture = {
  pair: CachedPlanner;
  lease: Awaited<ReturnType<typeof guardedPlannerCache>>;
  capturedAt: number;
};
let failures = 0;
export const completeTripCaptureFailures = () => failures;
/** Storage is optional for the online UI. A failure never publishes a partial generation or enables cold reading. */
export async function captureCompleteTrip(input: {
  capture: PlannerCompleteCapture | undefined;
  source: string;
  header: unknown;
  tasks: TaskList;
  packing: PackingList;
  packingCategories?: PackingCategoryReadPacket;
  booking: PlannerBookingView;
  tags: unknown[];
  fence: () => Promise<void>;
}) {
  const c = input.capture;
  if (!c || c.pair.view.scope.layer !== 'published') return;
  try {
    await input.fence();
    if (input.tags.length) throw new Error('Complete Trip tag capture is not implemented');
    const raw = input.header as Record<string, unknown>;
    const header = completeTripHeader.parse(
      Object.fromEntries(Object.keys(completeTripHeader.shape).map((k) => [k, raw[k]]))
    );
    const companions = await readCompleteTripCompanions(header.id, header.family_id, input.fence);
    const envelope = await serializeCompleteTrip({
      source: input.source,
      scope: c.pair.view.scope,
      ownership: c.lease.completeOwnership(),
      capturedAt: c.capturedAt,
      verifiedAt: Date.now(),
      admitReadOnly: offlineTripQualificationEnabled(),
      ...(input.packingCategories?.version === 2 ? { packingFormat: 'category-identity-v2' as const } : {}),
      data: {
        header,
        planner: c.pair,
        tasks: input.tasks,
        packing: input.packing,
        ...(input.packingCategories
          ? input.packingCategories.version === 2
            ? { packing_categories_v2: input.packingCategories }
            : { packing_categories: input.packingCategories }
          : {}),
        booking: input.booking,
        companions,
      },
    });
    await input.fence();
    await c.lease.commitComplete(envelope);
  } catch (error) {
    failures++;
    // An observed authorization denial retires this Trip even when the complete capture failed.
    const code = error && typeof error === 'object' ? (error as { status?: number; code?: string }) : {};
    if (code.status === 401 || code.status === 403 || ['42501', 'PGRST301'].includes(code.code ?? ''))
      await c.lease.evict();
    await input.fence();
  }
}

/** A refused companion is not a successful empty bundle. Use only its original planner lease. */
export async function retireRefusedCompleteTrip(
  view: Promise<{ [completeTripCapture]?: PlannerCompleteCapture }>,
  error: unknown
) {
  const code = error && typeof error === 'object' ? (error as { status?: number; code?: string }) : {};
  if (code.status !== 401 && code.status !== 403 && !['42501', 'PGRST301'].includes(code.code ?? '')) return;
  const original = await view.catch(() => {
    failures++;
    return undefined;
  });
  await original?.[completeTripCapture]?.lease.evict();
}
