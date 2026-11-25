import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { copyText } from '../utils/clipboard';

type LinkKind = 'https' | 'webcal';

export function useCalendarLinkCopy(httpsUrl: string, webcalUrl: string) {
  const links = useMemo(() => ({ https: httpsUrl, webcal: webcalUrl }), [httpsUrl, webcalUrl]);
  const [feedback, setFeedback] = useState<{ links: typeof links; kind: LinkKind } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useLayoutEffect(
    () => () => {
      pending.current?.abort();
      clearTimeout(timer.current);
    },
    [links]
  );

  const copy = async (kind: LinkKind) => {
    pending.current?.abort();
    const { signal } = (pending.current = new AbortController());
    clearTimeout(timer.current);
    setFeedback(null);

    if (!(await copyText(links[kind], () => signal.throwIfAborted())) || signal.aborted) return;

    setFeedback({ links, kind });
    timer.current = setTimeout(() => {
      if (!signal.aborted) setFeedback(null);
    }, 2000);
  };

  return { copied: feedback?.links === links ? feedback.kind : null, copy };
}
