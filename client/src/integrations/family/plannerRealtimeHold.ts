import { onFamilyActorChange } from './actorEvents';

type Flight = { writers: number; pending?: () => void; timer?: ReturnType<typeof setTimeout> };
const flights = new Map<string, Flight>();

/** Defer, never discard, a live notice while a save publishes its canonical result. */
export function holdPlannerRealtime(trip: string) {
  const flight = flights.get(trip) ?? { writers: 0 };
  flights.set(trip, flight);
  flight.writers++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (flights.get(trip) !== flight) return;
    flight.writers--;
    if (flight.writers) return;
    if (!flight.pending) { flights.delete(trip); return; }
    if (flight.timer !== undefined) return;
    // Allow the completed save's promise/UI continuations to finish first.
    flight.timer = setTimeout(() => {
      flight.timer = undefined;
      if (flights.get(trip) !== flight || flight.writers) return;
      flights.delete(trip);
      flight.pending?.();
    }, 0);
  };
}

export function afterPlannerSave(trip: string, notify: () => void) {
  const flight = flights.get(trip);
  if (flight) flight.pending = notify;
  else notify();
}

onFamilyActorChange(() => {
  for (const flight of flights.values()) if (flight.timer !== undefined) clearTimeout(flight.timer);
  flights.clear();
});
