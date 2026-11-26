import { useCallback, useEffect, useRef } from 'react';
import { useStayActionScope, useStayState } from '../../components/Planner/stayActionScope';
import { tripMembersRepo } from '../../repo/tripMembersRepo';
import { isEffectivelyOffline } from '../../sync/networkMode';
import type { TripMember } from '../../types';
const EMPTY_MEMBERS: TripMember[] = [];

/** Online and initial offline rosters belong to the original trip/account/view. */
export function usePlannerMembers(tripId: number) {
  const capture = useStayActionScope(tripId);
  const [tripMembers, setTripMembers] = useStayState(capture, EMPTY_MEMBERS);
  const latest = useRef(0);
  const read = useCallback(
    async (initial = false) => {
      if (isEffectivelyOffline() && !initial) return;
      const sequence = ++latest.current;
      const action = capture(() => sequence === latest.current);
      if (!tripId || !action.current()) return;
      try {
        const rows = await action.perform(() => tripMembersRepo.list(tripId));
        action.effect(() => setTripMembers(rows));
      } catch {
        /* Keep the current roster; a later nudge may retry. */
      }
    },
    [capture, setTripMembers, tripId]
  );
  useEffect(() => {
    void read(true);
  }, [read]);
  const refreshMembers = useCallback(() => read(), [read]);
  return { tripMembers, setTripMembers, refreshMembers };
}
