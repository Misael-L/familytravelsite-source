import type { PlannerReadPort } from '../../repo/plannerReadPort';
import { offlineTripQualificationEnabled } from './offlineTripQualification';
import { currentOfflineTripSession } from './offlineTripSession';
export function withOfflineTripReads(base: PlannerReadPort): PlannerReadPort {
  if (!offlineTripQualificationEnabled()) return base;
  const load = (trip: number | string, fallback: PlannerReadPort['loadTrip']) => {
    const session = currentOfflineTripSession();
    return session
      ? session.load(trip)
      : fallback
        ? fallback(trip)
        : Promise.reject(new Error('Trip reader is unavailable.'));
  };
  return {
    ...base,
    ...(base.stays
      ? {
          stays: async (trip: number | string) => {
            const session = currentOfflineTripSession();
            if (!session) {
              const live = base.stays;
              if (!live) throw new Error('The original stay reader ended.');
              return live(trip);
            }
            await session.load(trip);
            const view = session.currentStays(trip);
            if (!view) throw new Error('This saved Trip has no qualified stay projection.');
            return view;
          },
          currentStays: (trip: number | string) =>
            currentOfflineTripSession()?.currentStays(trip) ??
            (currentOfflineTripSession() ? undefined : base.currentStays?.(trip)),
        }
      : {}),
    loadTrip: (trip) => load(trip, base.loadTrip),
    hydrateTrip: (trip) => load(trip, base.hydrateTrip),
    refreshPlanner: (trip) => load(trip, base.refreshPlanner),
    reloadBudget: (trip) => load(trip, base.reloadBudget),
    reloadFiles: (trip) => load(trip, base.reloadFiles),
    reloadReservations: (trip) => load(trip, base.reloadReservations),
  };
}
