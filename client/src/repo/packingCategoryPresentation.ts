import type { PackingItem } from '../types';
export type PackingCategoryPresentation = {
  key: `packing-category:${string}`;
  id: string;
  rawName: string;
  ownerPersonId: string | null;
  owned: boolean;
  /** UI-only empty-card affordance. Never a PackingItem or a persisted identity. */
  placeholder: { kind: 'virtual-category'; key: `virtual-packing-category:${string}` } | null;
};
export function packingCategoryId(item: PackingItem): string | null {
  if (!('family_packing' in item)) return null;
  const meta = item.family_packing;
  return meta && typeof meta === 'object' && 'category_id' in meta && typeof meta.category_id === 'string'
    ? meta.category_id
    : null;
}

/** Typed virtual affordances are never values of the item/effect protocols, including untyped callers. */
export function assertRealPackingValue(value: unknown): void {
  if (typeof value === 'string' && value.startsWith('virtual-packing-category:'))
    throw Error('Virtual category keys cannot become item effects');
  if (value && typeof value === 'object') {
    if (
      ('kind' in value && value.kind === 'virtual-category') ||
      ('id' in value && typeof value.id === 'string' && value.id.startsWith('virtual-packing-category:')) ||
      ('key' in value && typeof value.key === 'string' && value.key.startsWith('virtual-packing-category:'))
    )
      throw Error('Virtual categories are presentation only');
  }
}
export function assertRealPackingItems(items: readonly unknown[]): void {
  items.forEach(assertRealPackingValue);
}
