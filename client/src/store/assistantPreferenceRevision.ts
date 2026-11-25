import { captureReadSession } from '../sync/readSession';
import type { Settings } from '../types';

const KEYS = ['assistant_memory', 'assistant_hints', 'date_format', 'week_start'] as const;
const versions = { assistant_memory: 0, assistant_hints: 0, date_format: 0, week_start: 0 };
const writes = new Set<{ current: () => boolean; patch: Partial<Settings> }>();
const pending = (key: (typeof KEYS)[number]) =>
  [...writes].some((job) => job.current() && Object.prototype.hasOwnProperty.call(job.patch, key));

/** A GET cannot undo edits begun before or during the read, or read through an unsettled save. */
export function captureAssistantPreferences() {
  const before = { ...versions };
  const busy = new Set(KEYS.filter(pending));
  return (incoming: Partial<Settings>) => {
    const accepted = { ...incoming };
    for (const key of KEYS) if (versions[key] !== before[key] || busy.has(key) || pending(key)) delete accepted[key];
    return accepted;
  };
}
export function noteAssistantPreferenceWrite(patch: Partial<Settings>): () => void {
  const job = { current: captureReadSession().current, patch };
  for (const key of KEYS) if (Object.prototype.hasOwnProperty.call(patch, key)) versions[key]++;
  if (KEYS.some((key) => Object.prototype.hasOwnProperty.call(patch, key))) writes.add(job);
  return () => {
    writes.delete(job);
    if (job.current()) for (const key of KEYS) if (Object.prototype.hasOwnProperty.call(patch, key)) versions[key]++;
  };
}
