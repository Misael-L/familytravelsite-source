import { guardPackingGroupAction, packingGroupActionsAvailable } from '../../repo/plannerPackingPort';
import type { PackingItem } from '../../types';
import type { NativePackingGroupActions } from './usePackingGroupActions';

/** Native menu callbacks retain their original observation above the category's lifetime. */
export function packingCategoryActions(args: {
  category: string;
  items: PackingItem[];
  allItems: PackingItem[];
  defaultCategory: string;
  owner?: NativePackingGroupActions;
  canEdit: boolean;
  showMenu: boolean;
  setShowMenu: (open: boolean) => void;
  toggle: (item: PackingItem, checked: boolean) => Promise<void>;
  deleteAll: (items: PackingItem[]) => Promise<void>;
  confirmTrash?: () => boolean;
  report: (error: unknown) => void;
}) {
  const { owner, category, canEdit, items } = args;
  const qualified = owner?.family === true;
  const canPack = qualified ? owner.available('packed-state', canEdit, category) : packingGroupActionsAvailable();
  const canTrash = qualified ? owner.available('trash', canEdit, category) : packingGroupActionsAvailable(canEdit);
  const close = () => {
    args.setShowMenu(false);
    owner?.cancelCategory(category);
  };
  const toggleMenu = () => {
    if (args.showMenu) {
      close();
      return;
    }
    try {
      if (qualified && (canPack || canTrash)) owner.beginCategory(category, items, args.allItems, args.defaultCategory);
      args.setShowMenu(true);
    } catch (error) {
      args.report(error);
    }
  };
  const packed = async (checked: boolean) => {
    try {
      if (!canPack) return;
      if (qualified) await owner.packed(category, checked);
      else {
        guardPackingGroupAction(items);
        await Promise.all(items.filter((i) => !!i.checked !== checked).map((i) => args.toggle(i, checked)));
      }
    } catch (error) {
      args.report(error);
    }
  };
  const trash = async () => {
    try {
      if (!canTrash) return;
      if (qualified && owner.aggregate && items.length && args.confirmTrash && !args.confirmTrash()) return;
      if (qualified) await owner.trash(category);
      else await args.deleteAll(items);
      close();
    } catch (error) {
      args.report(error);
    }
  };
  return { canPack, canTrash, show: canPack || canTrash, close, toggleMenu, packed, trash };
}

export const showPackingCategoryMenu = (pack: boolean, trash: boolean, rename: boolean) => pack || trash || rename;
