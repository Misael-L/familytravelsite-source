import { useLayoutEffect, useMemo, useState } from 'react';
import { copyText } from '../../utils/clipboard';
import type { useStayActionScope } from '../Planner/stayActionScope';

function copyLifetime(capture: ReturnType<typeof useStayActionScope>, valid: () => boolean, value: string | null) {
  let mounted = true,
    generation = 0,
    sequence = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    live: () => !!value && mounted && valid() && capture().current(),
    mount: () => {
      mounted = true;
      return () => {
        mounted = false;
        generation++;
        clearTimeout(timer);
      };
    },
    begin: () => {
      const started = generation,
        request = ++sequence;
      return capture(() => mounted && valid() && generation === started && sequence === request);
    },
    schedule: (effect: () => void) => {
      clearTimeout(timer);
      const started = generation,
        action = capture(() => mounted && valid() && generation === started);
      timer = setTimeout(() => action.effect(effect), 2000);
    },
  };
}

/** Clipboard acknowledgement/timers belong to the exact link, not just its trip. */
export function useLinkCopy(
  capture: ReturnType<typeof useStayActionScope>,
  value: string | null,
  valid: () => boolean
) {
  const owner = useMemo(() => copyLifetime(capture, valid, value), [capture, value, valid]);
  const [state, setState] = useState(() => ({ owner, copied: false }));
  useLayoutEffect(() => owner.mount(), [owner]);
  const copy = async () => {
    const action = owner.begin();
    if (!value || !action.current()) return;
    try {
      const copied = await action.perform(() => copyText(value, action.assertCurrent));
      if (!copied) return;
      action.effect(() => {
        setState({ owner, copied: true });
        owner.schedule(() => setState({ owner, copied: false }));
      });
    } catch {
      /* A cancelled or denied copy never marks a replacement link. */
    }
  };
  return { copied: state.owner === owner && owner.live() && state.copied, copy };
}
