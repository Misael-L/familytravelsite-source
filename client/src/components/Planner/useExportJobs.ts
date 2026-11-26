import { useMemo } from 'react';
import { useStayActionScope, useStayState } from './stayActionScope';

export type ExportJob = 'pdf' | 'pdf:mine' | 'ics' | `gpx:${string}`;
const EMPTY_RUNNING: Record<string, ExportJob> = {};

function createExportClaims(capture: ReturnType<typeof useStayActionScope>) {
  const slots = new Map<string, symbol>();
  return (job: ExportJob, exclusive: boolean) => {
    const action = capture(),
      lane = job.split(':')[0];
    if (!action.current() || (exclusive ? slots.size > 0 : slots.has(lane))) return;
    const token = Symbol(job);
    slots.set(lane, token);
    return {
      action,
      lane,
      release: () => {
        if (slots.get(lane) !== token) return false;
        slots.delete(lane);
        return true;
      },
    };
  };
}

/** Claims are synchronous; a second click cannot race React's next render. */
export function useExportJobs(tripId: number, exclusive: boolean) {
  const capture = useStayActionScope(tripId);
  const acquire = useMemo(() => createExportClaims(capture), [capture]);
  const [running, setRunning] = useStayState(capture, EMPTY_RUNNING);
  const claim = (job: ExportJob) => {
    const slot = acquire(job, exclusive);
    if (!slot) return;
    const { action, lane, release } = slot;
    setRunning((previous) => ({ ...previous, [lane]: job }));
    return {
      action,
      finish: () => {
        if (!release()) return;
        action.effect(() =>
          setRunning((previous) => {
            const next = { ...previous };
            delete next[lane];
            return next;
          })
        );
      },
    };
  };
  return {
    claim,
    isRunning: (job: ExportJob) => running[job.split(':')[0]] === job,
    anyRunning: Object.keys(running).length > 0,
  };
}
