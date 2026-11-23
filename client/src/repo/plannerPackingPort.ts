import { assertWritableSession, hasReadOnlySession } from '../db/readOnlySession';
import type { PackingOrderObservation } from '../integrations/family/packingAggregateComposer';
import type { PackingCategoryTrashPage } from '../integrations/family/packingAggregateTrash';
import type { PackingRow, PackingTrashPage } from '../integrations/family/packingContract';
import type { projectPacking } from '../integrations/family/plannerPacking';
import type { PlannerTaskRecovery } from '../integrations/family/plannerTaskRecovery';
import type { PackingItem } from '../types';
import { assertRealPackingItems, assertRealPackingValue } from './packingCategoryPresentation';
import type { PlannerPackingBagPort } from './plannerPackingBagPort';

export type PackingValues = Partial<PackingItem> & { visibility?: 'common' | 'personal' };
export type PackingEditOrigin = {
  current: () => boolean;
  close: () => void;
  save: (values: PackingValues) => Promise<PackingItem>;
  trash: () => Promise<void>;
};
export type PackingGroupSelection = {
  view: 'common' | 'personal';
  status: 'all' | 'open' | 'done';
  categories: string[] | null;
};
export type PackingGroupIntent =
  | { action: 'group-packed-state'; values: { checked: boolean } }
  | { action: 'group-trash' | 'clear-completed'; values: Record<string, never> };
export type PackingGroupObservation = {
  settled?: () => boolean;
  current: () => boolean;
  close: () => void;
  submit: (intent: PackingGroupIntent) => Promise<void>;
};
export type PackingCategorySelector = { view: 'common' | 'personal'; label: string; defaultCategory: string };
export type PackingCategoryMember = { id: number; username: string; is_guest?: boolean; eligible?: boolean };
export type PackingCategoryAccess = {
  id: string;
  name: string;
  canRename: boolean;
  canAssign: boolean;
  assignees: { user_id: number; username: string; is_guest?: boolean; eligible?: boolean }[];
};
export type PackingCategoryBinding = {
  current: () => boolean;
  close: () => void;
  rename: (name: string) => Promise<void>;
  assign: (nativePersonIds: number[]) => Promise<void>;
};
export type PackingView = ReturnType<typeof projectPacking> & { unassigned_weight_grams: number };
export type PackingCategoryComposer = {
  current: () => boolean;
  close: () => void;
  save: (name: string) => Promise<void>;
};
export type PlannerPackingPort = {
  bags?: PlannerPackingBagPort;
  terminalRecoveryMode?: () => boolean;
  recovery?: () => PlannerTaskRecovery;
  reloadPacking?: () => Promise<void>;
  categoryAggregateMode?: () => boolean;
  observeCategoryOrder?: (
    trip: number | string,
    view: 'common' | 'personal',
    keys: string[]
  ) => PackingOrderObservation;
  categoryBatchPage?: (previous?: PackingCategoryTrashPage | null) => Promise<PackingCategoryTrashPage>;
  restoreCategoryBatch?: (page: PackingCategoryTrashPage, index: number) => Promise<void>;
  categoryIdentityMode?: () => boolean;
  clearCompletedAvailable?: (trip: number | string, view: 'common' | 'personal') => boolean;
  bindNewCategory?: (trip: number | string, view: 'common' | 'personal') => PackingCategoryComposer;
  bindCategoryItem?: (trip: number | string, key: string) => PackingCategoryComposer;
  observeIdentityCategory?: (
    trip: number | string,
    key: string,
    selector: PackingGroupSelection,
    rows: PackingItem[]
  ) => PackingGroupObservation;
  categoryGroupAvailable?: (trip: number | string, key: string, action: 'packed-state' | 'trash') => boolean;

  categoryAccess?: (
    trip: number | string,
    selector: PackingCategorySelector,
    rendered: PackingItem[]
  ) => PackingCategoryAccess | null;
  bindCategory?: (trip: number | string, categoryId: string) => PackingCategoryBinding;
  categoryMembers?: (trip: number | string) => Promise<PackingCategoryMember[]>;
  observeGroup?: (
    trip: number | string,
    selector: PackingGroupSelection,
    rendered: PackingItem[]
  ) => PackingGroupObservation;
  bind: (item: PackingItem | null, trip: number | string) => PackingEditOrigin;
  packed: (
    trip: number | string,
    item: PackingItem,
    value: { checked: boolean } | { packed_quantity: number | null }
  ) => Promise<void>;
  reorder: (trip: number | string, rows: PackingItem[], ids: number[]) => Promise<void>;
  snapshot: () => PackingView | null;
  subscribe: (listener: () => void) => () => void;
  trashPage: (previous?: PackingTrashPage | null) => Promise<PackingTrashPage>;
  restore: (page: PackingTrashPage, row: PackingRow) => Promise<void>;
  reconcile: () => Promise<'committed' | 'unknown' | 'none'>;
};
let port: PlannerPackingPort | null = null;
let installation = 0;
export const plannerPackingInstallation = () => installation;
const portListeners = new Set<() => void>();
/** Read consumers must also retire when the installed cohort is replaced. */
export const subscribePlannerPackingPort = (listener: () => void) => {
  portListeners.add(listener);
  return () => {
    portListeners.delete(listener);
  };
};
const notifyPort = () => {
  installation++;
  for (const listener of portListeners) listener();
};
export const currentPlannerPackingPort = () => port;
export function installPlannerPackingPort(next: PlannerPackingPort) {
  if (port) throw new Error('A packing writer is already installed.');
  port = next;
  notifyPort();
  return () => {
    if (port !== next) return;
    port = null;
    notifyPort();
  };
}
/** Extra arguments preserve native call shapes outside the explicit Family cohort. */
export const packingOriginArgs = (origin?: PackingEditOrigin): [] | [PackingEditOrigin] => (origin ? [origin] : []);
export const packingRowArgs = (item: PackingItem): [] | [PackingItem] => ('family_packing' in item ? [item] : []);
/** Group commands need their own observed transaction, never an item loop. */
export function packingGroupActionsAvailable(authorized = true) {
  return !hasReadOnlySession() && authorized && port === null;
}
/** Only these qualified actions use an observed transaction; unsupported group domains keep their own gate. */
export function packingActionAvailable(action: 'packed-state' | 'trash' | 'clear-completed', authorized = true) {
  if (hasReadOnlySession() || !['packed-state', 'trash', 'clear-completed'].includes(action)) return false;
  return authorized && (port === null || typeof port.observeGroup === 'function');
}
export function guardPackingGroupAction(observed: PlannerPackingPort | PackingItem[] | null = null) {
  assertWritableSession();
  if (port || (Array.isArray(observed) ? observed.some(canonicalPackingItem) : observed))
    throw new Error('This packing group action is not connected. No items were changed.');
}
export const canonicalPackingItem = (item: PackingItem) => 'family_packing' in item;
export const packingSetArgs = (items: PackingItem[]): [] | [PackingItem[]] =>
  items.some(canonicalPackingItem) ? [items] : [];
