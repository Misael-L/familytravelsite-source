import { getSupabaseBrowserClient } from './client'
import type { ExploreCatalogKind } from './catalogExploreLists'
import { parseCatalogPoiRef } from '../../lib/map/catalogPoiRef'

const SAVED_LIST_LIMIT = 200

export type CatalogSaveTargetColumn = 'place_id' | 'experience_id' | 'food_id' | 'hotel_id'

/** Postgres `person_catalog_saves` FK column for a catalog kind. */
export function catalogSaveTargetColumn(kind: ExploreCatalogKind): CatalogSaveTargetColumn {
  switch (kind) {
    case 'place': return 'place_id'
    case 'experience': return 'experience_id'
    case 'food': return 'food_id'
    case 'hotel': return 'hotel_id'
  }
}

/** Catalog map POIs can be hearted; OSM / trip pins cannot. */
export function canHeartExplorePoi(osmId: string | null | undefined): boolean {
  return parseCatalogPoiRef(osmId) != null
}

export async function isCatalogSaved(opts: {
  familyId: string
  personId: string
  kind: ExploreCatalogKind
  entityId: string
}): Promise<boolean> {
  const column = catalogSaveTargetColumn(opts.kind)
  const { data, error } = await getSupabaseBrowserClient()
    .from('person_catalog_saves')
    .select('id')
    .eq('person_id', opts.personId)
    .eq('family_id', opts.familyId)
    .eq('kind', opts.kind)
    .eq(column, opts.entityId)
    .limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

/** Returns whether the entity is saved after the toggle. */
export async function toggleCatalogSave(opts: {
  familyId: string
  kind: ExploreCatalogKind
  entityId: string
}): Promise<boolean> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('toggle_person_catalog_save', {
      p_family_id: opts.familyId,
      p_kind: opts.kind,
      p_entity_id: opts.entityId,
    })
  if (error) throw error
  return Boolean(data)
}

export async function listSavedCatalogEntityIds(opts: {
  familyId: string
  personId: string
  kind: ExploreCatalogKind
}): Promise<string[]> {
  const column = catalogSaveTargetColumn(opts.kind)
  const { data, error } = await getSupabaseBrowserClient()
    .from('person_catalog_saves')
    .select('place_id,experience_id,food_id,hotel_id')
    .eq('person_id', opts.personId)
    .eq('family_id', opts.familyId)
    .eq('kind', opts.kind)
    .order('created_at', { ascending: false })
    .limit(SAVED_LIST_LIMIT)
  if (error) throw error
  return ((data ?? []) as Array<{
    place_id: string | null
    experience_id: string | null
    food_id: string | null
    hotel_id: string | null
  }>).map(row => row[column]).filter((id): id is string => Boolean(id))
}

const CATALOG_SAVE_KINDS = new Set<ExploreCatalogKind>(['place', 'experience', 'food', 'hotel'])

export type CatalogSaveHint = {
  kind: ExploreCatalogKind
  entityId: string
  name: string
  countryId: string | null
  createdAt: string
}

type CatalogSaveHintRpcRow = {
  kind: string
  entity_id: string
  name: string
  country_id: string | null
  created_at: string
}

function isCatalogSaveKind(value: string): value is ExploreCatalogKind {
  return CATALOG_SAVE_KINDS.has(value as ExploreCatalogKind)
}

/** Own saved catalog picks in the given countries (P7 / W8.7). Newest first. */
export async function listMyCatalogSavesInCountries(opts: {
  familyId: string
  countryIds: string[]
}): Promise<CatalogSaveHint[]> {
  if (opts.countryIds.length === 0) return []
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('list_my_catalog_saves_in_countries', {
      p_family_id: opts.familyId,
      p_country_ids: opts.countryIds,
    })
  if (error) throw error
  return ((data ?? []) as CatalogSaveHintRpcRow[]).flatMap((row) => {
    if (!isCatalogSaveKind(row.kind) || !row.entity_id || !row.name) return []
    return [{
      kind: row.kind,
      entityId: row.entity_id,
      name: row.name,
      countryId: row.country_id,
      createdAt: row.created_at,
    }]
  })
}
