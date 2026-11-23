import { expect, it } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { canonicalPackingCategories } from '../../../tests/helpers/familyPackingCategories';
import { FamilyIdentityRegistry } from './identity';
import { projectPacking } from './plannerPacking';
import { nativePackingCategory } from './plannerPackingCategories';
function setup() {
  const categories = canonicalPackingCategories(),
    ids = new FamilyIdentityRegistry(categories.scope.user_id);
  const view = projectPacking(categories.packing, ids, []);
  return {
    categories,
    ids,
    canonical: view.items,
    rendered: view.items,
    selector: { view: 'common' as const, label: 'Gear', defaultCategory: 'Other' },
    allowed: true,
  };
}
it('resolves one full canonical category, independent of a native status filter', () => {
  const a = setup();
  expect(nativePackingCategory(a)).toMatchObject({ id: id(20), name: 'Gear', canRename: true, canAssign: true });
});
it('does not grant identity from an incomplete or modified rendered list', () => {
  const a = setup();
  expect(nativePackingCategory({ ...a, rendered: a.rendered.slice(1) })).toBeNull();
  expect(nativePackingCategory({ ...a, rendered: a.rendered.map((r) => ({ ...r, name: 'modified' })) })).toBeNull();
});
it('detects raw empty and literal Other collisions even when one is hidden by status', () => {
  const a = setup();
  a.categories.packing.items[0].category = '';
  a.categories.packing.items[1].category = 'Other';
  a.categories.categories[0].name = '';
  a.categories.categories.push({ ...a.categories.categories[0], id: id(21), name: 'Other' });
  a.categories.item_categories[1].category_id = id(21);
  const view = projectPacking(a.categories.packing, a.ids, []).items;
  expect(
    nativePackingCategory({ ...a, canonical: view, rendered: view, selector: { ...a.selector, label: 'Other' } })
  ).toBeNull();
});
it('own personal rename and common-only assignments remain distinct', () => {
  const a = setup();
  a.categories.categories[0].owner_person_id = a.categories.scope.person_id;
  a.categories.packing.items.forEach((r) => {
    r.is_private = true;
    r.owner_person_id = a.categories.scope.person_id;
  });
  const view = projectPacking(a.categories.packing, a.ids, []).items;
  expect(
    nativePackingCategory({ ...a, canonical: view, rendered: view, selector: { ...a.selector, view: 'personal' } })
  ).toMatchObject({ canRename: true, canAssign: false });
  a.categories.categories[0].owner_person_id = id(99);
  expect(
    nativePackingCategory({ ...a, canonical: view, rendered: view, selector: { ...a.selector, view: 'personal' } })
  ).toMatchObject({ canRename: false, canAssign: false });
});
it('keeps exact reserved/Unicode labels and gates authority separately from display', () => {
  const a = setup(),
    name = '__proto__ é e\u0301 😀';
  a.categories.categories[0].name = name;
  a.categories.packing.items.forEach((r) => {
    r.category = name;
  });
  const view = projectPacking(a.categories.packing, a.ids, []).items;
  expect(
    nativePackingCategory({
      ...a,
      canonical: view,
      rendered: view,
      selector: { ...a.selector, label: name },
      allowed: false,
    })
  ).toMatchObject({ name, canRename: false, canAssign: false });
});
it('retains historical Person display and eligibility without converting Person IDs to Auth IDs', () => {
  const a = setup();
  a.categories.categories[0].assignments = [{ person_id: id(7), assigned_at: null, assigned_by_person_id: null }];
  a.categories.people = [{ id: id(7), display_name: 'Historical guest', eligible: false, is_guest: true }];
  expect(nativePackingCategory(a)?.assignees).toEqual([
    { user_id: a.ids.register('person', id(7)), username: 'Historical guest', eligible: false, is_guest: true },
  ]);
});
