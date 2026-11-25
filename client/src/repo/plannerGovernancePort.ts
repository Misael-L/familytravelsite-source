import type { GovernanceCommand, GovernanceGroup, GovernanceView } from '../integrations/family/governanceContract';
export type GovernanceRead = GovernanceView & { source_url: string };
export type GovernanceIntent = {
  action: GovernanceCommand['action'];
  target: string;
  observation: GovernanceGroup;
  parameters: Record<string, unknown>;
};
export type PlannerGovernancePort = {
  read: (trip: string) => Promise<GovernanceRead>;
  execute: (trip: string, intent: GovernanceIntent, context: GovernanceRead) => Promise<void>;
  setLayer: (trip: string, layer: 'published' | 'myDraft') => Promise<void>;
};
let port: PlannerGovernancePort | null = null;
const listeners = new Set<() => void>();
export const currentPlannerGovernancePort = () => port;
export function subscribePlannerGovernance(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function installPlannerGovernancePort(next: PlannerGovernancePort) {
  if (port) throw new Error('Planner governance already installed');
  port = next;
  listeners.forEach((fn) => fn());
  return () => {
    if (port === next) {
      port = null;
      listeners.forEach((fn) => fn());
    }
  };
}
