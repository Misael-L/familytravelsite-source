import type { Dispatch, SetStateAction } from 'react';
import type { useTranslation } from '../../i18n';
import { tripMembersRepo } from '../../repo/tripMembersRepo';
import { isEffectivelyOffline } from '../../sync/networkMode';
import type { useStayActionScope } from '../Planner/stayActionScope';
type Translate = ReturnType<typeof useTranslation>['t'];
type FormUser = { id: number; username: string };
interface SelectionOptions {
  capture: ReturnType<typeof useStayActionScope>;
  open: boolean;
  trip: { id: number } | null;
  allUsers: FormUser[];
  t: Translate;
  toast: { error: (message: string) => void; success: (message: string) => void };
  setExistingMembers: Dispatch<SetStateAction<FormUser[]>>;
  setSelectedMembers: Dispatch<SetStateAction<number[]>>;
  setMemberSelectValue: Dispatch<SetStateAction<string>>;
}
/** Keep the native member selector's requests and effects in its original form. */
export function tripMemberSelection({
  capture,
  open,
  trip,
  allUsers,
  t,
  toast,
  setExistingMembers,
  setSelectedMembers,
  setMemberSelectValue,
}: SelectionOptions) {
  return async (value: string | number) => {
    const action = capture(() => open);
    if (!action.current()) return;
    const tripId = trip?.id;
    if (tripId) {
      const user = allUsers.find((u) => u.id === Number(value));
      if (user && isEffectivelyOffline()) toast.error(t('common.needsConnection'));
      else if (user) {
        try {
          await action.perform(() => tripMembersRepo.add(tripId, user.username));
          setExistingMembers((previous) => [...previous, { id: user.id, username: user.username }]);
          action.effect(() => toast.success(t('trips.memberAdded', { username: user.username })));
        } catch {
          action.effect(() => toast.error(t('trips.memberAddError')));
        }
      }
    } else
      setSelectedMembers((previous) => (previous.includes(Number(value)) ? previous : [...previous, Number(value)]));
    action.effect(() => setMemberSelectValue(''));
  };
}
