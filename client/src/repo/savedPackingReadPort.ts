import type { PackingItem } from '../types';
import type { PackingCategoryAccess, PackingCategorySelector, PackingView } from './plannerPackingPort';

/** Display only. The admitted saved lease owns this binding independently of the online writer. */
export type SavedPackingReadPort = {
  snapshot: (trip: number | string) => PackingView | null;
  assignees: (
    trip: number | string,
    selector: PackingCategorySelector,
    rows: PackingItem[]
  ) => PackingCategoryAccess['assignees'];
  categoryAccess: (
    trip: number | string,
    selector: PackingCategorySelector,
    rows: PackingItem[]
  ) => PackingCategoryAccess | null;
};
let port: SavedPackingReadPort | null = null;
let installation = 0;
export const savedPackingInstallation = () => installation;
const listeners = new Set<() => void>();
export const currentSavedPackingReadPort = () => port;
export const subscribeSavedPackingReadPort = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function installSavedPackingReadPort(next: SavedPackingReadPort) {
  if (port) throw new Error('A saved packing reader is already installed.');
  port = next;
  installation++;
  for (const listener of listeners) listener();
  return () => {
    if (port !== next) return;
    port = null;
    installation++;
    for (const listener of listeners) listener();
  };
}

/** Each mounted consumer remembers saved ownership after retirement, until its Trip context changes. */
export function createSavedPackingSelection(trip: number | string) {
  let selected: { trip: number | string; reader: SavedPackingReadPort | null; owned: boolean } = {
    trip,
    reader: null,
    owned: false,
  };
  return () => {
    const reader = currentSavedPackingReadPort();
    if (reader !== selected.reader) selected = { trip, reader, owned: selected.owned || reader !== null };
    return selected;
  };
}
