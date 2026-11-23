import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import type { PackingBagInfo } from '../../components/Packing/packingExport';
import { isPackingPlaceholder, packingViewItems, type PackingView } from '../../components/Packing/packingListModel';
import { usePackingSnapshot } from '../../components/Packing/usePackingSnapshot';
import { onPrivateSessionEnd } from '../../db/privateSessionEvents';
import { currentSourcePolicy } from '../../db/sourceDatabase';
import {
  canonicalPackingItem,
  currentPlannerPackingPort,
  plannerPackingInstallation,
  subscribePlannerPackingPort,
} from '../../repo/plannerPackingPort';
import {
  currentSavedPackingReadPort,
  savedPackingInstallation,
  subscribeSavedPackingReadPort,
} from '../../repo/savedPackingReadPort';
import { useAuthStore } from '../../store/authStore';
import { captureTripLoad } from '../../store/tripReadScope';
import { useTripStore } from '../../store/tripStore';
import { familyFrontend } from './repository';

const subscribeContext = (listener: () => void) => {
  const stops = [
    onPrivateSessionEnd(listener),
    familyFrontend.subscribeContext(listener),
    useAuthStore.subscribe(listener),
  ];
  return () => {
    for (const stop of stops) stop();
  };
};

/** A read publication, never a writer binding. Old callbacks cannot borrow a replacement owner. */
export function usePackingExportOwner(tripId: number | string, list: PackingView) {
  const snapshot = usePackingSnapshot(tripId);
  const liveInstallation = useSyncExternalStore(subscribePlannerPackingPort, plannerPackingInstallation, () => 0);
  const savedInstallation = useSyncExternalStore(subscribeSavedPackingReadPort, savedPackingInstallation, () => 0);
  const trip = useTripStore((s) => s.trip);
  const rows = useTripStore((s) => s.packingItems);
  const user = useAuthStore((s) => s.user);
  const { port, reader, view, owned } = snapshot;
  const owner = useMemo(() => {
    const session = captureTripLoad();
    let mounted = true;
    const family = owned || rows.some(canonicalPackingItem) || currentSourcePolicy() !== null;
    const publication = reader ? reader.snapshot(tripId) : (port?.snapshot() ?? null);
    const admitted = family ? view !== null && view === publication : true;
    const items = structuredClone(
      packingViewItems(family ? (view?.items ?? []) : rows, list).filter((item) => !isPackingPlaceholder(item))
    );
    const bags = new Map<number, PackingBagInfo>(
      (family ? (view?.bags ?? []) : []).map((bag) => [bag.id, { name: bag.name, color: bag.color }])
    );
    const current = () =>
      mounted &&
      admitted &&
      session.current() &&
      useAuthStore.getState().user === user &&
      useTripStore.getState().trip === trip &&
      (trip ? String(trip.id) === String(tripId) : !family) &&
      plannerPackingInstallation() === liveInstallation &&
      savedPackingInstallation() === savedInstallation &&
      currentPlannerPackingPort() === port &&
      currentSavedPackingReadPort() === reader &&
      (family
        ? publication !== null && (reader ? reader.snapshot(tripId) : port?.snapshot()) === publication
        : currentSourcePolicy() === null && !useTripStore.getState().packingItems.some(canonicalPackingItem));
    return {
      family,
      items,
      bag: (id: number) => bags.get(id),
      current,
      mount: () => {
        mounted = true;
        return () => {
          mounted = false;
        };
      },
    };
  }, [tripId, list, port, reader, view, owned, rows, trip, user, liveInstallation, savedInstallation]);
  useLayoutEffect(() => owner.mount(), [owner]);
  // Private-session/context events must also hide an already-open native print frame.
  const current = useSyncExternalStore(subscribeContext, owner.current, () => false);
  return { owner, current };
}
