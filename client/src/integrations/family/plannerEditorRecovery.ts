import { matchesEditorOriginal } from './editorIntentQueue';
import { editorPacket, editorScope } from './plannerEditorContract';
import { createEditorSession, runEditorOriginal } from './plannerEditorSession';
import { createPlannerOriginalRecovery } from './plannerOriginalSession';
import type { PlannerTaskRecovery } from './plannerTaskRecovery';
import type { FamilyFrontendRepository } from './repository';
export function createPlannerEditorRecovery(
  repo: FamilyFrontendRepository,
  trip: string,
  environment: { source: () => string; current: () => boolean }
): Pick<PlannerTaskRecovery, 'inspect'> {
  const session = createEditorSession(repo, trip, environment);
  return createPlannerOriginalRecovery(session, trip, {
    readOriginal(row, native) {
      const parsed = editorPacket.safeParse(row.body);
      return parsed.success && matchesEditorOriginal(row, parsed.data, native) ? parsed.data : null;
    },
    scope: editorScope,
    retainedTask(p, row, visible) {
      const run = async (retry: boolean) =>
        (await runEditorOriginal(session, p, { row, retry, visible })) ? ('committed' as const) : ('unknown' as const);
      return {
        domain: 'planner',
        name: p.kind === 'location' ? 'Original saved-place edit' : 'Original selected-visit edit',
        action: 'edit',
        check: () => run(false),
        retry: () => run(true),
      };
    },
  });
}
