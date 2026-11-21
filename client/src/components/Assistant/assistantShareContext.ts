import type { AssistantMessage } from '@trek/shared';
import { isFamilyFrontendActive } from '../../integrations/family/runtime';
import { useFamilyUiPermissions } from '../../integrations/family/uiPermissions';
import { useAddonStore } from '../../store/addonStore';
import { chatOf, useAssistantStore } from '../../store/assistantStore';
import { useAuthStore } from '../../store/authStore';
import { usePermissionsStore } from '../../store/permissionsStore';
import { useTripStore } from '../../store/tripStore';

export const shareMessageKey = (message: AssistantMessage | undefined) =>
  JSON.stringify(message && [message.id, message.role, message.status, message.parts]);
/** Fence the exact inputs to the existing native/Family checker; do not duplicate its authorization rules. */
export function captureShareContext(key: number, id: string) {
  const snapshot = () => {
    const user = useAuthStore.getState().user,
      trip = useTripStore.getState().trip;
    const a = useAddonStore.getState(),
      c = chatOf(useAssistantStore.getState(), key);
    return JSON.stringify([
      user?.id,
      user?.role,
      usePermissionsStore.getState().permissions.collab_edit,
      isFamilyFrontendActive(),
      trip?.id,
      trip?.user_id,
      trip?.is_owner,
      a.collabChat,
      a.addons.some((x) => x.id === 'collab' && x.enabled),
      c.threadId,
      c.loading,
      shareMessageKey(c.messages.find((x) => x.id === id)),
    ]);
  };
  const before = snapshot(),
    controller = useFamilyUiPermissions.getState().controller;
  return () => snapshot() === before && useFamilyUiPermissions.getState().controller === controller;
}
