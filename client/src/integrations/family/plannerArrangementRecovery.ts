import { matchesArrangementOriginal } from './arrangementIntentQueue';
import { arrangementPacket } from './plannerArrangementContract';
import { createArrangementSession, runArrangementOriginal } from './plannerArrangementSession';
import { createPlannerOriginalRecovery } from './plannerOriginalSession';
import type { PlannerTaskRecovery } from './plannerTaskRecovery';
import type { FamilyFrontendRepository } from './repository';
export function createPlannerArrangementRecovery(
  repo: FamilyFrontendRepository,
  trip: string,
  environment: { source: () => string; current: () => boolean }
): Pick<PlannerTaskRecovery, 'inspect'> {
  const session = createArrangementSession(repo, trip, environment);
  return createPlannerOriginalRecovery(session, trip, {
    readOriginal(row, native) {
      const parsed = arrangementPacket.safeParse(row.body);
      return parsed.success && matchesArrangementOriginal(row, parsed.data, native) ? parsed.data : null;
    },
    scope: (p) => p.scope,
    retainedTask(p, row, visible) {
      const run = async (retry: boolean) =>
        (await runArrangementOriginal(session, p, { row, retry, visible }))
          ? ('committed' as const)
          : ('unknown' as const);
      return {
        domain: 'planner',
        name: `Original planner ${p.plan.action}`,
        action: p.plan.action,
        check: () => run(false),
        retry: () => run(true),
      };
    },
  });
}
