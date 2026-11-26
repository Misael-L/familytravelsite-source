import { useLayoutEffect, useState } from 'react';
import { assistantConversationVersion, useAssistantStore } from '../../store/assistantStore';
import { WriteSessionChanged } from '../../sync/writeSession';
import { useAssistantViewScope } from './assistantViewScope';

type ViewCapture = ReturnType<typeof useAssistantViewScope>;
interface Resource {
  identity: string;
  version: string;
  readVersion: () => string;
  fence: () => boolean;
  token: number;
}
function resourceOwner(view: ViewCapture, { identity, version, readVersion, fence, token }: Resource) {
  let mounted = true,
    generation = 0,
    pending: Promise<void> | null = null,
    preview = '';
  const fresh = () => view().current() && version === readVersion() && fence();
  const capture = (valid: () => boolean = () => true) => {
    const parent = view(),
      started = generation;
    const current = () => mounted && generation === started && parent.current() && fresh() && valid();
    const assertCurrent = () => {
      if (!current()) throw new WriteSessionChanged();
    };
    async function perform<T>(run: () => Promise<T> | T): Promise<T> {
      assertCurrent();
      try {
        const value = await run();
        assertCurrent();
        return value;
      } catch (error) {
        assertCurrent();
        throw error;
      }
    }
    return {
      current,
      assertCurrent,
      perform,
      effect: (run: () => void) => {
        if (current()) run();
      },
    };
  };
  const single = (run: (action: ReturnType<typeof capture>) => Promise<void>, valid: () => boolean = () => true) => {
    const action = capture(valid);
    if (!action.current()) return Promise.resolve();
    if (pending !== null) return pending;
    const job = run(action).finally(() => {
      if (pending === job) pending = null;
    });
    pending = job;
    return job;
  };
  return {
    view,
    identity,
    version,
    token,
    fresh,
    capture,
    single,
    stage: (text: string) => {
      preview = text;
    },
    matches: (text: string) => preview === text,
    mount: () => {
      mounted = true;
      return () => {
        mounted = false;
        generation++;
      };
    },
  };
}
/** Stable per rendered resource; old callbacks cannot acquire a replacement owner on invocation. */
export function useAssistantResourceScope(
  key: number,
  identity: string,
  conversation = true,
  fenceFactory: () => () => boolean = () => () => true
) {
  const view = useAssistantViewScope(key);
  const version = useAssistantStore(() => (conversation ? assistantConversationVersion(key) : 'account'));
  const readVersion = () => (conversation ? assistantConversationVersion(key) : 'account');
  const [owner, setOwner] = useState(() =>
    resourceOwner(view, { identity, version, readVersion, fence: fenceFactory(), token: 0 })
  );
  if (owner.view !== view || owner.identity !== identity || owner.version !== version || !owner.fresh())
    setOwner(resourceOwner(view, { identity, version, readVersion, fence: fenceFactory(), token: owner.token + 1 }));
  useLayoutEffect(() => owner.mount(), [owner]);
  return owner;
}
