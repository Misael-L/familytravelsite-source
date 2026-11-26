import type { Assignment, Place } from '../types';
import type { PlaceSubmitData } from '../types/placeForm';
export type PlannerEditorRequest = { tripId: number; place: Place; assignmentId: number | null };
export type PlannerEditorPort = {
  openEditor: (request: PlannerEditorRequest) => Promise<{ place: Place; assignment: Assignment | null }>;
  saveForm: (
    request: PlannerEditorRequest,
    data: PlaceSubmitData
  ) => Promise<{ id: number; state: 'published' | 'draft' }>;
  confirmEditor: (result: { place: Place; assignment: Assignment | null }) => Promise<void>;
  selectedAssignment: (placeId: number | null) => Assignment | null;
  cancelEditor: () => void;
  reportError: (error: unknown) => void;
};
let port: PlannerEditorPort | null = null;
export function currentPlannerEditorPort() {
  return port;
}
export function installPlannerEditorPort(next: PlannerEditorPort) {
  if (port) throw new Error('A planner editor is already installed');
  port = next;
  return () => {
    if (port === next) port = null;
  };
}
