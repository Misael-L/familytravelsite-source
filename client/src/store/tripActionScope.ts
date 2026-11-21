import type { StoreApi } from 'zustand';
import { assertWritableSession, hasReadOnlySession } from '../db/readOnlySession';
import { WriteSessionChanged } from '../sync/writeSession';
import { captureTripLoad } from './tripReadScope';
import type { TripStoreState } from './tripStore';
type SetState = StoreApi<TripStoreState>['setState'];
type GetState = StoreApi<TripStoreState>['getState'];
/** Both successful updates and failed optimistic rollbacks belong to their original view. */
export function captureTripAction(set: SetState, get: GetState, writable = false) {
  if (writable) assertWritableSession();
  const session = captureTripLoad();
  const assertCurrent = () => {
    if (writable) assertWritableSession();
    if (!session.current()) throw new WriteSessionChanged();
  };
  const guardedSet = ((...args: unknown[]) => {
    if (session.current()) {
      if (writable) assertWritableSession();
      Reflect.apply(set, undefined, args);
    }
  }) as SetState;
  const guardedGet = () => {
    assertCurrent();
    return get();
  };
  async function perform<T>(operation: () => Promise<T> | T): Promise<T> {
    assertCurrent();
    try {
      const result = await operation();
      assertCurrent();
      return result;
    } catch (error) {
      assertCurrent();
      throw error;
    }
  }
  return {
    set: guardedSet,
    get: guardedGet,
    perform,
    assertCurrent,
    effect: (apply: () => void) => {
      if (session.current() && (!writable || !hasReadOnlySession())) apply();
    },
  };
}

/** Capture mutation authority before an optimistic set, not only when its repository eventually writes. */
export function captureTripMutation(set: SetState, get: GetState) {
  return captureTripAction(set, get, true);
}
