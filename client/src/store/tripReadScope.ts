import { captureReadSession } from '../sync/readSession';
let generation = 0;
/** Resetting/leaving a trip invalidates reads even if the same numeric trip is opened again. */
export function invalidateTripReads(): void {
  generation++;
}
export function captureTripLoad() {
  const session = captureReadSession(),
    started = generation;
  return {
    ...session,
    contextCurrent: () => session.contextCurrent() && started === generation,
    current: () => session.current() && started === generation,
  };
}
export function captureTripRead(tripId: number | string, get: () => { trip: { id: number } | null }): () => boolean {
  const session = captureTripLoad();
  return () => session.current() && (get().trip === null || String(get().trip?.id) === String(tripId));
}
