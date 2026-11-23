import { useLayoutEffect, useMemo } from 'react';
import {
  bindPackingOrigin,
  currentPlannerPackingPort,
  type PackingEditOrigin,
  type PackingValues,
} from '../../repo/plannerPackingPort';
import { captureReadSession } from '../../sync/readSession';
import type { PackingItem } from '../../types';

type Write = (values: PackingValues, origin?: PackingEditOrigin) => Promise<PackingItem>;
type Draft = {
  origin?: PackingEditOrigin;
  current: () => boolean;
  payload?: string;
  flight?: Promise<PackingItem>;
  completed: boolean;
};
/** One actual draft, one original observation and one immutable logical save. */
export function createPackingDraft(trip: number | string) {
  let active = true,
    draft: Draft | null = null;
  const changed = () => new Error('The original packing draft ended. Reopen it before saving.');
  const owns = (entry: Draft) => active && entry === draft && entry.current() && (entry.origin?.current() ?? true);
  const cancel = () => {
    draft?.origin?.close();
    draft = null;
  };
  const begin = (item: PackingItem | null) => {
    if (!active) throw changed();
    if (draft && !draft.completed) return false;
    cancel();
    const port = currentPlannerPackingPort(),
      session = captureReadSession();
    const origin = bindPackingOrigin(item, trip);
    draft = { origin, completed: false, current: () => session.current() && port === currentPlannerPackingPort() };
    return true;
  };
  return {
    activate: () => {
      active = true;
    },
    dispose: () => {
      active = false;
      cancel();
    },
    begin,
    cancel,
    isOpen: () => !!draft && !draft.completed && owns(draft),
    guard: () => {
      const entry = draft,
        port = currentPlannerPackingPort(),
        session = captureReadSession();
      return entry
        ? () => owns(entry)
        : () => active && port === null && port === currentPlannerPackingPort() && session.current();
    },
    async save(values: PackingValues, write: Write) {
      if (currentPlannerPackingPort() === null && !draft?.origin) {
        if (!active || (draft && !owns(draft))) throw changed();
        return write(values);
      }
      if (!draft && currentPlannerPackingPort() === null) begin(null);
      const entry = draft;
      if (!entry || !owns(entry)) throw changed();
      const payload = JSON.stringify(Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))));
      if (entry.payload !== undefined && entry.payload !== payload)
        throw new Error('Retry the unresolved packing save unchanged before another edit.');
      entry.payload ??= payload;
      if (entry.flight === undefined) {
        const savedValues = structuredClone(values);
        entry.flight = Promise.resolve()
          .then(() => {
            if (!owns(entry)) throw changed();
            return write(savedValues, entry.origin);
          })
          .then((result) => {
            if (!owns(entry)) throw changed();
            entry.completed = true;
            return result;
          })
          .catch((error) => {
            entry.flight = undefined;
            throw error;
          });
      }
      return entry.flight;
    },
  };
}
export function usePackingDraft(trip: number | string) {
  const draft = useMemo(() => createPackingDraft(trip), [trip]);
  useLayoutEffect(() => {
    draft.activate();
    return () => draft.dispose();
  }, [draft]);
  return draft;
}
