import { useLayoutEffect, useMemo } from 'react';
import {
  currentPlannerPackingPort,
  packingActionAvailable,
  type PackingGroupIntent,
  type PackingGroupObservation,
  type PackingGroupSelection,
} from '../../repo/plannerPackingPort';
import { captureReadSession } from '../../sync/readSession';
import type { PackingItem } from '../../types';
import { packingViewItems, type PackingStatusFilter, type PackingView } from './packingListModel';

type Entry = {
  observation: PackingGroupObservation;
  session: ReturnType<typeof captureReadSession>;
  intent: string | null;
  flight: Promise<void> | null;
  completed: boolean;
};
/** A menu/confirmation owns one observed set. Rerenders and uncertain replies cannot replace it. */
export function createPackingGroupActions(
  trip: number | string,
  view: PackingView,
  status: PackingStatusFilter,
  port = currentPlannerPackingPort()
) {
  const entries = new Map<string, Entry>();
  let active = true;
  const changed = () => new Error('The original packing group ended. Reopen or recover it before saving.');
  const current = (e?: Entry) => active && port === currentPlannerPackingPort() && (!e || e.session.current());
  const close = (key: string, force = false) => {
    const e = entries.get(key);
    if (e && (force || e.intent === null || e.completed)) {
      e.observation.close();
      entries.delete(key);
    }
  };
  const begin = (key: string, selector: PackingGroupSelection, rows: PackingItem[]) => {
    if (!current() || !port?.observeGroup) throw changed();
    const previous = entries.get(key);
    if (previous && !previous.completed && previous.intent !== null && !previous.observation.settled?.()) return; // Exact original retry only.
    close(key, true);
    entries.set(key, {
      observation: port.observeGroup(trip, selector, rows),
      session: captureReadSession(),
      intent: null,
      flight: null,
      completed: false,
    });
  };
  const save = async (key: string, intent: PackingGroupIntent) => {
    const e = entries.get(key);
    if (!e || !current(e) || e.completed) throw changed();
    const identity = JSON.stringify(intent);
    if (e.intent !== null && e.intent !== identity)
      throw new Error('Resolve the original packing group before another action.');
    e.intent ??= identity;
    if (e.flight !== null) return e.flight;
    e.flight = (async () => {
      await e.observation.submit(structuredClone(intent));
      if (!current(e)) throw changed();
      e.completed = true;
    })();
    try {
      await e.flight;
    } finally {
      e.flight = null;
    }
  };
  return {
    family: port !== null,
    aggregate: port?.categoryAggregateMode?.() === true,
    available: (action: 'packed-state' | 'trash' | 'clear-completed', authorized = true, key?: string) =>
      packingActionAvailable(action, authorized) &&
      !(action === 'trash' && port?.categoryAggregateMode?.() && status !== 'all') &&
      (!port?.categoryIdentityMode?.() ||
        (action === 'clear-completed'
          ? !!port.clearCompletedAvailable?.(trip, view)
          : !key || !!port.categoryGroupAvailable?.(trip, key, action))),
    activate: () => {
      active = true;
    },
    dispose: () => {
      active = false;
      for (const key of entries.keys()) close(key, true);
    },
    beginCategory: (label: string, rows: PackingItem[], all: PackingItem[], defaultCategory: string) => {
      if (port?.categoryIdentityMode?.()) {
        if (!current() || !port.observeIdentityCategory) throw changed();
        const key = 'category:' + label,
          previous = entries.get(key);
        if (previous && !previous.completed && previous.intent !== null && !previous.observation.settled?.()) return;
        close(key, true);
        entries.set(key, {
          observation: port.observeIdentityCategory(trip, label, { view, status, categories: [] }, rows),
          session: captureReadSession(),
          intent: null,
          flight: null,
          completed: false,
        });
        return;
      }
      const labels = [
        ...new Set(
          packingViewItems(all, view)
            .filter((r) => (r.category || defaultCategory) === label)
            .map(({ category }) => {
              // The group contract requires stored labels, including the empty string.
              if (category == null) throw changed();
              return category;
            })
        ),
      ];
      begin('category:' + label, { view, status, categories: labels }, rows);
    },
    cancelCategory: (label: string) => close('category:' + label),
    packed: (label: string, checked: boolean) =>
      save('category:' + label, { action: 'group-packed-state', values: { checked } }),
    trash: (label: string) => save('category:' + label, { action: 'group-trash', values: {} }),
    beginClear: (all: PackingItem[]) =>
      begin('clear', { view, status: 'all', categories: null }, packingViewItems(all, view)),
    cancelClear: () => close('clear'),
    clear: () => save('clear', { action: 'clear-completed', values: {} }),
  };
}
export type NativePackingGroupActions = ReturnType<typeof createPackingGroupActions>;
export function usePackingGroupActions(trip: number | string, view: PackingView, status: PackingStatusFilter) {
  const port = currentPlannerPackingPort();
  const owner = useMemo(() => createPackingGroupActions(trip, view, status, port), [trip, view, status, port]);
  useLayoutEffect(() => {
    owner.activate();
    return () => owner.dispose();
  }, [owner]);
  return owner;
}
