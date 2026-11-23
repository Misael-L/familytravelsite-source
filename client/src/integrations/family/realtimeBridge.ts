import type { FrontendRealtimeDriver } from '../../api/websocket';
import { useInAppNotificationStore } from '../../store/inAppNotificationStore';
import { captureFamilyActor } from './actorContext';
import { familyRealtime } from './legacy/data/supabase/familyRealtime';
import { familyAuthStore, familyFrontend, type FamilyFrontendRepository } from './repository';

/** Cancellation and ownership stay outside the unchanged carried Supabase channel controller. */
export function createFamilyRealtimeDriver(repo: FamilyFrontendRepository = familyFrontend): FrontendRealtimeDriver {
  let connection = 0,
    joins = 0,
    selected: string | null = null;
  const driver: FrontendRealtimeDriver = {
    connect() {
      const s = familyAuthStore.getState();
      if (!s.isAuthenticated || s.authGate !== 'ok' || !s.familyId || !s.personId) return;
      const context = captureFamilyActor(),
        generation = ++connection;
      const notifications = useInAppNotificationStore.getState();
      familyRealtime.startSession({
        familyId: s.familyId,
        personId: s.personId,
        onNotificationChange() {
          if (generation !== connection || !context.current()) return;
          void notifications.fetchUnreadCount().catch((error) => {
            if (generation === connection && context.current())
              driver.emit?.({ type: 'family_realtime_error', phase: 'notification', error });
          });
          void notifications.fetchNotifications(true).catch((error) => {
            if (generation === connection && context.current())
              driver.emit?.({ type: 'family_realtime_error', phase: 'inbox', error });
          });
        },
      });
    },
    disconnect() {
      connection++;
      joins++;
      selected = null;
      familyRealtime.stopAll();
    },
    async joinTrip(value) {
      const generation = ++joins,
        context = captureFamilyActor(),
        owner = repo.captureContext();
      selected = String(value);
      const current = () => generation === joins && context.current();
      try {
        const uuid = await repo.tripUuid(value);
        if (!current()) return;
        owner.assertCurrent();
        const refetch = driver.refetch;
        familyRealtime.bindItinerary({
          tripId: uuid,
          onChange() {
            if (!current()) return;
            // The repository can be invalidated independently by Auth token/authority refresh.
            try {
              owner.assertCurrent();
            } catch {
              return;
            }
            repo.invalidate(uuid);
            refetch?.(String(value));
          },
        });
      } catch (error) {
        if (current()) driver.emit?.({ type: 'family_realtime_error', phase: 'join', error });
      }
    },
    leaveTrip(value) {
      if (selected !== String(value)) return;
      joins++;
      selected = null;
      familyRealtime.bindItinerary(null);
    },
  };
  return driver;
}
