import type { Accommodation, BudgetItem, Day, PackingItem, Place, Reservation, TodoItem, TripMember } from '../types';
export type PlannerStayRead = { accommodations: Accommodation[]; reservations: Reservation[]; generation: string };
export type PlannerReadPort = {
  stays?: (trip: number | string) => Promise<PlannerStayRead>;
  currentStays?: (trip: number | string) => PlannerStayRead | undefined;
  budget?: (trip: number | string) => Promise<{ items: BudgetItem[] }>;
  members?: (trip: number | string) => Promise<{ members: TripMember[]; owner?: TripMember }>;
  loadTrip?: (trip: number | string) => Promise<void>;
  hydrateTrip?: (trip: number | string) => Promise<void>;
  refreshPlanner?: (trip: number | string) => Promise<void>;
  reloadBudget?: (trip: number | string) => Promise<void>;
  reloadFiles?: (trip: number | string) => Promise<void>;
  reloadReservations?: (trip: number | string) => Promise<void>;
  reservations?: (trip: number | string) => Promise<{ reservations: Reservation[] }>;
  packing?: (trip: number | string) => Promise<{ items: PackingItem[] }>;
  todos?: (trip: number | string) => Promise<{ items: TodoItem[] }>;
  places: (trip: number | string, params?: Record<string, unknown>) => Promise<{ places: Place[] }>;
  days: (trip: number | string) => Promise<{ days: Day[] }>;
};
let port: PlannerReadPort | null = null;
/** Exclusive native read ownership, installed together with the qualified Family writers/controller. */
export function installPlannerReadPort(next: PlannerReadPort): () => void {
  if (port) throw new Error('A planner read port is already installed');
  port = next;
  return () => {
    if (port === next) port = null;
  };
}
export function currentPlannerReadPort(): PlannerReadPort | null {
  return port;
}
export function guardPlannerReadOnly(): void {
  if (port) throw new Error('Native planner writes are not cut over; queued intent remains unchanged.');
}
