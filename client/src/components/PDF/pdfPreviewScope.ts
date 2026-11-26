import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import type { StayActionScope } from '../Planner/stayActionScope';

/** Imperative previews must leave with the session/trip that owns their private content. */
export function bindPdfPreview(overlay: HTMLElement, action: StayActionScope): void {
  action.assertCurrent();
  const remove = overlay.remove.bind(overlay);
  const subscriptions: (() => void)[] = [];
  overlay.remove = () => {
    remove();
    for (const stop of subscriptions.splice(0)) stop();
  };
  const retire = () => {
    if (!action.current()) overlay.remove();
  };
  subscriptions.push(useAuthStore.subscribe(retire), useTripStore.subscribe(retire));
  retire();
}
