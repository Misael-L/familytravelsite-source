import { useMemo } from 'react';
import { currentPlannerPackingPort, type PlannerPackingPort } from '../../repo/plannerPackingPort';
import { useTripStore } from '../../store/tripStore';
import { FamilyPlannerTaskRecovery } from './FamilyPlannerTaskRecovery';
export function FamilyPackingPending({
  port,
  trip,
  updated,
}: {
  port: PlannerPackingPort;
  trip: number | string;
  updated: () => Promise<void>;
}) {
  const recovery = useMemo(() => port.recovery?.(), [port, trip]);
  const problem = useMemo(
    () => ({
      current: () =>
        currentPlannerPackingPort() === port &&
        port.snapshot() !== null &&
        String(useTripStore.getState().trip?.id) === String(trip),
      retry: async () => {
        if (!port.reloadPacking) throw Error('Packing refresh unavailable');
        await port.reloadPacking();
        await updated();
      },
    }),
    [port, trip, updated]
  );
  return recovery ? <FamilyPlannerTaskRecovery recovery={recovery} problem={problem} /> : null;
}
