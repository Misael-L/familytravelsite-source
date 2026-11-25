import type { LibraryEntry } from '@family/backend/supabase/collectionLibrary';
import type { Collection, CollectionMembership, CollectionPlace } from '@trek/shared';
import type { CollectionItem } from './collectionContract';
import type { createCollectionTransport } from './collectionTransport';
import { FamilyApiError } from './errors';
import type { FamilyIdentityRegistry } from './identity';

/** A nullable legacy owner is kept explicitly unsupported, never replaced by a fake person. */
export type NativeCollectionRoot = Readonly<{
  canonical: LibraryEntry;
  native: Readonly<Collection> | null;
  unavailable: 'unlinked_owner' | null;
}>;
export function nativeCollectionRoot(entry: LibraryEntry, ids: FamilyIdentityRegistry): NativeCollectionRoot {
  const c = entry.collection;
  if (c.owner_person_id === null)
    return Object.freeze({ canonical: entry, native: null, unavailable: 'unlinked_owner' });
  const native: Collection = {
    id: ids.register('collection', c.id),
    owner_id: ids.register('person', c.owner_person_id),
    name: c.name,
    description: c.description,
    color: c.color,
    sort_order: c.sort_order,
    cover_image: c.cover.hero_url,
    place_count: entry.active_item_count,
    is_owner: entry.is_owner,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  };
  return Object.freeze({ canonical: entry, native: Object.freeze(native), unavailable: null });
}
export function nativeCollectionItem(item: CollectionItem, ids: FamilyIdentityRegistry) {
  const category =
    item.category === null ? null : Object.freeze({ ...item.category, id: ids.register('category', item.category.id) });
  const native: CollectionPlace & { family_identity: { collection_id: string; item_id: string } } = {
    family_identity: { collection_id: item.collection_id, item_id: item.id },
    id: ids.register('collectionItem', item.id),
    collection_id: ids.register('collection', item.collection_id),
    name: item.content.name,
    description: item.content.description,
    notes: item.notes,
    lat: item.native_location_compatible ? item.content.latitude : null,
    lng: item.native_location_compatible ? item.content.longitude : null,
    address: item.content.address,
    website: item.content.website,
    phone: item.content.phone,
    category_id: category?.id ?? null,
    category,
    status: item.status,
    sort_order: item.sort_order,
    created_at: item.added_at,
    // A gallery must never enlarge a thumbnail. No hero means a placeholder.
    image_url: item.cover.hero_url,
  };
  return Object.freeze({
    canonical: item,
    native: Object.freeze(native),
    thumbnail_url: item.cover.thumb_url,
    map_compatible: item.native_location_compatible && native.lat !== null && native.lng !== null,
  });
}
export function nativeCollectionMembership(
  result: Awaited<ReturnType<ReturnType<typeof createCollectionTransport>['membership']>>,
  ids: FamilyIdentityRegistry
) {
  const lists: CollectionMembership['lists'] = result.lists.map((row) =>
    Object.freeze({
      collection_id: ids.register('collection', row.collection_id),
      place_id: ids.register('collectionItem', row.item_id),
      name: row.name,
      color: row.color,
      status: row.status,
      can_edit: row.can_edit,
    })
  );
  return Object.freeze({
    canonical: result,
    native: Object.freeze({ saved: result.saved, lists: Object.freeze(lists) }),
  });
}
/** Explicit refusal is preferable to dropping an item or inventing an owner. */
export function requireNativeCollection(root: NativeCollectionRoot): Readonly<Collection> {
  if (root.native === null)
    throw new FamilyApiError(
      422,
      'collection_owner_unlinked',
      'This Collection has no linked owner. Its retained data is unchanged.'
    );
  return root.native;
}
export type NativeCollectionItem = ReturnType<typeof nativeCollectionItem>;
