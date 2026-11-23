export type PlannerAssignmentRequest =
  | { action: 'move'; trip: number | string; visit: number; from: number; to: number; position?: number | null }
  | { action: 'remove'; trip: number | string; visit: number; day: number }
  | { action: 'reorder'; trip: number | string; day: number; order: number[] }
  | { action: 'clear'; trip: number | string; day: number };
export type PlannerAssignmentOutcome = { state: 'published' | 'draft'; undo?: () => Promise<void> };
export type PlannerAssignmentPort = {
  execute: (request: PlannerAssignmentRequest) => Promise<PlannerAssignmentOutcome>;
  bindUndo?: (undo: () => Promise<void> | void, dayIds?: number[]) => () => Promise<void> | void;
};
let port: PlannerAssignmentPort | null = null;
export const currentPlannerAssignmentPort = () => port;
export function installPlannerAssignmentPort(next: PlannerAssignmentPort) {
  if (port) throw new Error('A planner assignment port is already installed');
  port = next;
  return () => {
    if (port === next) port = null;
  };
}

/** The selected backend binds native history to its original observed state; other backends keep native behavior. */
export function bindPlannerUndo(undo: () => Promise<void> | void, dayIds?: number[]) {
  return port?.bindUndo?.(undo, dayIds) ?? undo;
}
