import type { ReactNode } from 'react';
import { BookingFormCompanionGuard } from './bookingFormScope';
export function PlannerBookingFormScope({ guard, children }: { guard: () => void; children: ReactNode }) {
  return <BookingFormCompanionGuard.Provider value={guard}>{children}</BookingFormCompanionGuard.Provider>;
}
