import type { TripUpdateRequest } from '@trek/shared';
import type { Day, Trip } from '../types';
export type PlannerCalendarPort = {
  prepareTrash: (trip: number | string, day: number) => Promise<() => Promise<{ undo: () => Promise<void> }>>;
  prepareRemove: (trip: number | string, day: number) => Promise<() => Promise<{ undo: () => Promise<void> }>>;
  remove: (trip: number | string, day: number) => Promise<{ undo: () => Promise<void> }>;
  insert: (trip: number | string, position: number) => Promise<{ day: Day; undo?: () => Promise<void> }>;
  reorder: (trip: number | string, days: number[]) => Promise<{ undo?: () => Promise<void> }>;
  rename: (trip: number | string, day: number, title: string | null) => Promise<void>;
  append: (trip: number | string, position?: number) => Promise<Day>;
  extendTrip: (trip: number | string, data: TripUpdateRequest) => Promise<Trip>;
};
let port: PlannerCalendarPort | null = null;
export const currentPlannerCalendarPort = () => port;
export function installPlannerCalendarPort(next: PlannerCalendarPort) {
  if (port) throw new Error('A planner calendar port is already installed');
  port = next;
  return () => {
    if (port === next) port = null;
  };
}

/** Only uncertain/transient command failures should remain in native Undo history. */
export class RetryableCalendarUndoError extends Error {
  constructor(readonly original: unknown) {
    super(original instanceof Error ? original.message : 'Calendar Undo needs another attempt.');
    this.name = 'RetryableCalendarUndoError';
  }
}
export function recordCalendarUndo(
  push: (label: string, undo: () => Promise<void>) => void,
  label: string,
  undo: () => Promise<void>,
  completed?: () => void
) {
  const retry = async () => {
    try {
      await undo();
    } catch (error) {
      if (error instanceof RetryableCalendarUndoError) push(label, retry);
      throw error;
    }
    completed?.();
  };
  push(label, retry);
}
