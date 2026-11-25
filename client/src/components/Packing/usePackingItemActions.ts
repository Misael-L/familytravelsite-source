import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  bindPackingOrigin,
  currentPlannerPackingPort,
  guardPackingGroupAction,
  packingOriginArgs,
} from '../../repo/plannerPackingPort';
import { createPackingDraft } from './usePackingDraft';

import { useTripStore, type TripStoreState } from '../../store/tripStore';
import type { PackingItem } from '../../types';
import {
  isLastCustomItemInCategory,
  isPackingPlaceholder,
  packingViewItems,
  type PackingView,
} from './packingListModel';
import { PACKING_PLACEHOLDER_NAME } from './packingListPanel.constants';
import { newItemSharing } from './packingListPanel.helpers';

type Translate = (key: string, params?: Record<string, string | number>) => string;
interface Toaster {
  error: (message: string) => void;
}
type PackingActions = Pick<
  TripStoreState,
  'addPackingItem' | 'updatePackingItem' | 'deletePackingItem' | 'togglePackingItem'
>;

function createPackingComposerOwner(
  tripId: number,
  view: PackingView,
  packingOwner: ReturnType<typeof currentPlannerPackingPort>
) {
  let active = true;
  let categoryDraft: ReturnType<typeof createPackingDraft> | null = null;
  let identityCategory: import('../../repo/plannerPackingPort').PackingCategoryComposer | null = null;
  const identityItems = new Map<string, import('../../repo/plannerPackingPort').PackingCategoryComposer>();
  const composers = new Map<
    string,
    { draft: ReturnType<typeof createPackingDraft>; placeholder: PackingItem | null }
  >();
  const closeCategory = () => {
    identityCategory?.close();
    identityCategory = null;
    categoryDraft?.dispose();
    categoryDraft = null;
  };
  return {
    tripId,
    view,
    packingOwner,
    composers,
    identityItems,
    identityCategory: () => identityCategory,
    isActive: () => active,
    activate: () => {
      active = true;
    },
    dispose: () => {
      active = false;
      for (const entry of composers.values()) entry.draft.dispose();
      composers.clear();
      for (const composer of identityItems.values()) composer.close();
      identityItems.clear();
      closeCategory();
    },
    category: () => categoryDraft,
    beginCategory: () => {
      if (packingOwner?.categoryIdentityMode?.()) {
        identityCategory ??= packingOwner.bindNewCategory?.(tripId, view) ?? null;
        if (!identityCategory) throw Error('Category identity creation is unavailable');
        return;
      }
      if (!categoryDraft) {
        categoryDraft = createPackingDraft(tripId);
        categoryDraft.begin(null);
      }
    },
    closeCategory,
  };
}

/**
 * The item and category writes behind both packing lists: adding an item to a
 * category, deleting one, renaming, emptying and adding categories, and removing
 * every checked item. Each surface asks for confirmation its own way first.
 *
 * `placeholderFrom` says where a category's `...` placeholder is looked up when
 * an item is added: the desktop reads the store as it is at that moment, the
 * phone the items it rendered.
 */