const origins = new WeakMap<PackingEditOrigin, { port: PlannerPackingPort; trip: string; item: number | null }>();
/** Bind at draft opening. A later submit cannot borrow a newer store observation. */
export function bindPackingOrigin(item: PackingItem | null, trip: number | string) {
  assertWritableSession();
  assertRealPackingValue(item);
  if (!port) {
    if (item && canonicalPackingItem(item)) throw new Error('The original packing view ended. Reopen the Trip.');
    return undefined;
  }
  const origin = port.bind(item, trip);
  origins.set(origin, { port, trip: String(trip), item: item?.id ?? null });
  return origin;
}
/** Slice guard before raw, optimistic, cache or network effects. */
export function packingSliceOrigin(
  trip: number | string,
  id: number | null,
  origin: PackingEditOrigin | undefined,
  rows: PackingItem[]
) {
  assertWritableSession();
  assertRealPackingValue(id);
  assertRealPackingItems(rows);
  const binding = origin && origins.get(origin);
  if (port && binding?.port === port && binding.trip === String(trip) && binding.item === id) return origin;
  if (port || origin || rows.some(canonicalPackingItem))
    throw new Error('Open the original packing draft before saving.');
  return undefined;
}
export function packingSlicePort(
  observed: PackingItem | PackingItem[] | undefined,
  id: number | null,
  rows: PackingItem[]
) {
  assertWritableSession();
  assertRealPackingValue(id);
  assertRealPackingValue(observed);
  assertRealPackingItems(rows);
  if (Array.isArray(observed)) assertRealPackingItems(observed);
  if (port) {
    if (!observed || (Array.isArray(observed) ? id !== null : observed.id !== id || !canonicalPackingItem(observed)))
      throw new Error('The original packing observation is required.');
    return port;
  }
  if (
    (Array.isArray(observed) ? observed : observed ? [observed] : []).some(canonicalPackingItem) ||
    rows.some(canonicalPackingItem)
  )
    throw new Error('The original packing view ended. Reopen the Trip.');
  return null;
}

/** Ordinary TREK checkbox permissions are unchanged; Family controls wait for their actual authority. */
export function packingItemControlsDisabled(authorized: boolean) {
  return hasReadOnlySession() || (currentPlannerPackingPort() !== null && !authorized);
}

/** Only category metadata create is opened; unrelated template/import/order gates stay unchanged. */
export function packingCategoryCreateAvailable(authorized = true) {
  return (
    !hasReadOnlySession() && authorized && (port === null || !!(port.categoryIdentityMode?.() && port.bindNewCategory))
  );
}
