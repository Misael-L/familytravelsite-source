import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { packingCategoryId } from '../../repo/packingCategoryPresentation';
import { currentPlannerPackingPort, subscribePlannerPackingPort } from '../../repo/plannerPackingPort';
import { createSavedPackingSelection, subscribeSavedPackingReadPort } from '../../repo/savedPackingReadPort';
import { useAddonStore } from '../../store/addonStore';
import { useTripStore } from '../../store/tripStore';
import type { PackingItem } from '../../types';
const emptySubscribe = () => () => {};
const emptySnapshot = () => null;
/** Ancillary consumers share the owner's complete publication, including empty/retired views. */
export function usePackingSnapshot(trip: number | string) {
  const port = useSyncExternalStore(subscribePlannerPackingPort, currentPlannerPackingPort, emptySnapshot),
    native = useTripStore((s) => s.trip?.id);
  const ownership = useRef({ trip: String(trip), owned: false });
  if (ownership.current.trip !== String(trip)) ownership.current = { trip: String(trip), owned: false };
  const selection = useMemo(() => createSavedPackingSelection(trip), [trip]);
  const savedOwnership = useSyncExternalStore(subscribeSavedPackingReadPort, selection, selection);
  const { reader } = savedOwnership;
  const online = useSyncExternalStore(
    port?.subscribe ?? emptySubscribe,
    port?.snapshot ?? emptySnapshot,
    emptySnapshot
  );
  const savedSnapshot = useCallback(() => reader?.snapshot(trip) ?? null, [reader, trip]);
  const saved = useSyncExternalStore(subscribeSavedPackingReadPort, savedSnapshot, emptySnapshot);
  ownership.current.owned ||= port !== null || reader !== null || savedOwnership.owned;
  return {
    port,
    reader,
    owned: ownership.current.owned,
    view: String(native) === String(trip) ? (reader ? saved : online) : null,
  };
}

/** The Family cohort supplies qualified bags/weights; the ordinary server keeps its own add-on setting. */
export function usePackingBagTracking(trip: number | string) {
  const configured = useAddonStore((s) => s.bagTracking);
  const { owned, view } = usePackingSnapshot(trip);
  return owned ? view !== null : configured;
}

/** The canonical cohort owns category metadata, including empty cards; rows never invent it. */
export function usePackingCategoryViews(trip: number | string, view: 'common' | 'personal', items: PackingItem[]) {
  const snapshot = usePackingSnapshot(trip),
    categories = snapshot.view?.categoryViews;
  return useMemo(
    () =>
      categories
        ? categories.filter((c) => (c.ownerPersonId !== null) === (view === 'personal'))
        : items.some((i) => packingCategoryId(i) !== null)
          ? []
          : undefined,
    [categories, view, items]
  );
}