export function usePackingItemActions({
  tripId,
  items,
  view,
  currentUserId,
  categories,
  defaultCategory,
  actions,
  t,
  toast,
  placeholderFrom,
}: {
  tripId: number;
  items: PackingItem[];
  view: PackingView;
  currentUserId: number | null | undefined;
  /** The categories of the active view, in display order. */
  categories: string[];
  defaultCategory: string;
  actions: PackingActions;
  t: Translate;
  toast: Toaster;
  placeholderFrom: 'store' | 'items';
}) {
  const { addPackingItem, updatePackingItem, deletePackingItem, togglePackingItem } = actions;
  const packingOwner = currentPlannerPackingPort();
  const familyPacking = packingOwner !== null || items.some((item) => 'family_packing' in item);
  const [addingCategory, setAddingCategoryState] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Each rendered Trip/view owns its composers. A callback from an old view
  // must never borrow a new view's draft (including its visibility).
  const owner = useMemo(() => createPackingComposerOwner(tripId, view, packingOwner), [tripId, view, packingOwner]);
  useLayoutEffect(() => {
    owner.activate();
    return () => owner.dispose();
  }, [owner]);
  const setAddingCategory = useCallback(
    (next: boolean) => {
      if (!owner.isActive()) return;
      if (next) owner.beginCategory();
      else owner.closeCategory();
      setAddingCategoryState(next);
    },
    [owner]
  );
  const beginItem = (category: string) => {
    if (!owner.isActive()) return;
    if (packingOwner?.categoryIdentityMode?.()) {
      if (!owner.identityItems.has(category)) {
        const composer = packingOwner.bindCategoryItem?.(tripId, category);
        if (!composer) throw Error('Category identity is unavailable');
        owner.identityItems.set(category, composer);
      }
      return;
    }
    const existing = owner.composers.get(category);
    const placeholder = items.find((i) => i.category === category && isPackingPlaceholder(i)) ?? null;
    if (existing) {
      if (existing.draft.begin(placeholder)) existing.placeholder = placeholder;
      return;
    }
    const draft = createPackingDraft(tripId);
    draft.begin(placeholder);
    owner.composers.set(category, { draft, placeholder });
  };
  const cancelItem = (category: string) => {
    owner.identityItems.get(category)?.close();
    owner.identityItems.delete(category);
    owner.composers.get(category)?.draft.dispose();
    owner.composers.delete(category);
  };
  const addItemToCategory = async (category: string, name: string) => {
    try {
      if (!owner.isActive()) return false;
      if (packingOwner?.categoryIdentityMode?.()) {
        const composer = owner.identityItems.get(category);
        if (!composer) throw Error('Open the original category composer');
        await composer.save(name);
        const current = composer.current();
        if (current) {
          composer.close();
          owner.identityItems.delete(category);
          const next = packingOwner.bindCategoryItem?.(tripId, category);
          if (next) owner.identityItems.set(category, next);
        }
        return current;
      }
      if (familyPacking || currentPlannerPackingPort()) {
        const entry = owner.composers.get(category);
        if (!entry) throw new Error('Open the original packing composer before adding an item.');
        const owned = entry.draft.guard();
        const placeholder = entry.placeholder;
        if (placeholder) {
          await entry.draft.save({ name }, (data, origin) =>
            updatePackingItem(tripId, placeholder.id, data, ...packingOriginArgs(origin))
          );
        } else {
          await entry.draft.save(
            { name, category, visibility: view === 'personal' ? 'personal' : 'common' },
            (data, origin) =>
              addPackingItem(tripId, data as Parameters<typeof addPackingItem>[1], ...packingOriginArgs(origin))
          );
        }
        return owned();
      }
      // Reuse the '...' placeholder slot when the category already has one, so a
      // freshly-emptied category keeps its position (and therefore its colour)
      // instead of the new item being appended to the end of the list.
      const pool = placeholderFrom === 'store' ? useTripStore.getState().packingItems : items;
      const placeholder = pool.find((i) => i.category === category && isPackingPlaceholder(i));
      if (placeholder) {
        await updatePackingItem(tripId, placeholder.id, { name });
      } else {
        // New items inherit the active view's tier, and in "my list" the sharing the
        // category's own items agree on (#2241).
        await addPackingItem(tripId, {
          name,
          category,
          ...newItemSharing(items, category, view, currentUserId),
        } as Parameters<typeof addPackingItem>[1]);
      }
      return true;
    } catch {
      toast.error(t('packing.toast.addError'));
      return false;
    }
  };

  // Deleting an item from a row. When it is the last item of a user-created
  // category, turn that row back into the '...' placeholder in place rather than
  // deleting it (#1289). Updating the row keeps its id, list position and colour,
  // so the category neither disappears nor jumps to the end. The default
  // (uncategorized) group and the placeholder row itself are deleted normally:
  // removing the placeholder is how an empty category is dismissed.
  const deleteItem = async (item: PackingItem) => {
    try {
      if (familyPacking || currentPlannerPackingPort() || 'family_packing' in item) {
        const origin = bindPackingOrigin(item, tripId);
        await deletePackingItem(tripId, item.id, ...packingOriginArgs(origin));
        return;
      }
      if (isLastCustomItemInCategory(item, items)) {
        if (item.checked) await togglePackingItem(tripId, item.id, false);
        await updatePackingItem(tripId, item.id, {
          name: PACKING_PLACEHOLDER_NAME,
          weight_grams: null,
          bag_id: null,
          quantity: 1,
        });
      } else {
        await deletePackingItem(tripId, item.id);
      }
    } catch {
      toast.error(t('packing.toast.deleteError'));
    }
  };

  /** Moves every item of a category to the new name, one write each; a failure stops it and is thrown. */
  const renameCategory = async (oldName: string, newName: string) => {
    guardPackingGroupAction(packingOwner ?? items);
    const toUpdate = items.filter((i) => (i.category || defaultCategory) === oldName);
    for (const item of toUpdate) {
      await updatePackingItem(tripId, item.id, { category: newName });
    }
  };

  /** The same, with a failure reported here rather than thrown to the caller. */
  const renameCategoryReporting = async (oldName: string, newName: string) => {
    try {
      await renameCategory(oldName, newName);
    } catch {
      toast.error(t('packing.toast.renameError'));
    }
  };

  const deleteCategoryItems = async (catItems: PackingItem[]) => {
    guardPackingGroupAction(packingOwner ?? items);
    let failed = false;
    for (const item of catItems) {
      try {
        await deletePackingItem(tripId, item.id);
      } catch {
        failed = true;
      }
    }
    if (failed) toast.error(t('packing.toast.deleteError'));
  };

  /** Removes the checked items of the open view only, the ones the button's count names. */
  const clearChecked = async () => {
    guardPackingGroupAction(packingOwner ?? items);
    let failed = false;
    for (const item of packingViewItems(items, view).filter((i) => i.checked)) {
      try {
        await deletePackingItem(tripId, item.id);
      } catch {
        failed = true;
      }
    }
    if (failed) toast.error(t('packing.toast.deleteError'));
  };

  const addNewCategory = async () => {
    if (!owner.isActive()) return;
    if (!newCategoryName.trim()) return;
    if (packingOwner?.categoryIdentityMode?.()) {
      try {
        const composer = owner.identityCategory();
        if (!composer) throw Error('Open the original category composer');
        await composer.save(newCategoryName);
        if (composer.current()) {
          setNewCategoryName('');
          setAddingCategory(false);
        }
      } catch {
        toast.error(t('packing.toast.addError'));
      }
      return;
    }
    let catName = newCategoryName.trim();
    // Allow duplicate display names: append invisible zero-width spaces to make them unique internally.
    while (categories.includes(catName)) {
      catName += '​';
    }
    try {
      const draft = owner.category(),
        owned = draft?.guard();
      const values = {
        name: PACKING_PLACEHOLDER_NAME,
        category: catName,
        visibility: view === 'personal' ? 'personal' : 'common',
      } as Parameters<typeof addPackingItem>[1];
      if (familyPacking || currentPlannerPackingPort()) {
        if (!draft) throw new Error('Open the original category composer before saving.');
        await draft.save(values, (data, origin) =>
          addPackingItem(tripId, data as Parameters<typeof addPackingItem>[1], ...packingOriginArgs(origin))
        );
        if (!owned?.()) return;
      } else await addPackingItem(tripId, values);
      setNewCategoryName('');
      setAddingCategory(false);
    } catch {
      toast.error(t('packing.toast.addError'));
    }
  };

  return {
    beginItem,
    cancelItem,
    addingCategory,
    setAddingCategory,
    newCategoryName,
    setNewCategoryName,
    addItemToCategory,
    deleteItem,
    renameCategory,
    renameCategoryReporting,
    deleteCategoryItems,
    clearChecked,
    addNewCategory,
  };
}
