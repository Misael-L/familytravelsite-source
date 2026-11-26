import type { DayNoteCreateRequest, DayNoteUpdateRequest } from '@trek/shared';
import type { DayNote } from '../types';
export type PlannerDayNotePort = {
  create(trip: number | string, day: number, data: DayNoteCreateRequest): Promise<{ note: DayNote }>;
  update(trip: number | string, day: number, before: DayNote, data: DayNoteUpdateRequest): Promise<{ note: DayNote }>;
  delete(trip: number | string, day: number, id: number): Promise<void>;
  move(trip: number | string, day: number, before: DayNote, order: number): Promise<{ note: DayNote }>;
};
let port: PlannerDayNotePort | null = null;
export const currentPlannerDayNotePort = () => port;
export function installPlannerDayNotePort(next: PlannerDayNotePort) {
  if (port) throw new Error('A planner day note port is already installed');
  port = next;
  return () => { if (port === next) port = null; };
}
