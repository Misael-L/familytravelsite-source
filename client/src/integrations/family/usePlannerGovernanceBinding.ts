import { useMemo, useSyncExternalStore } from 'react';
import { currentPlannerGovernancePort, subscribePlannerGovernance } from '../../repo/plannerGovernancePort';
class GovernanceBinding {
  private state = { port: currentPlannerGovernancePort(), owned: currentPlannerGovernancePort() !== null };
  get = () => {
    const next = currentPlannerGovernancePort();
    if (next !== this.state.port) this.state = { port: next, owned: this.state.owned || next !== null };
    return this.state;
  };
  subscribe = (fn: () => void) =>
    subscribePlannerGovernance(() => {
      this.get();
      fn();
    });
}
/** A controller that joined the cohort never falls back to legacy writers after release. */
export function usePlannerGovernanceBinding() {
  const local = useMemo(() => new GovernanceBinding(), []);
  return useSyncExternalStore(local.subscribe, local.get, local.get);
}
