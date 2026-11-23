import { useEffect, useEffectEvent, useRef } from 'react';
import { useTranslation } from '../../i18n';
import { tripMembersRepo, type TripRoster } from '../../repo/tripMembersRepo';
import { useStayActionScope, useStayState, type StayActionScope } from '../Planner/stayActionScope';
import { useToast } from '../shared/Toast';

type MembersData = TripRoster;
interface DirectoryUser {
  id: number;
  username: string;
  is_guest?: boolean;
}
const EMPTY_USERS: DirectoryUser[] = [];

/** Original dialog ownership also applies to mutations that later refresh this roster. */
export function memberActions(capture: ReturnType<typeof useStayActionScope>, open: boolean) {
  return <Args extends unknown[]>(operation: (action: StayActionScope, ...args: Args) => Promise<void>) =>
    async (...args: Args) => {
      const action = capture(() => open);
      if (action.current()) await operation(action, ...args);
    };
}

export function useMemberRoster(tripId: number, open: boolean, onChanged?: () => void) {
  const capture = useStayActionScope(tripId, open ? 1 : 0);
  const [data, setData] = useStayState<MembersData | null>(capture, null);
  const [allUsers, setAllUsers] = useStayState(capture, EMPTY_USERS);
  const [loading, setLoading] = useStayState(capture, false);
  const latest = useRef(0);
  const toast = useToast(),
    { t } = useTranslation();
  const loadMembers = async (notify = false) => {
    const sequence = ++latest.current,
      action = capture(() => open && sequence === latest.current);
    if (!action.current()) return;
    setLoading(true);
    try {
      const value = await action.perform(() => tripMembersRepo.roster(tripId));
      setData(value);
      if (notify) action.effect(() => onChanged?.());
    } catch {
      action.effect(() => toast.error(t('members.loadError')));
    } finally {
      action.effect(() => setLoading(false));
    }
  };
  const readOnOpen = useEffectEvent(() => {
    const action = capture();
    void loadMembers();
    void action
      .perform(() => tripMembersRepo.directory())
      .then(
        (d) => action.effect(() => setAllUsers(d.users)),
        () => {}
      );
  });
  useEffect(() => {
    if (open && tripId) readOnOpen();
  }, [open, tripId, capture]);
  return { capture, data, allUsers, loading, loadMembers };
}
