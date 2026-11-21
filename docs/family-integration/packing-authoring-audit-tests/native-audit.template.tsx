import { act, renderHook } from '__ROOT__/node_modules/@testing-library/react/dist/index.js';
import { afterEach, beforeEach, expect, it, vi } from '__ROOT__/node_modules/vitest/dist/index.js';
import { buildPackingItem } from '__ROOT__/client/tests/helpers/factories';
import { resetAllStores } from '__ROOT__/client/tests/helpers/store';
import { usePackingItemActions } from '__ROOT__/client/src/components/Packing/usePackingItemActions';
import { packingCategoryOrder, itemOrderWithCategoryMoved, groupPackingItems, packingProgress, isPackingPlaceholder } from '__ROOT__/client/src/components/Packing/packingListModel';
import { installPlannerPackingPort, packingGroupActionsAvailable } from '__ROOT__/client/src/repo/plannerPackingPort';
import { useTripStore } from '__ROOT__/client/src/store/tripStore';
import { cleanup } from '__ROOT__/client/tests/helpers/render';
let release: (() => void) | undefined;
const origin = { current: () => true, close: vi.fn(), save: vi.fn(), trash: vi.fn() };
const writer = { bind: () => origin, packed: vi.fn(), reorder: vi.fn(), snapshot: () => null, subscribe: () => () => {}, trashPage: vi.fn(), restore: vi.fn(), reconcile: vi.fn() };
beforeEach(() => { resetAllStores(); release = installPlannerPackingPort(writer as never); });
afterEach(() => { cleanup(); release?.(); vi.restoreAllMocks(); });
function fixture(placeholderFrom: 'store' | 'items', items = [buildPackingItem({ id: 1, name: 'Tent', category: 'Camp' })], view: 'common' | 'personal' = 'common', categories = ['Camp']) {
 const actions = { addPackingItem: vi.fn(async () => buildPackingItem()), updatePackingItem: vi.fn(async () => buildPackingItem()), deletePackingItem: vi.fn(async () => {}), togglePackingItem: vi.fn(async () => {}) };
 const toast = { error: vi.fn() }; useTripStore.setState({ packingItems: items });
 const hook = renderHook(() => usePackingItemActions({ tripId: 7, items, view, currentUserId: 9, categories, defaultCategory: 'Other', actions, t: key => key, toast, placeholderFrom }));
 return { ...hook, actions, toast };
}
it.each(['store','items'] as const)('%s native category composer sends a real sentinel through the existing item create binding', async mode => {
 const f=fixture(mode); act(() => { f.result.current.setAddingCategory(true); f.result.current.setNewCategoryName('New gear'); });
 await act(async () => { await f.result.current.addNewCategory(); });
 expect(f.actions.addPackingItem).toHaveBeenCalledWith(7, { name:'...', category:'New gear', visibility:'common' }, origin);
 expect(f.toast.error).not.toHaveBeenCalled();
});
it('duplicate native labels are silently differentiated with U+200B, not a separate category ID', async () => {
 const f=fixture('items'); act(() => { f.result.current.setAddingCategory(true); f.result.current.setNewCategoryName('Camp'); });
 await act(async () => { await f.result.current.addNewCategory(); });
 expect(f.actions.addPackingItem.mock.calls[0][1]).toMatchObject({ category:'Camp\u200b', name:'...' });
});
it('personal category creation is an owned personal item create, not a common-category operation', async () => {
 const f=fixture('items',[],'personal',[]); act(() => { f.result.current.setAddingCategory(true); f.result.current.setNewCategoryName('Personal'); });
 await act(async () => { await f.result.current.addNewCategory(); });
 expect(f.actions.addPackingItem.mock.calls[0][1]).toMatchObject({ visibility:'personal', name:'...' });
});
it.each(['store','items'] as const)('%s filling a native empty category changes the placeholder item identity in place', async mode => {
 const row=buildPackingItem({ id:4, name:'...', category:'Camp' }); const f=fixture(mode,[row]);
 act(() => f.result.current.beginItem('Camp'));
 await act(async () => { await f.result.current.addItemToCategory('Camp','Tent'); });
 expect(f.actions.updatePackingItem).toHaveBeenCalledWith(7,4,{name:'Tent'},origin); expect(f.actions.addPackingItem).not.toHaveBeenCalled();
});
it('Family deletion of the last real item trashes it instead of converting its description into a placeholder', async () => {
 const f=fixture('items'); await act(async () => { await f.result.current.deleteItem(useTripStore.getState().packingItems[0]); });
 expect(f.actions.deletePackingItem).toHaveBeenCalledWith(7,1,origin); expect(f.actions.updatePackingItem).not.toHaveBeenCalled();
});
it('category drag remains separately gated although item reorder has a qualified writer', () => {
 expect(packingGroupActionsAvailable(true)).toBe(false); expect(writer.reorder).not.toHaveBeenCalled();
});
it('a true metadata-only empty category cannot be represented by the current item-only grouping model', () => {
 expect(packingCategoryOrder([], 'Other')).toEqual([]); expect(groupPackingItems([], 'all','Other')).toEqual([]);
});
it('native progress counts a sentinel as an item and a legitimate three-dot item is indistinguishable to the current renderer', () => {
 const row=buildPackingItem({name:'...',category:'Camp',checked:0}); expect(packingProgress([row])).toEqual({checked:0,total:1,pct:0}); expect(isPackingPlaceholder(row)).toBe(true); expect(groupPackingItems([row],'done','Other')).toEqual([]);
});
it('native category-block movement changes the global item order, including moving the other view behind it', () => {
 const rows=[buildPackingItem({id:1,category:'A'}),buildPackingItem({id:2,category:'Private',is_private:1}),buildPackingItem({id:3,category:'B'})];
 expect(itemOrderWithCategoryMoved(rows,[rows[0],rows[2]],'B','A','Other')).toEqual([3,1,2]);
});
it('renaming through the legacy item loop is refused before the first item change', async () => {
 const f=fixture('items'); await expect(f.result.current.renameCategory('Camp','Merge target')).rejects.toThrow('not connected'); expect(f.actions.updatePackingItem).not.toHaveBeenCalled();
});
