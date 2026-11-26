import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { containTab, focusDialog } from '../shared/dialogFocus';

export function useReservationDetailDialogFocus(
  trigger: HTMLElement | null,
  handoffRef: RefObject<boolean>,
  onClose: () => void
) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef(trigger);
  triggerRef.current = trigger;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (panel) focusDialog(panel);
    return () => {
      if (handoffRef.current) return;
      const opener = triggerRef.current;
      if (opener?.isConnected) opener.focus();
    };
  }, [handoffRef]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && panelRef.current) {
        containTab(event, panelRef.current);
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  return panelRef;
}
