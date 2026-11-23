import type { PackingUpdateBagRequest } from '@trek/shared';
import { useEffect, useRef, useState } from 'react';
import type { PackingBagOrigin } from '../../repo/plannerPackingBagPort';
import { currentPlannerPackingPort } from '../../repo/plannerPackingPort';

import type { PackingBag } from '../../types';

/** A stored limit as the field shows it: in kilos, that is how airlines state them. */
export const bagLimitInput = (grams?: number | null) => (grams ? String(grams / 1000) : '');

/**
 * Editing one bag in place, behind the desktop bag card and the phone bag row:
 * its name, its weight limit (typed in kilos, stored in grams) and who carries it.
 *
 * The desktop card keeps its fields on the bag as it changes elsewhere
 * (`followBag`) and leaves a name it did not save as it was typed; the phone row
 * starts its fields from the bag and puts a name it did not save back
 * (`resetUnsavedName`).
 */
export function useBagCardEditor({
  bag,
  onUpdate,
  onSetMembers,
  followBag = false,
  resetUnsavedName = false,
}: {
  bag: PackingBag;
  onUpdate: (data: PackingUpdateBagRequest, origin?: PackingBagOrigin) => void | Promise<void>;
  onSetMembers: (userIds: number[], origin?: PackingBagOrigin) => void | Promise<void>;
  followBag?: boolean;
  resetUnsavedName?: boolean;
}) {
  const [editingName, setEditingNameRaw] = useState(false);
  const [nameVal, setNameVal] = useState(bag.name);
  const [editingLimit, setEditingLimitRaw] = useState(false);
  const [limitVal, setLimitVal] = useState(bagLimitInput(bag.weight_limit_grams));

  const original = useRef<PackingBagOrigin | null>(null);
  const flight = useRef<Promise<void> | null>(null);
  const begin = () => {
    const port = currentPlannerPackingPort();
    if (port && !original.current) {
      if (!port.bags?.available(bag.trip_id)) throw Error('Bag editing is unavailable.');
      original.current = port.bags.bind(bag.trip_id, bag);
    }
    return original.current ?? undefined;
  };
  const close = () => {
    original.current?.close();
    original.current = null;
  };
  const setEditingName = (v: boolean) => {
    if (v) {
      if (!editingName && currentPlannerPackingPort()?.bags) setNameVal(bag.name);
      begin();
    } else close();
    setEditingNameRaw(v);
  };
  const setEditingLimit = (v: boolean) => {
    if (v) {
      if (!editingLimit && currentPlannerPackingPort()?.bags) setLimitVal(bagLimitInput(bag.weight_limit_grams));
      begin();
    } else close();
    setEditingLimitRaw(v);
  };
  useEffect(() => () => close(), []);
  const submit = (work: () => void | Promise<void>, done: () => void) => {
    if (flight.current) return flight.current;
    if (!currentPlannerPackingPort()) {
      work();
      done();
      return;
    }
    flight.current = Promise.resolve()
      .then(work)
      .then(() => {
        done();
        close();
      })
      .finally(() => {
        flight.current = null;
      });
    void flight.current.catch(() => {});
    return flight.current;
  };
  useEffect(() => {
    if (followBag) setNameVal(bag.name);
  }, [bag.name, followBag]);
  useEffect(() => {
    if (followBag) setLimitVal(bagLimitInput(bag.weight_limit_grams));
  }, [bag.weight_limit_grams, followBag]);

  const update = (data: PackingUpdateBagRequest) => {
    const o = begin();
    return o ? onUpdate(data, o) : onUpdate(data);
  };
  const members = (ids: number[]) => {
    const o = begin();
    return o ? onSetMembers(ids, o) : onSetMembers(ids);
  };
  const saveName = () => {
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== bag.name)
      return submit(
        () => update({ name: trimmed }),
        () => setEditingNameRaw(false)
      );
    if (resetUnsavedName) setNameVal(bag.name);
    setEditingName(false);
  };
  const cancelName = () => {
    setEditingName(false);
    setNameVal(bag.name);
  };

  const saveLimit = () => {
    const raw = limitVal.trim().replace(',', '.');
    if (raw === '') {
      // Clearing the field removes the limit and puts the bar back on relative scaling.
      if (bag.weight_limit_grams != null)
        return submit(
          () => update({ weight_limit_grams: null }),
          () => setEditingLimitRaw(false)
        );
      setEditingLimit(false);
      return;
    }
    const kg = Number(raw);
    // Anything unparseable or negative leaves the stored limit alone rather than wiping it.
    if (!Number.isFinite(kg) || kg <= 0) {
      setLimitVal(bagLimitInput(bag.weight_limit_grams));
      setEditingLimit(false);
      return;
    }
    const grams = Math.round(kg * 1000);
    if (grams !== bag.weight_limit_grams)
      return submit(
        () => update({ weight_limit_grams: grams }),
        () => setEditingLimitRaw(false)
      );
    setEditingLimit(false);
  };
  const cancelLimit = () => {
    setLimitVal(bagLimitInput(bag.weight_limit_grams));
    setEditingLimit(false);
  };

  const memberIds = (bag.members || []).map((m) => m.user_id);
  const toggleMember = (userId: number) =>
    submit(
      () => members(memberIds.includes(userId) ? memberIds.filter((id) => id !== userId) : [...memberIds, userId]),
      () => {}
    );

  return {
    editingName,
    setEditingName,
    nameVal,
    setNameVal,
    saveName,
    cancelName,
    editingLimit,
    setEditingLimit,
    limitVal,
    setLimitVal,
    saveLimit,
    cancelLimit,
    memberIds,
    toggleMember,
  };
}
