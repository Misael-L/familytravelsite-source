import {
  nativeStayCommandQualificationEnabled,
  nativeStayWriteQualificationEnabled,
} from './coherentStayQualification';
import type { NativeStaySessionEnvironment } from './nativeStayCommandSession';
import { packingRecoveryQualificationEnabled } from './offlineTripQualification';
import { createPlannerArrangementRecovery } from './plannerArrangementRecovery';
import { createPlannerCreationRecovery } from './plannerCreationRecovery';
import { createPlannerEditorRecovery } from './plannerEditorRecovery';
import { createPlannerNativeStayRecovery } from './plannerNativeStayRecovery';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { createPlannerStayRecovery } from './plannerStayRecovery';
import { createPlannerTaskRecovery, type PlannerTaskRecovery } from './plannerTaskRecovery';
import type { FamilyFrontendRepository } from './repository';

/** One recovery surface; no snapshot or command is published while entry is blocked. */
export function createPlannerCommandRecovery(
  repo: FamilyFrontendRepository,
  trip: string,
  environment: {
    source: () => string;
    current: () => boolean;
    prepareCurrent?: NativeStaySessionEnvironment['prepareCurrent'];
  }
): PlannerTaskRecovery {
  const qualified = packingRecoveryQualificationEnabled() && environment.source() === 'http://127.0.0.1:56041';
  const stays = nativeStayWriteQualificationEnabled() ? createPlannerStayRecovery(repo, trip, environment) : null;
  const nativeStays = nativeStayCommandQualificationEnabled()
    ? createPlannerNativeStayRecovery(repo, trip, environment)
    : null;
  const creation = createPlannerCreationRecovery(repo, trip, environment);
  const edits = createPlannerEditorRecovery(repo, trip, environment);
  const arrangements = createPlannerArrangementRecovery(repo, trip, environment);
  const packing = createPlannerPackingRecovery(repo, trip, { ...environment, bagCommands: qualified }),
    tasks = createPlannerTaskRecovery(repo, trip, environment);
  return {
    ...(qualified ? { replacement: packing.replacement, replacements: packing.replacements } : {}),
    async inspect(visible) {
      return (
        (await creation.inspect(visible)) ??
        (await edits.inspect(visible)) ??
        (await arrangements.inspect(visible)) ??
        (await nativeStays?.inspect(visible)) ??
        (await stays?.inspect(visible)) ??
        (await packing.inspect(visible)) ??
        tasks.inspect(visible)
      );
    },
    export: tasks.export,
  };
}
