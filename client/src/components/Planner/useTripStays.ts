import { useCallback, useRef } from 'react';
import { currentPlannerReadPort } from '../../repo/plannerReadPort';

import { accommodationRepo } from '../../repo/accommodationRepo';
import { useTripStore } from '../../store/tripStore';
import type { Accommodation } from '../../types';
import { useStayActionScope, useStayState } from './stayActionScope';
import { useStaysRefresh } from './useStaysRefresh';

/**
 * The planner's stays: the trip's whole list, which the sidebar, the map and the
 * phone's day sheet read. They live here rather than in the trip store, so a stay
 * written elsewhere (the assistant, a fellow traveller, a plugin, a booking
 * import) reaches them as a nudge, and `useStaysRefresh` folds a burst of nudges
 * into one read.
 *
 * A read takes the stays' bookings along, since a stay is booked as a hotel
 * reservation. The newest read wins: the read after an own write and the one for
 * a stay written elsewhere can be on their way at once, and the older answer must
 * not land over the newer one.
 */
const EMPTY_STAYS: Accommodation[] = [];

export function useTripStays(tripId: number) {
  const capture = useStayActionScope(tripId);
  const [tripAccommodations, setTripAccommodations] = useStayState<Accommodation[]>(capture, EMPTY_STAYS);
  const latestRead = useRef(0);
  const reservations = useTripStore((s) => s.reservations);
  const port = currentPlannerReadPort();
  const paired = port?.currentStays?.(tripId);
  const coherent = Boolean(port?.stays);

  const readStays = useCallback(async () => {
    if (!tripId) return;
    const action = capture();
    if (!action.current()) return;
    const read = ++latestRead.current;
    const pairedPort = currentPlannerReadPort();
    const readPaired = pairedPort?.stays;
    if (readPaired) {
      try {
        await action.perform(() => readPaired(tripId));
      } catch {
        // The cohort reports this read refusal on its owned planner boundary; preserve the last paired generation.
        return;
      }
      return;
    }
    // Each read can fail independently; cancellation never becomes an unhandled task.
    await Promise.allSettled([
      action
        .perform(() => accommodationRepo.list(tripId))
        .then(
          (d) => {
            action.effect(() => {
              if (read === latestRead.current) setTripAccommodations(d.accommodations || []);
            });
          },
          // A read that fails keeps the stays on show; the next nudge reads them again.
          () => {}
        ),
      action.perform(() => useTripStore.getState().loadReservations(tripId)),
    ]);
  }, [tripId, capture, setTripAccommodations]);

  const loadAccommodations = useCallback(() => {
    void readStays();
  }, [readStays]);

  useStaysRefresh(readStays);

  return {
    tripAccommodations: coherent
      ? paired?.reservations === reservations
        ? paired.accommodations
        : EMPTY_STAYS
      : tripAccommodations,
    setTripAccommodations,
    loadAccommodations,
  };
}
