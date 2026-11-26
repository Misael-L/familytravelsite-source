import { create } from 'zustand';
import { currentOfflineDatabase } from '../db/offlineDb';
import { familySourceEnvironment } from '../integrations/family/familySourceEnvironment';
import { captureReadSession } from '../sync/readSession';

const STORAGE_PREFIX = 'trek:assistant-hints:v2:';

/** The source and account own marks; an ambiguous legacy trip-only key is never adopted. */
function storageKey(tripId: number): string | null {
  const db = currentOfflineDatabase();
  if (db.name === 'trek-offline') return null;
  const owner = [
    familySourceEnvironment('VITE_DATA_PLANE') ?? '',
    familySourceEnvironment('VITE_SUPABASE_URL') ?? '',
    db.name,
  ];
  return STORAGE_PREFIX + encodeURIComponent(JSON.stringify(owner)) + ':' + tripId;
}
/** Ids kept per list and trip. A hint whose situation changed has a new id, so old ones only pile up. */
const MAX_KEPT = 100;

interface HintMarks {
  /** Hints the user waved away in this trip. */
  dismissed: readonly string[];
  /** Hints the user has been shown, so the launcher stops pointing at them. */
  seen: readonly string[];
}

const NONE: HintMarks = { dismissed: [], seen: [] };

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(-MAX_KEPT) : [];
}

function readMarks(tripId: number): HintMarks {
  try {
    const key = storageKey(tripId);
    const parsed: unknown = JSON.parse(key ? (window.localStorage.getItem(key) ?? 'null') : 'null');
    if (!parsed || typeof parsed !== 'object') return NONE;
    const raw = parsed as Record<string, unknown>;
    return { dismissed: ids(raw.dismissed), seen: ids(raw.seen) };
  } catch {
    // Storage blocked or the entry unreadable: every hint counts as new.
    return NONE;
  }
}

function writeMarks(tripId: number, marks: HintMarks): void {
  try {
    const key = storageKey(tripId);
    if (key) window.localStorage.setItem(key, JSON.stringify(marks));
  } catch {
    // Storage blocked: the marks still hold while the page is up.
  }
}

function withIds(list: readonly string[], added: readonly string[]): readonly string[] {
  const fresh = [...new Set(added)].filter((id) => !list.includes(id));
  return fresh.length === 0 ? list : [...list, ...fresh].slice(-MAX_KEPT);
}

interface AssistantHintsState {
  /** Per trip, once read from storage. */
  byTrip: Record<number, HintMarks>;
  current: () => boolean;
  reset: () => void;
  load: (tripId: number) => void;
  dismiss: (tripId: number, id: string) => void;
  markSeen: (tripId: number, ids: readonly string[]) => void;
}

/**
 * Which plan hints one person has dismissed or seen, per trip, on this
 * device. A view preference like a hidden tour: nobody else sees it and it
 * never touches the trip. Mirrored to the browser's storage, so a reload
 * keeps it; without storage it lasts as long as the page.
 */
export const useAssistantHintsStore = create<AssistantHintsState>()((set, get) => {
  const update = (tripId: number, next: (marks: HintMarks) => HintMarks) => {
    const session = captureReadSession();
    const byTrip = get().current() ? get().byTrip : {};
    const before = byTrip[tripId] ?? readMarks(tripId);
    const after = next(before);
    if (after === before && byTrip[tripId]) return;
    if (after !== before) writeMarks(tripId, after);
    set({ current: session.current, byTrip: { ...byTrip, [tripId]: after } });
  };
  return {
    byTrip: {},
    current: () => false,
    reset: () => set({ byTrip: {}, current: () => false }),
    load: (tripId) => update(tripId, (marks) => marks),
    dismiss: (tripId, id) =>
      update(tripId, (marks) => {
        const dismissed = withIds(marks.dismissed, [id]);
        return dismissed === marks.dismissed ? marks : { ...marks, dismissed };
      }),
    markSeen: (tripId, seenIds) =>
      update(tripId, (marks) => {
        const seen = withIds(marks.seen, seenIds);
        return seen === marks.seen ? marks : { ...marks, seen };
      }),
  };
});
