import { useLayoutEffect, useMemo } from 'react';
import { hasReadOnlySession } from '../../db/readOnlySession';
import type { PackingOrderObservation } from '../../integrations/family/packingAggregateComposer';
import { currentPlannerPackingPort } from '../../repo/plannerPackingPort';
import { captureReadSession } from '../../sync/readSession';

function createCategoryOrderOwner({
  port,
  trip,
  view,
  signature,
  eligible,
}: {
  port: ReturnType<typeof currentPlannerPackingPort>;
  trip: number;
  view: 'common' | 'personal';
  signature: string;
  eligible: boolean;
}) {
  let active = true,
    binding: PackingOrderObservation | null = null,
    flight = false;
  const keys = JSON.parse(signature) as string[],
    session = captureReadSession();
  const available = () =>
    active &&
    !hasReadOnlySession() &&
    eligible &&
    !!port?.categoryAggregateMode?.() &&
    !!port.observeCategoryOrder &&
    port === currentPlannerPackingPort() &&
    session.current();
  return {
    available,
    activate: () => {
      active = true;
    },
    dispose: () => {
      active = false;
      binding?.close();
    },
    begin: (report: (error: unknown) => void) => {
      if (!available() || flight) return null;
      binding?.close();
      try {
        binding = port?.observeCategoryOrder?.(trip, view, keys) ?? null;
      } catch (error) {
        report(error);
        return null;
      }
      const original = binding;
      return (from: string, to: string) => {
        if (!original || !available() || !original.current() || flight) return;
        const order = [...keys],
          a = order.indexOf(from),
          b = order.indexOf(to);
        if (a < 0 || b < 0 || a === b) return;
        order.splice(a, 1);
        order.splice(b, 0, from);
        flight = true;
        void original
          .save(order)
          .catch((error) => report(error))
          .finally(() => {
            flight = false;
            original.close();
          });
      };
    },
  };
}
/** Capture the complete original lane at native drag start, never at a later drop. */
export function usePackingCategoryOrder(args: {
  trip: number;
  view: 'common' | 'personal';
  keys: string[];
  eligible: boolean;
  report: (error: unknown) => void;
}) {
  const port = currentPlannerPackingPort(),
    signature = JSON.stringify(args.keys);
  const owner = useMemo(
    () =>
      createCategoryOrderOwner({
        port,
        trip: args.trip,
        view: args.view,
        signature,
        eligible: args.eligible,
      }),
    [port, args.trip, args.view, args.eligible, signature]
  );
  useLayoutEffect(() => {
    owner.activate();
    return () => owner.dispose();
  }, [owner]);
  return { ...owner, begin: () => owner.begin(args.report) };
}
