import { useLayoutEffect, useRef } from 'react';
import {
  BookingCompanionUnavailable,
  currentPlannerBookingPort,
  type PlannerBookingRequest,
  type PlannerBookingSession,
} from '../../repo/plannerBookingPort';
/** One opening owns original context, even if props refresh or the cohort is released. */
export function usePlannerBookingForm(open: boolean, request: PlannerBookingRequest) {
  const opening = useRef<{
    closed: boolean;
    task: Promise<PlannerBookingSession>;
    close: () => void;
    failure: unknown;
  } | null>(null);
  const controlled = useRef(false);
  useLayoutEffect(() => {
    if (!open) return;
    const port = currentPlannerBookingPort();
    controlled.current = port !== null;
    if (!port) return;
    const task = port.open(structuredClone(request));
    const item = {
      closed: false,
      failure: null as unknown,
      task,
      close: () => {
        item.closed = true;
        void task.then(
          (s) => s.close(),
          () => {}
        );
      },
    };
    opening.current = item;
    void task.catch((error) => {
      item.failure = error;
    }); // Save reports an opening refusal; never an unhandled background rejection.
    return () => {
      item.close();
      if (opening.current === item) opening.current = null;
    };
    // Exact opening-time options are intentional; background reads must not rebase typed edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request.tripId, request.original?.id]);
  const guard = () => {
    if (controlled.current || currentPlannerBookingPort()) throw new BookingCompanionUnavailable();
  };
  return {
    active: () => controlled.current || currentPlannerBookingPort() !== null,
    guard,
    report: (error: unknown, report: (message: string) => void, fallback: string) => {
      if (!controlled.current && !currentPlannerBookingPort()) throw error;
      report(error instanceof Error ? error.message : fallback);
    },
    close: () => opening.current?.close(),
    save: async (data: Record<string, unknown>, effects: readonly string[] | BookingFormEffects) => {
      const item = opening.current;
      if (!item || item.closed) throw new Error('Open the booking form again before saving.');
      if (item.failure) throw item.failure;
      const session = await item.task;
      if (item.closed) throw new Error('This booking form was closed.');
      const saved = await session.save(
        data,
        Array.isArray(effects) ? effects : formEffects(effects as BookingFormEffects)
      );
      if (item.closed) throw new Error('This booking form was closed.');
      return saved;
    },
  };
}

export type BookingFormEffects = { travelers: boolean; files: number; cost: unknown; importing: unknown };
function formEffects(effects: BookingFormEffects) {
  return Object.entries(effects)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
}
