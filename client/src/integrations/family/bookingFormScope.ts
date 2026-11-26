import { createContext, useContext } from 'react';
import { assertBookingCompanionAllowed } from '../../repo/plannerBookingPort';
export const BookingFormCompanionGuard = createContext<(() => void) | null>(null);
export function useBookingCompanionGuard() {
  return useContext(BookingFormCompanionGuard) ?? assertBookingCompanionAllowed;
}
