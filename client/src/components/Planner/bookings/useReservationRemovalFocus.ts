import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Reservation } from '../../../types';

export function phoneReservationListScope(tripId: number, tab: string) {
  return tab === 'transports' || tab === 'buchungen' ? `phone:${tripId}:${tab}` : null;
}

function isVisible(element: HTMLElement) {
  return (
    element.isConnected &&
    !element.closest('[hidden], [inert]') &&
    (element.checkVisibility?.({ visibilityProperty: true }) ?? true)
  );
}

function targetsIn(list: HTMLElement) {
  return Array.from(list.querySelectorAll<HTMLElement>('[data-reservation-focus-id]')).filter(isVisible);
}

interface RemovalFocus {
  list: HTMLElement;
  row: Element;
  id: string;
  neighbors: (string | undefined)[];
  canMoveFocus: () => boolean;
  stop: AbortController;
  settled: boolean;
}

export function useReservationRemovalFocus(scope: string | null, reservations: readonly Reservation[]) {
  const pending = useRef<RemovalFocus | null>(null);
  const [settledCount, setSettledCount] = useState(0);

  const cancel = useCallback(() => {
    pending.current?.stop.abort();
    pending.current = null;
  }, []);
  useLayoutEffect(() => cancel, [scope, cancel]);

  useLayoutEffect(() => {
    const removal = pending.current;
    if (!removal?.settled) return;
    cancel();
    if (!isVisible(removal.list) || !removal.canMoveFocus()) return;

    const retained = reservations.some((reservation) => String(reservation.id) === removal.id);
    if (retained && removal.row.contains(document.activeElement)) return;

    const targets = targetsIn(removal.list);
    const preferred = retained ? [removal.id] : removal.neighbors;
    const target = preferred.map((id) => targets.find((row) => row.dataset.reservationFocusId === id)).find(Boolean);
    const fallback = removal.list.querySelector<HTMLElement>('[data-reservation-focus-fallback]');
    const destination = target ?? (fallback && isVisible(fallback) ? fallback : removal.list);
    destination.focus();
  }, [cancel, reservations, settledCount]);

  return async (id: number, remove: (id: number) => unknown) => {
    cancel();
    const list = Array.from(document.querySelectorAll<HTMLElement>('[data-reservation-list]')).find(
      (element) => element.dataset.reservationList === scope && isVisible(element)
    );
    if (!list) return remove(id);

    const targets = targetsIn(list);
    const index = targets.findIndex((row) => row.dataset.reservationFocusId === String(id));
    const opener = targets[index];
    if (!opener) return remove(id);

    const row = opener.closest('[data-reservation-row-id]') ?? opener;
    const origin = document.activeElement;
    const canMoveFocus = () => {
      const active = document.activeElement;
      return active === document.body || active === origin || row.contains(active);
    };
    const neighbors = [...targets.slice(index + 1), ...targets.slice(0, index).reverse()].map(
      (target) => target.dataset.reservationFocusId
    );
    const stop = new AbortController();
    const request = { list, row, id: String(id), neighbors, canMoveFocus, stop, settled: false };
    pending.current = request;
    document.addEventListener(
      'focusin',
      () => {
        // The closing dialog can return focus to any control in the selected row.
        if (!canMoveFocus()) cancel();
      },
      { signal: stop.signal }
    );

    try {
      return await remove(id);
    } finally {
      // Some refused writes resolve normally. Recheck the list after React commits.
      if (pending.current === request) {
        request.settled = true;
        setSettledCount((count) => count + 1);
      }
    }
  };
}
