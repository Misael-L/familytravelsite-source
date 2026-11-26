import type { AssistantMessage } from '@trek/shared';
import { useLayoutEffect, useMemo } from 'react';
import { useStayState } from '../Planner/stayActionScope';
import { useAssistantResourceScope } from './assistantResourceScope';
import { captureShareContext, shareMessageKey } from './assistantShareContext';

import { useNetworkMode } from '../../hooks/useNetworkMode';
import { useTranslation } from '../../i18n';
import { assistantRepo } from '../../repo/assistantRepo';
import { OnlineOnlyError } from '../../repo/onlineOnly';
import { useAddonStore } from '../../store/addonStore';
import { chatOf, useAssistantStore } from '../../store/assistantStore';
import { useCanDo } from '../../store/permissionsStore';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { useToast } from '../shared/Toast';
import { chatTextOf } from './assistantShare';

/** An answer the server stored, by the id it gives it on the wire. */
const STORED_ID = /^msg-\d+$/;

/** The refusal the share route answers with while the trip chat is switched off. */
function chatIsOff(err: unknown): boolean {
  const res = (err as { response?: { status?: number; data?: { error?: unknown } } } | null)?.response;
  return res?.status === 403 && res.data?.error === 'Collab chat is off';
}

/**
 * "Share in the trip chat" on one answer, the same on the window and the
 * phone: whether it can be shared (a finished answer the server stored, with
 * text, in a trip the planner holds, with the chat add-on on and the right to
 * post in it), the preview of what goes out, and the post itself. Online
 * only, like the chat it posts to; the button stays and says so while
 * offline. The answer reads "Shared" afterwards for the rest of the visit.
 */
export function useAssistantShare(tripId: number, message: AssistantMessage, writing: boolean) {
  const { t } = useTranslation();
  const toast = useToast();
  const { offline } = useNetworkMode();
  const can = useCanDo();
  const trip = useTripStore((s) => (s.trip?.id === tripId ? s.trip : null));
  const chatOn = useAddonStore((s) => s.collabChat && s.addons.some((a) => a.id === 'collab' && a.enabled));
  const threadId = useAssistantStore((s) => chatOf(s, tripId).threadId);
  const scope = useAssistantResourceScope(tripId, JSON.stringify([shareMessageKey(message), writing]), true, () =>
    captureShareContext(tripId, message.id)
  );
  const [previewing, setPreviewing] = useStayState(scope.capture, false);
  const [includeChanges, setIncludeChanges] = useStayState(scope.capture, true);
  const [sending, setSending] = useStayState(scope.capture, false);
  const [shared, setShared] = useStayState(scope.capture, false);

  const preview = useMemo(() => chatTextOf(message, { includeChanges, t }), [message, includeChanges, t]);

  useLayoutEffect(() => scope.stage(preview.text), [scope, preview.text]);
  const current = chatOf(useAssistantStore.getState(), tripId);
  const sameMessage = shareMessageKey(current.messages.find((x) => x.id === message.id)) === shareMessageKey(message);
  const canShare =
    !!trip &&
    sameMessage &&
    !current.loading &&
    chatOn &&
    can('collab_edit', trip) &&
    threadId !== null &&
    STORED_ID.test(message.id) &&
    message.status === 'complete' &&
    !writing &&
    preview.text.length > 0;

  const send = () =>
    scope.single(
      async (action) => {
        if (!canShare || threadId === null) return;
        setSending(true);
        try {
          if (isEffectivelyOffline()) throw new OnlineOnlyError();
          await action.perform(() => assistantRepo.share(tripId, threadId, message.id, { text: preview.text }));
          action.effect(() => {
            setShared(true);
            toast.success(t('assistant.share.done'));
          });
        } catch (err) {
          action.effect(() => {
            if (err instanceof OnlineOnlyError) toast.error(t('assistant.error.offline'));
            else if (chatIsOff(err)) toast.error(t('assistant.share.chatOff'));
            else toast.error(t('assistant.share.failed'));
          });
        } finally {
          scope.capture().effect(() => setSending(false));
        }
      },
      () => scope.matches(preview.text)
    );

  return {
    canShare,
    /** Offline the button stays, off, and says why. */
    offline,
    sending,
    shared,
    previewing,
    open: () => setPreviewing(true),
    close: () => setPreviewing(false),
    preview,
    includeChanges,
    toggleChanges: () => setIncludeChanges((on) => !on),
    send,
  };
}
