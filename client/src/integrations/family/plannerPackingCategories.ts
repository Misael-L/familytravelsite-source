import type { PackingCategoryAccess, PackingCategorySelector } from '../../repo/plannerPackingPort';
import type { PackingItem } from '../../types';
import type { FamilyIdentityRegistry } from './identity';
import type { PackingCategoryReadPacket } from './packingCategoryPresentation';
import { packingCategoryKey } from './packingCategoryV2Contract';
import { packingJson } from './packingCommandContract';
import type { NativePacking } from './plannerPacking';

/** Resolve the whole displayed view, including status-hidden rows. Never choose a first matching label/owner. */
export function nativePackingCategory(args: {
  categories: PackingCategoryReadPacket | null;
  canonical: PackingItem[];
  rendered: PackingItem[];
  selector: PackingCategorySelector;
  ids: FamilyIdentityRegistry;
  allowed: boolean;
}): PackingCategoryAccess | null {
  const { categories: p, canonical, rendered, selector: s, ids, allowed } = args;
  if (!p || packingJson(canonical) !== packingJson(rendered)) return null;
  if (p.version === 2) {
    const c = p.categories.find((c) => packingCategoryKey(c.id) === s.label);
    if (!c || (c.owner_person_id !== null) !== (s.view === 'personal')) return null;
    return access(c, p, ids, allowed);
  }
  const links = new Map(p.item_categories.map((x) => [x.item_id, x.category_id]));
  const relevant = rendered.filter(
    (r) => !!r.is_private === (s.view === 'personal') && (r.category || s.defaultCategory) === s.label
  );
  const matches = new Set(relevant.map((r) => links.get((r as NativePacking).family_packing?.id)));
  if (!relevant.length || matches.size !== 1 || matches.has(undefined)) return null;
  const c = p.categories.find((c) => matches.has(c.id));
  if (!c) return null;
  return access(c, p, ids, allowed);
}
function access(
  c: PackingCategoryReadPacket['categories'][number],
  p: PackingCategoryReadPacket,
  ids: FamilyIdentityRegistry,
  allowed: boolean
) {
  const own = c.owner_person_id === null || c.owner_person_id === p.scope.person_id;
  return {
    id: c.id,
    name: c.name,
    canRename: allowed && own,
    canAssign: allowed && c.owner_person_id === null,
    assignees: c.assignments.map((a) => {
      const person = p.people.find((x) => x.id === a.person_id);
      if (!person) throw new Error('Missing canonical assignment Person');
      return {
        user_id: ids.register('person', a.person_id),
        username: person.display_name,
        is_guest: person.is_guest,
        eligible: person.eligible,
      };
    }),
  };
}
