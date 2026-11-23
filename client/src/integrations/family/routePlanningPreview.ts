import { isPrimaryMexicoPreviewBuild, primaryCoreMode } from './corePrimaryProfile';

declare const __FAMILY_MEXICO_PREVIEW_TRIP__: string | null;

const tripPath = /^\/trips\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/;

export function isHostedMexicoPreview(): boolean {
  return typeof window !== 'undefined' && isPrimaryMexicoPreviewBuild() &&
    primaryCoreMode(undefined, window.location.origin) === 'read';
}

export function hostedRoadtripToursTripId(): string | null {
  return isHostedMexicoPreview() ? tripPath.exec(window.location.pathname)?.[1] ?? null : null;
}

// Fixture-only sections and editors require the configured trip.
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
  return typeof trip === 'string' && tripPath.exec(window.location.pathname)?.[1] === trip ? trip : null;
}

export function isFamilyRoutePlanningPreview(): boolean {
  return routePlanningPreviewTripId() !== null;
}

export function isRoutePlanningFixture(tripId: string): boolean {
  return tripId === routePlanningPreviewTripId();
}

export function isFamilyRoadtripToursPreview(): boolean {
  return hostedRoadtripToursTripId() !== null || isFamilyRoutePlanningPreview();
}

export function isHostedOrdinaryTripPreview(): boolean {
  return hostedRoadtripToursTripId() !== null && !isFamilyRoutePlanningPreview();
}
