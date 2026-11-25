import type { Accommodation, Place, Reservation } from '../types';
export type PlannerBookingRequest = {
  tripId: number | string;
  original: Reservation | null;
  accommodations: Accommodation[];
  places: Pick<Place, 'id' | 'address'>[];
  withCheckInEnd: boolean;
};
export type PlannerBookingSession = {
  save: (data: Record<string, unknown>, effects: readonly string[]) => Promise<Reservation>;
  close: () => void;
};
export type PlannerBookingPort = { open: (request: PlannerBookingRequest) => Promise<PlannerBookingSession> };
let port: PlannerBookingPort | null = null;
export const currentPlannerBookingPort = () => port;
export function installPlannerBookingPort(next: PlannerBookingPort) {
  if (port) throw new Error('A planner booking port is already installed');
  port = next;
  return () => {
    if (port === next) port = null;
  };
}
/** Preserve parked native writers; form actions must use the observed session first. */
export function assertRawBookingSaveAllowed(latched = false) {
  if (latched || port) throw new Error('Open the booking form again before saving.');
}
export class BookingCompanionUnavailable extends Error {
  constructor() {
    super('Booking file and cost changes are not available in this planner session yet.');
    this.name = 'BookingCompanionUnavailable';
  }
}
export function assertBookingCompanionAllowed() {
  if (port) throw new BookingCompanionUnavailable();
}
