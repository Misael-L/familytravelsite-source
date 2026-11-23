import type { Accommodation } from '../../types';
import type { BookingStayView } from './bookingStayContract';
// Private, original object observations; never serialized into native rows or accepted from request bodies.
const observations = new WeakMap<
  Accommodation,
  { core: BookingStayView; native: Accommodation; fence: () => Promise<void> }
>();
const cohorts = new WeakMap<
  Accommodation[],
  { core: BookingStayView; native: Accommodation[]; fence: () => Promise<void> }
>();
export const originalNativeStayCohort = (rows: Accommodation[]) => {
  const witness = cohorts.get(rows);
  return witness
    ? { core: structuredClone(witness.core), native: structuredClone(witness.native), fence: witness.fence }
    : undefined;
};
export function observeNativeStays(rows: Accommodation[], core: BookingStayView, fence: () => Promise<void>) {
  const original = structuredClone(core);
  cohorts.set(rows, { core: original, native: structuredClone(rows), fence });
  for (const row of rows) observations.set(row, { core: original, native: structuredClone(row), fence });
}
export const originalNativeStay = (row: Accommodation) => {
  const witness = observations.get(row);
  return witness
    ? { core: structuredClone(witness.core), native: structuredClone(witness.native), fence: witness.fence }
    : undefined;
};
