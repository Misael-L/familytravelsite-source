import { useFamilyController } from './controllerContext';
import WorkspaceGovernanceChrome from './legacy/components/Planner/family/WorkspaceGovernanceChrome';

/** Published/draft controls in normal flow. Not the old map-floating bar. */
export function FamilyGovernanceHost() {
  const controller = useFamilyController();
  if (!controller) return null;
  return <WorkspaceGovernanceChrome style="inset" gov={controller.gov} />;
}
