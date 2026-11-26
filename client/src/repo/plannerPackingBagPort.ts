import type { PackingBag, PackingUpdateBagRequest } from '@trek/shared';
import { hasReadOnlySession } from '../db/readOnlySession';
import type { PackingBagTrashPage } from '../integrations/family/packingBagContract';
import { currentPlannerPackingPort, packingGroupActionsAvailable } from './plannerPackingPort';
export type PackingBagOrigin = {
  matches: (trip: number | string, bag: number | null) => boolean;
  current: () => boolean;
  close: () => void;
  save: (values: PackingUpdateBagRequest & { name?: string }) => Promise<PackingBag>;
  members: (people: number[]) => Promise<void>;
  trash: () => Promise<void>;
};
export type PlannerPackingBagPort = {
  available: (trip: number | string) => boolean;
  bind: (trip: number | string, bag: PackingBag | null) => PackingBagOrigin;
  people: (
    trip: number | string
  ) => Promise<Array<{ id: number; username: string; eligible: boolean; is_guest?: boolean }>>;
  trashPage: (previous?: PackingBagTrashPage | null) => Promise<PackingBagTrashPage>;
  restore: (page: PackingBagTrashPage, index: number) => Promise<void>;
};
/** Bag capabilities never open the unrelated legacy group/import/template gate. */
export function packingBagActionsAvailable(trip: number | string, authorized = true) {
  if (hasReadOnlySession() || !authorized) return false;
  const port = currentPlannerPackingPort();
  return port ? port.bags?.available(trip) === true : packingGroupActionsAvailable(authorized);
}
