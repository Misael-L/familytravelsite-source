import { isPrimaryMexicoPreviewBuild, primaryCoreMode } from './corePrimaryProfile';

declare const __FAMILY_MEXICO_PREVIEW_TRIP__: string | null;

export function isHostedMexicoPreview(): boolean {
  return typeof window !== 'undefined' && isPrimaryMexicoPreviewBuild() &&
    primaryCoreMode(undefined, window.location.origin) === 'read';
}

// Only a qualified build can expose these sections on its designated trip.
export function routePlanningPreviewTripId(): string | null {
  if (typeof window === 'undefined') return null;
  const origin = 'http://127.0.0.1:55671';
  let trip: unknown = null;
  if (isPrimaryMexicoPreviewBuild()) {
    if (isHostedMexicoPreview() && typeof __FAMILY_MEXICO_PREVIEW_TRIP__ !== 'undefined')
      trip = __FAMILY_MEXICO_PREVIEW_TRIP__;
  } else if (import.meta.env.VITE_SUPABASE_URL === origin && window.location.origin === origin) {
    trip = import.meta.env.VITE_FAMILY_ROUTE_PLANNING_FIXTURE;
  }
  return typeof trip === 'string' &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(trip) &&
    window.location.pathname === `/trips/${trip}` ? trip : null;
}

export function isFamilyRoutePlanningPreview(): boolean {
  return routePlanningPreviewTripId() !== null;
}

export function isRoutePlanningFixture(tripId: string): boolean {
  return tripId === routePlanningPreviewTripId();
}
