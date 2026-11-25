import { useLayoutEffect } from 'react';
import { useTranslation } from '../../i18n';
import { useAssistantStore } from '../../store/assistantStore';
import { useStayState } from '../Planner/stayActionScope';
import { useToast } from '../shared/Toast';
import { useAssistantResourceScope } from './assistantResourceScope';

type Consent = 'text' | 'images';
function consentKey(mode: Consent) {
  const s = useAssistantStore.getState().status;
  const c = s?.effective;
  return JSON.stringify([
    c?.source,
    c?.kind,
    c?.host,
    c?.model,
    c?.paidBy,
    mode === 'text' ? (s?.privacyAcked ?? true) : s?.studioImagesAcked === true,
    mode === 'images' && s?.studioImages === true,
  ]);
}
/** The existing consent text, host/scope payload and buttons, owned by one rendered notice. */
export function useAssistantConsent(key: number, mode: Consent) {
  const { t } = useTranslation(),
    toast = useToast();
  const status = useAssistantStore((s) => s.status),
    effective = status?.effective ?? null;
  const signature = consentKey(mode);
  const scope = useAssistantResourceScope(key, signature, false, () => {
    const before = consentKey(mode);
    return () => before === consentKey(mode);
  });
  const [details, setDetails] = useStayState(scope.capture, false);
  const [later, setLater] = useStayState(scope.capture, false);
  const reads = status?.studioImages === true;
  const acked = mode === 'text' ? (status?.privacyAcked ?? true) : status?.studioImagesAcked === true;
  const offered = effective && !acked && (mode === 'text' ? effective.source === 'instance' : reads && !later);
  useLayoutEffect(() => scope.stage(offered ? signature : 'hidden'), [scope, offered, signature]);
  const confirm = () =>
    scope.single(
      async (action) => {
        if (!offered) return;
        try {
          const state = useAssistantStore.getState();
          await action.perform(() => (mode === 'text' ? state.ackPrivacy() : state.ackStudioImages()));
        } catch {
          action.effect(() => toast.error(t('assistant.error.generic')));
        }
      },
      () => scope.matches(signature)
    );
  return { effective, reads, acked, details, setDetails, later, setLater, confirm };
}
