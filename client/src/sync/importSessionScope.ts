import { useCallback, useLayoutEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { captureWriteSession, createSessionAction } from './writeSession';

/** Route-independent job work stays in one account; view callbacks can add a lifetime check. */
export function captureImportAction(visible: () => boolean = () => true) {
  return createSessionAction(captureWriteSession(), visible);
}
export type ImportAction = ReturnType<typeof captureImportAction>;
function accountOwner() {
  const account = captureWriteSession();
  let mounted = true,
    generation = 0;
  return {
    sessionCurrent: account.contextCurrent,
    mount: () => {
      mounted = true;
      return () => {
        mounted = false;
        generation++;
      };
    },
    capture: (visible: () => boolean) => {
      const started = generation;
      return captureImportAction(() => mounted && started === generation && account.current() && visible());
    },
  };
}
export function useImportAccountScope() {
  useAuthStore((state) => state.user);
  const [owner, setOwner] = useState(accountOwner);
  if (!owner.sessionCurrent()) setOwner(accountOwner());
  useLayoutEffect(() => owner.mount(), [owner]);
  return useCallback((visible: () => boolean = () => true) => owner.capture(visible), [owner]);
}
