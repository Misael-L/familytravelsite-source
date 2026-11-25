import type { PackingView } from '../../repo/plannerPackingPort';
import type { SavedPackingReadPort } from '../../repo/savedPackingReadPort';
import type { FamilyIdentityRegistry } from './identity';
import type { PackingCategoryReadPacket } from './packingCategoryPresentation';
import { packingJson } from './packingCommandContract';
import { nativePackingCategory } from './plannerPackingCategories';

export function createSavedPackingReader(args: {
  view: PackingView;
  categories: PackingCategoryReadPacket | null;
  ids: FamilyIdentityRegistry;
  check: (trip: number | string) => void;
}): SavedPackingReadPort {
  const view = freezeSavedPacking(args.view),
    categories = freezeSavedPacking(args.categories);
  const snapshot: SavedPackingReadPort['snapshot'] = (trip) => {
    try {
      args.check(trip);
      return view;
    } catch {
      return null;
    }
  };
  const categoryAccess: SavedPackingReadPort['categoryAccess'] = (trip, selector, rendered) => {
    if (!snapshot(trip)) return null;
    return nativePackingCategory({
      categories,
      canonical: view.items,
      rendered,
      selector,
      ids: args.ids,
      allowed: false,
    });
  };
  return {
    snapshot,
    categoryAccess,
    assignees: (trip, selector, rendered) => {
      if (!snapshot(trip) || packingJson(view.items) !== packingJson(rendered)) return [];
      // Older saved packages have display facts but no canonical category IDs. Never invent those IDs.
      if (!categories) return selector.view === 'common' ? (view.assignees[selector.label] ?? []) : [];
      return categoryAccess(trip, selector, rendered)?.assignees ?? [];
    },
  };
}

/** Saved native publications must not be changed through a consumer reference. */
function freezeSavedPacking<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(row: unknown) {
    if (row && typeof row === 'object') {
      for (const child of Object.values(row)) freeze(child);
      Object.freeze(row);
    }
  }
  freeze(copy);
  return copy;
}
