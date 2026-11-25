import type { Assignment } from '../types';
import type { PlaceSubmitData } from '../types/placeForm';
export type PlannerCreationContext = { tripId: number | string; dayId: number | null; position: number | null };
export type PlannerCreationPort = {
  beginForm: (context: PlannerCreationContext) => Promise<void>;
  cancelForm: () => void;
  createForm: (
    context: PlannerCreationContext,
    data: PlaceSubmitData
  ) => Promise<{ id: number; state: 'published' | 'draft' }>;
  assign: (
    trip: number | string,
    day: number | string,
    place: number | string,
    position?: number | null,
    stage?: string
  ) => Promise<Assignment>;
  reportError: (error: unknown) => void;
};
let port: PlannerCreationPort | null = null;
export const currentPlannerCreationPort = () => port;
export function installPlannerCreationPort(next: PlannerCreationPort) {
  if (port) throw new Error('A planner creation port is already installed');
  port = next;
  return () => {
    if (port === next) port = null;
  };
}
