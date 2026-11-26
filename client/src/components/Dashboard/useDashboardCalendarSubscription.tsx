import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { FamilyCalendarSubscribeModal } from '../../integrations/family/legacy/components/Planner/family/FamilyCalendarSubscribeModal';
import { familyAuthStore } from '../../integrations/family/repository';
import { isFamilyFrontendActive } from '../../integrations/family/runtime';
import { useAuthStore } from '../../store/authStore';
import { IcsSubscribeModal } from '../Planner/IcsSubscribeModal';

export function useDashboardCalendarSubscription(t: (key: string) => string) {
  const familyActive = isFamilyFrontendActive();
  const userId = useAuthStore((state) =>
    state.isAuthenticated && !state.authCheckFailed ? state.user?.id : undefined
  );
  const family = familyAuthStore(
    useShallow((state) => {
      const { authUserId, familyId, personId } = state;
      if (!state.isAuthenticated || state.isLoading || state.authCheckFailed || state.authGate !== 'ok') return null;
      if (!authUserId || !familyId || !personId) return null;
      return { key: JSON.stringify([authUserId, familyId, personId]), familyId, personId };
    })
  );
  const scope = familyActive ? (family?.key ?? null) : userId == null ? null : `trek:${userId}`;
  const [openedScope, setOpenedScope] = useState<string | null>(null);

  if (openedScope && openedScope !== scope) setOpenedScope(null);

  const close = () => setOpenedScope(null);
  let dialog = null;
  if (scope && openedScope === scope) {
    dialog =
      familyActive && family ? (
        <FamilyCalendarSubscribeModal familyId={family.familyId} personId={family.personId} onClose={close} />
      ) : (
        <IcsSubscribeModal
          endpoint="/api/feed/user"
          title={t('dashboard.subscribeAllTrips')}
          description={t('dashboard.subscribeAllTripsDesc')}
          onClose={close}
        />
      );
  }

  return { available: scope !== null, open: () => setOpenedScope(scope), dialog };
}
