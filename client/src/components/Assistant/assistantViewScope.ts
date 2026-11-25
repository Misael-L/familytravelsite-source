import { useCallback, useLayoutEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { captureReadSession } from '../../sync/readSession';

/** Home and Journey chats must not inherit the planner's unrelated trip-load generation. */
function viewOwner(key: number) {
  const session = captureReadSession();
  let mounted = true,
    generation = 0;
  return {
    key,
    current: session.current,
    mount: () => {
      mounted = true;
      return () => {
        mounted = false;
        generation++;
      };
    },
    capture: (valid: () => boolean) => {
      const started = generation;
      const current = () => mounted && generation === started && session.current() && valid();
      const effect = (run: () => void) => {
        if (current()) run();
      };
      return { current, effect };
    },
  };
}
export function useAssistantViewScope(key: number) {
  useAuthStore((state) => state.user);
  const [owner, setOwner] = useState(() => viewOwner(key));
  if (owner.key !== key || !owner.current()) setOwner(viewOwner(key));
  useLayoutEffect(() => owner.mount(), [owner]);
  return useCallback((valid: () => boolean = () => true) => owner.capture(valid), [owner]);
}
