import { useCallback, useLayoutEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useAuthStore } from '../store/authStore';
import { captureTripLoad } from '../store/tripReadScope';
import { useTripStore } from '../store/tripStore';
import { createSessionAction } from '../sync/writeSession';

/** A reply may have committed; only its original view can publish its follow-ups. */
export function captureStayAction(visible: () => boolean = () => true) {
  return createSessionAction(captureTripLoad(), visible);
}
export type StayActionScope = ReturnType<typeof captureStayAction>;
type CaptureStayAction = (visible?: () => boolean) => StayActionScope;

function stayView(key: string) {
  const session = captureTripLoad();
  let mounted = true,
    generation = 0;
  return {
    key,
    sessionCurrent: session.contextCurrent,
    mount: () => {
      mounted = true;
      return () => {
        mounted = false;
        generation++;
      };
    },
    capture: (visible: () => boolean) => {
      const started = generation;
      return captureStayAction(() => mounted && generation === started && session.current() && visible());
    },
  };
}

/** Render new private state for a changed day/account; retire old callbacks on commit. */
export function useStayActionScope(tripId: number, dayId?: number): CaptureStayAction {
  useAuthStore((state) => state.user);
  useTripStore((state) => state.trip);
  const key = `${tripId}/${dayId ?? ''}`;
  const [owner, setOwner] = useState(() => stayView(key));
  if (owner.key !== key || !owner.sessionCurrent()) setOwner(stayView(key));
  useLayoutEffect(() => owner.mount(), [owner]);
  return useCallback((visible = () => true) => owner.capture(visible), [owner]);
}

/** Keep loaded private data and editor drafts attached to their original view. */
export function useStayState<T>(capture: CaptureStayAction, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(() => ({ capture, owner: capture(), value: initial }));
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const owner = capture();
      if (!owner.current()) return;
      setState((previous) => {
        if (!owner.current()) return previous;
        const value = previous.capture === capture && previous.owner.current() ? previous.value : initial;
        return { capture, owner, value: typeof next === 'function' ? (next as (value: T) => T)(value) : next };
      });
    },
    [capture, initial]
  );
  return [state.capture === capture && state.owner.current() ? state.value : initial, set];
}
