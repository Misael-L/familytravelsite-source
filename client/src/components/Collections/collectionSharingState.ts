import type { CollectionRole } from '@trek/shared';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { offlineSessionEpoch } from '../../db/offlineDb';
import { collectionSharingRepo } from '../../repo/collectionSharingRepo';
import { useAuthStore } from '../../store/authStore';
import { onPrivateSessionEnd } from '../../sync/privateSessionEvents';
import { captureReadSession } from '../../sync/readSession';
import type { CollectionSharingOptions, MemberAction } from './useCollectionSharing';

type ViewOptions = Pick<CollectionSharingOptions, 'open' | 'collectionId' | 'isOwner'> & { singleBusySlot: boolean };
const EMPTY_USERS: { id: number; username: string }[] = [];
const EMPTY_BUSY: Partial<Record<MemberAction, number>> = {};

/** UI ownership only: the existing store/API remains responsible for authorizing every write. */
function sharingView(options: ViewOptions, key: string, userId: number | undefined) {
  const session = captureReadSession();
  const locks = new Set<string>();
  let mounted = false,
    retired = false,
    generation = 0;
  const contextCurrent = () => !retired && session.contextCurrent() && useAuthStore.getState().user?.id === userId;
  const current = () => mounted && options.open && contextCurrent() && session.current();
  return {
    key,
    contextCurrent,
    mount: () => {
      mounted = true;
      const stop = useAuthStore.subscribe((next, previous) => {
        if (next.user?.id !== previous.user?.id) {
          retired = true;
          generation++;
          locks.clear();
        }
      });
      return () => {
        mounted = false;
        generation++;
        locks.clear();
        stop();
      };
    },
    capture: (slot?: string) => {
      if (!current() || (slot !== undefined && locks.has(slot))) return null;
      const started = generation;
      if (slot !== undefined) locks.add(slot);
      const live = () => current() && generation === started;
      return {
        current: live,
        finish: () => {
          if (!live()) return false;
          if (slot !== undefined) locks.delete(slot);
          return true;
        },
      };
    },
    current,
  };
}
type SharingView = ReturnType<typeof sharingView>;

function useSharingView(options: ViewOptions, userId: number | undefined) {
  useSyncExternalStore(onPrivateSessionEnd, offlineSessionEpoch);
  const key = JSON.stringify([options.open, options.collectionId, options.isOwner, options.singleBusySlot, userId]);
  const [view, setView] = useState(() => sharingView(options, key, userId));
  if (view.key !== key || !view.contextCurrent()) setView(sharingView(options, key, userId));
  useLayoutEffect(() => view.mount(), [view]);
  return view;
}

/** A previous view's setters and queued updater functions cannot mutate the replacement view. */
function useViewState<T>(view: SharingView, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(() => ({ view, value: initial }));
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      if (!view.current()) return;
      setState((previous) => {
        if (!view.current()) return previous;
        const value = previous.view === view ? previous.value : initial;
        return { view, value: typeof next === 'function' ? (next as (value: T) => T)(value) : next };
      });
    },
    [view, initial]
  );
  return [state.view === view && view.contextCurrent() ? state.value : initial, set];
}

/** Private transient state belongs to one open collection/account; the chosen role is a retained preference. */
export function useCollectionSharingState(options: ViewOptions, userId: number | undefined, rosterSize: number) {
  const view = useSharingView(options, userId);
  const [availableUsers, setAvailableUsers] = useViewState(view, EMPTY_USERS);
  const [selectedUserId, setSelectedUserId] = useViewState<number | null>(view, null);
  const [inviteRole, setInviteRole] = useState<CollectionRole>('editor');
  const [busy, setBusy] = useViewState(view, EMPTY_BUSY);
  const [inviting, setInviting] = useViewState<boolean>(view, false);
  const [confirmLeave, setConfirmLeave] = useViewState<boolean>(view, false);
  const [leaving, setLeaving] = useViewState<boolean>(view, false);
  useEffect(() => {
    const read = view.capture();
    if (!read || !options.isOwner || options.collectionId == null) return;
    let cancelled = false;
    collectionSharingRepo
      .availableUsers(options.collectionId)
      .then((data) => {
        if (!cancelled && read.current()) setAvailableUsers(data.users);
      })
      .catch(() => {
        if (!cancelled && read.current()) setAvailableUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [view, options.isOwner, options.collectionId, rosterSize, setAvailableUsers]);
  return {
    view,
    availableUsers,
    selectedUserId,
    setSelectedUserId,
    inviteRole,
    setInviteRole,
    busy,
    setBusy,
    inviting,
    setInviting,
    confirmLeave,
    setConfirmLeave,
    leaving,
    setLeaving,
  };
}
