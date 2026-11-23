import { useTripStore } from '../../store/tripStore';

/**
 * TripFormModal's onCoverUpdate for the open trip: the new cover goes straight into
 * the store's trip, so the planner shows it without reloading the trip.
 */
export function applyTripCoverUpdate(tripId: number, coverUrl: string | null): void {
  useTripStore.setState((state) => ({
    trip: state.trip?.id === tripId ? { ...state.trip, cover_image: coverUrl } : state.trip,
  }));
}
