import { useEffect, useLayoutEffect } from 'react';
import type { StayActionScope, useStayActionScope } from '../Planner/stayActionScope';

/** Picker work, writes and object URLs stay with one mounted form generation. */
export function createCoverPickerScope(capture: ReturnType<typeof useStayActionScope>, enabled: () => boolean) {
  let generation = 0,
    write: symbol | null = null;
  const sequences = new Map<string, number>();
  const urls = new Map<string, () => void>();
  const release = (url: string) => {
    const revoke = urls.get(url);
    urls.delete(url);
    try {
      revoke?.();
    } catch {
      /* Release the remaining previews as well. */
    }
  };
  const reset = () => {
    generation++;
    write = null;
    sequences.clear();
    for (const url of urls.keys()) release(url);
  };
  return {
    reset,
    release,
    start: (lane: string) => {
      if (!capture().current() || !enabled() || (lane === 'pick' && write)) return;
      const started = generation,
        seq = (sequences.get(lane) ?? 0) + 1;
      sequences.set(lane, seq);
      return capture(() => enabled() && generation === started && sequences.get(lane) === seq);
    },
    acquire: (action: StayActionScope) => {
      if (!action.current() || write) return;
      const token = Symbol('cover');
      write = token;
      return () => {
        if (write === token) write = null;
      };
    },
    preview: (file: File, action: StayActionScope) => {
      action.assertCurrent();
      for (const url of urls.keys()) release(url);
      const revoke = URL.revokeObjectURL.bind(URL),
        url = URL.createObjectURL(file);
      urls.set(url, () => revoke(url));
      try {
        action.assertCurrent();
        return url;
      } catch (error) {
        release(url);
        throw error;
      }
    },
  };
}

/** The phone drops replaced previews immediately; desktop staging lasts until reset. */
export function useCoverPreview(
  scope: ReturnType<typeof createCoverPickerScope>,
  preview: string | null,
  releaseOnChange: boolean
) {
  useLayoutEffect(() => () => scope.reset(), [scope]);
  useEffect(() => {
    if (releaseOnChange && preview?.startsWith('blob:')) return () => scope.release(preview);
  }, [preview, releaseOnChange, scope]);
}
