import type { PackingUpdateBagRequest } from '@trek/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { hasReadOnlySession } from '../../db/readOnlySession';
import type { PackingBagOrigin } from '../../repo/plannerPackingBagPort';
import { currentPlannerPackingPort, guardPackingGroupAction } from '../../repo/plannerPackingPort';
import { usePackingSnapshot } from './usePackingSnapshot';

import { packingApi } from '../../api/client';
import { useNetworkMode } from '../../hooks/useNetworkMode';
import type { PackingBag } from '../../types';
import { offlineOr } from '../../utils/needsConnection';
import { BAG_COLORS } from './packingListPanel.constants';
import { useBagTotalsPing } from './useBagTotalsPing';

type Translate = (key: string, params?: Record<string, string | number>) => string;
interface Toaster {
  error: (message: string) => void;
}

/**
 * The trip's bags behind both packing lists: the bags with their server-summed
 * weights, kept fresh by the room's totals ping, and the bag writes. The desktop
 * panel and the phone tab draw their own bag sidebar, modal or sheet over it.
 */
export function usePackingBags({
  tripId,
  bagTrackingEnabled,
  t,
  toast,
}: {
  tripId: number;
  bagTrackingEnabled: boolean;
  t: Translate;
  toast: Toaster;
}) {
  const { port, owned, view } = usePackingSnapshot(tripId);
  const createOriginal = useRef<PackingBagOrigin | null>(null);
  const [people, setPeople] = useState<Array<{
    id: number;
    username: string;
    eligible: boolean;
    is_guest?: boolean;
  }> | null>(null);
  const beginCreate = () => {
    if (owned && !createOriginal.current) {
      if (!port?.bags?.available(tripId)) throw Error('Bag editing is unavailable.');
      createOriginal.current = port.bags.bind(tripId, null);
    }
  };
  const cancelCreate = () => {
    createOriginal.current?.close();
    createOriginal.current = null;
  };
  useEffect(() => {
    let live = true;
    setPeople(null);
    if (port?.bags && view)
      void port.bags
        .people(tripId)
        .then((p) => {
          if (live) setPeople(p);
        })
        .catch(() => {});
    return () => {
      live = false;
      cancelCreate();
    };
  }, [port, tripId, view]);
  const original = (id: number, captured?: PackingBagOrigin) => {
    if (captured) {
      if (!captured.matches(tripId, id)) throw Error('The original bag target changed.');
      return captured;
    }
    const bag = view?.bags.find((b) => b.id === id);
    if (!port?.bags || !bag) throw Error('The original bag view ended.');
    return port.bags.bind(tripId, bag);
  };
  const [bags, setBags] = useState<PackingBag[]>([]);
  /** Server-summed weight of everything in no bag (#2191); null until the first load. */
  const [unassignedWeightGrams, setUnassignedWeightGrams] = useState<number | null>(null);

  const reloadBags = useCallback(async () => {
    if (!bagTrackingEnabled || owned) return;
    try {
      const r = await packingApi.listBags(tripId);
      setBags(r.bags || []);
      setUnassignedWeightGrams(r.unassigned_weight_grams ?? null);
    } catch {
      // Offline or a failed read: the surfaces fall back to the local sum
      // (see `serverWeightsFresh` below), so there is nothing to roll back.
    }
  }, [tripId, bagTrackingEnabled, owned]);

  useEffect(() => {
    void reloadBags();
  }, [reloadBags]);

  // Bag weights are summed server-side across every member (#2191), so an item
  // this viewer may not even see still moves them. The item events cannot carry
  // that (a private item is delivered only to its owner, which is the very rule
  // that made the totals wrong), so the server pings the room content-free and
  // we re-read the numbers.
  useBagTotalsPing(bagTrackingEnabled, reloadBags);

  // Bags are not part of the offline cache (no repo, no Dexie table), so while
  // offline the server totals are frozen at the last online read and cannot see
  // the optimistic item writes the mutation queue is holding. A stale absolute
  // number measured against an airline limit is worse than an honest partial
  // one, so offline the surfaces sum what they can see instead (#2191).
  const { offline } = useNetworkMode();
  const serverWeightsFresh = !offline;

  /**
   * Creates a bag in the next colour. Resolves to the server's answer once the
   * write went through, even when that answer carries no bag, or to null once
   * the failure is reported.
   */
  const createOne = async (name: string): Promise<{ bag: PackingBag } | null> => {
    try {
      if (owned) {
        beginCreate();
        const origin = createOriginal.current!;
        const bag = await origin.save({ name, color: BAG_COLORS[(view?.bags.length ?? 0) % BAG_COLORS.length] });
        if (currentPlannerPackingPort() !== port) throw Error('Bag view ended.');
        cancelCreate();
        return { bag };
      }
      guardPackingGroupAction(port);
      const data = await packingApi.createBag(tripId, { name, color: BAG_COLORS[bags.length % BAG_COLORS.length] });
      setBags((prev) => [...prev, data.bag]);
      return { bag: data.bag };
    } catch {
      toast.error(offlineOr(t, t('packing.toast.saveError')));
      return null;
    }
  };

  const creation = useRef<{ name: string; promise: Promise<{ bag: PackingBag } | null> } | null>(null);
  const tryCreateBag = (name: string) => {
    if (owned && creation.current) {
      if (creation.current.name !== name) {
        toast.error('Resolve the original bag save before changing its name.');
        return Promise.resolve(null);
      }
      return creation.current.promise;
    }
    const promise = createOne(name);
    if (owned) {
      creation.current = { name, promise };
      void promise.finally(() => {
        if (creation.current?.promise === promise) creation.current = null;
      });
    }
    return promise;
  };
  /** Creates a bag in the next colour; the new bag, or undefined once the failure is reported. */
  const createBag = async (name: string): Promise<PackingBag | undefined> => (await tryCreateBag(name))?.bag;

  const updateBag = async (bagId: number, data: PackingUpdateBagRequest, captured?: PackingBagOrigin) => {
    try {
      if (owned) {
        if (!captured) throw Error('Reopen the original bag editor.');
        await original(bagId, captured).save(data);
        return;
      }
      guardPackingGroupAction(port);
      const result = await packingApi.updateBag(tripId, bagId, data);
      setBags((prev) => prev.map((b) => (b.id === bagId ? { ...b, ...result.bag } : b)));
    } catch (error) {
      toast.error(owned && error instanceof Error ? error.message : offlineOr(t, t('common.error')));
      if (owned && port?.bags && !hasReadOnlySession()) throw error;
    }
  };

  const deleteBag = async (bagId: number) => {
    try {
      if (owned) {
        const o = original(bagId);
        try {
          await o.trash();
        } finally {
          o.close();
        }
        return;
      }
      guardPackingGroupAction(port);
      await packingApi.deleteBag(tripId, bagId);
      setBags((prev) => prev.filter((b) => b.id !== bagId));
    } catch (error) {
      toast.error(owned && error instanceof Error ? error.message : offlineOr(t, t('packing.toast.deleteError')));
    }
  };

  const setBagMembers = async (bagId: number, userIds: number[], captured?: PackingBagOrigin) => {
    try {
      if (owned) {
        if (!captured) throw Error('Reopen the original bag carrier picker.');
        await original(bagId, captured).members(userIds);
        return;
      }
      guardPackingGroupAction(port);
      const result = await packingApi.setBagMembers(tripId, bagId, userIds);
      setBags((prev) => prev.map((b) => (b.id === bagId ? { ...b, members: result.members } : b)));
    } catch (error) {
      toast.error(owned && error instanceof Error ? error.message : offlineOr(t, t('common.error')));
      if (owned && port?.bags && !hasReadOnlySession()) throw error;
    }
  };

  return {
    people: owned ? (people ?? []) : null,
    beginCreate,
    cancelCreate,
    bags: owned ? (view?.bags ?? []) : bags,
    unassignedWeightGrams: owned ? (view?.unassigned_weight_grams ?? null) : unassignedWeightGrams,
    serverWeightsFresh: owned ? view !== null : serverWeightsFresh,
    reloadBags,
    tryCreateBag,
    createBag,
    updateBag,
    deleteBag,
    setBagMembers,
  };
}
