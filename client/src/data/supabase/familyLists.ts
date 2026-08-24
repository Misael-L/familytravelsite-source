/**
 * Named family Collections — PostgREST SELECT on `lists` / `list_items` + RPC writes.
 * Not packing/todos. Not `person_catalog_saves`. Not Nest `/addons/collections`.
 */
import type { Collection, CollectionPlace, CollectionStatus } from '@trek/shared'
import { getSupabaseBrowserClient } from './client'
import { normalizeImageFile } from '../../utils/convertHeic'
import { finalizePrivateUpload } from './privateUploads'

export const FAMILY_LIST_COVER_BUCKET = 'family'
export const FAMILY_LIST_COVER_MAX_BYTES = 8 * 1024 * 1024
export const FAMILY_LIST_COVER_MIME = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
] as const

export type FamilyListCoverErrorCode = 'too-large' | 'bad-type'

export class FamilyListCoverError extends Error {
  code: FamilyListCoverErrorCode
  constructor(code: FamilyListCoverErrorCode) {
    super(code)
    this.code = code
    this.name = 'FamilyListCoverError'
  }
}

const COVER_SIGNED_EXPIRES_SEC = 3600

export type FamilyListVisibility = 'private' | 'family'
export type FamilyListItemKind =
  | 'country'
  | 'place'
  | 'experience'
  | 'hotel'
  | 'airport'
  | 'airline'
  | 'guide'
  | 'food'

export const FAMILY_LIST_CATALOG_KINDS = ['place', 'experience', 'food', 'hotel'] as const
export type FamilyListCatalogKind = (typeof FAMILY_LIST_CATALOG_KINDS)[number]

export type FamilyListView = Collection & {
  visibility: FamilyListVisibility
}

type CoverMediaRow = {
  public_url?: string | null
  bucket?: string | null
  storage_path?: string | null
}
type CoverEmbed = CoverMediaRow | CoverMediaRow[] | null

export type FamilyListRow = {
  id: string
  family_id: string
  name: string | null
  description: string | null
  color: string | null
  visibility: FamilyListVisibility | null
  sort_order: number | null
  owner_person_id: string | null
  archived_at: string | null
  created_at: string | null
  updated_at: string | null
  cover_media?: CoverEmbed
}

export type FamilyListItemRow = {
  id: string
  list_id: string
  item_kind: FamilyListItemKind | string
  status: CollectionStatus | string | null
  sort_order: number | null
  name: string | null
  notes: string | null
  country_id: string | null
  place_id: string | null
  experience_id: string | null
  hotel_id: string | null
  airport_id: string | null
  airline_id: string | null
  guide_id: string | null
  food_id: string | null
  added_at: string | null
}

type CatalogSnap = {
  name: string
  lat: number | null
  lng: number | null
  address: string | null
  notes: string | null
  coverUrl: string | null
  website: string | null
  phone: string | null
}

const LIST_SELECT =
  'id,family_id,name,description,color,visibility,sort_order,owner_person_id,archived_at,created_at,updated_at,cover_media:media_assets!cover_media_id(public_url,bucket,storage_path)'

const ITEM_SELECT =
  'id,list_id,item_kind,status,sort_order,name,notes,country_id,place_id,experience_id,hotel_id,airport_id,airline_id,guide_id,food_id,added_at'

const KIND_TABLE: Record<FamilyListCatalogKind, string> = {
  place: 'places',
  experience: 'experiences',
  food: 'foods',
  hotel: 'hotels',
}

const KIND_SELECT: Record<FamilyListCatalogKind, string> = {
  place: 'id,name,latitude,longitude,notes,cover_media:media_assets!cover_media_id(public_url)',
  experience:
    'id,name,latitude,longitude,address,notes,inspiration_url,cover_media:media_assets!cover_media_id(public_url)',
  food: 'id,name,latitude,longitude,address,notes,link_url,cover_media:media_assets!cover_media_id(public_url)',
  hotel:
    'id,name,latitude,longitude,address,notes,website,contact_phone,cover_media:media_assets!cover_media_id(public_url)',
}

const KIND_LABEL: Record<string, string> = {
  place: 'Place',
  experience: 'Experience',
  food: 'Food',
  hotel: 'Hotel',
  country: 'Country',
  airport: 'Airport',
  airline: 'Airline',
  guide: 'Guide',
}

function coverMediaRow(embed: CoverEmbed | undefined): CoverMediaRow | undefined {
  if (!embed) return undefined
  return Array.isArray(embed) ? embed[0] : embed
}

function coverPublicUrl(embed: CoverEmbed | undefined): string | null {
  const url = coverMediaRow(embed)?.public_url?.trim()
  return url || null
}

export function familyListCoverStorageRef(embed: CoverEmbed | undefined): { bucket: string; path: string } | null {
  const row = coverMediaRow(embed)
  const bucket = row?.bucket?.trim()
  const path = row?.storage_path?.trim()
  if (!bucket || !path) return null
  return { bucket, path }
}

export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const src = bytes instanceof Uint8Array
    ? bytes
    : bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const hash = await crypto.subtle.digest('SHA-256', src)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function coverExt(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/avif') return 'avif'
  return 'jpg'
}

export function assertFamilyListCoverFile(file: File): void {
  const mime = (file.type || '').toLowerCase()
  const heic = mime === 'image/heic' || mime === 'image/heif'
    || /\.(heic|heif)$/i.test(file.name)
  if (!heic && !(FAMILY_LIST_COVER_MIME as readonly string[]).includes(mime)) {
    throw new FamilyListCoverError('bad-type')
  }
  if (file.size > FAMILY_LIST_COVER_MAX_BYTES) {
    throw new FamilyListCoverError('too-large')
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function trimOrNull(v: string | null | undefined): string | null {
  const t = v?.trim()
  return t || null
}

const CATALOG_FK: Record<FamilyListCatalogKind, 'place_id' | 'experience_id' | 'food_id' | 'hotel_id'> = {
  place: 'place_id',
  experience: 'experience_id',
  food: 'food_id',
  hotel: 'hotel_id',
}

export function familyListItemFkColumn(kind: FamilyListCatalogKind): (typeof CATALOG_FK)[FamilyListCatalogKind] {
  return CATALOG_FK[kind]
}

export type FamilyListMembership = { listId: string; itemId: string }

export function mapFamilyListMembershipRows(
  rows: Array<{ id?: string | null; list_id?: string | null }>,
): FamilyListMembership[] {
  const out: FamilyListMembership[] = []
  for (const row of rows) {
    const listId = row.list_id?.trim()
    const itemId = row.id?.trim()
    if (!listId || !itemId) continue
    out.push({ listId, itemId })
  }
  return out
}

export function familyListItemEntityId(row: FamilyListItemRow): string | null {
  switch (row.item_kind) {
    case 'place': return row.place_id
    case 'experience': return row.experience_id
    case 'food': return row.food_id
    case 'hotel': return row.hotel_id
    case 'country': return row.country_id
    case 'airport': return row.airport_id
    case 'airline': return row.airline_id
    case 'guide': return row.guide_id
    default: return null
  }
}

export function isFamilyListCatalogKind(kind: string): kind is FamilyListCatalogKind {
  return (FAMILY_LIST_CATALOG_KINDS as readonly string[]).includes(kind)
}

export function mapFamilyList(
  row: FamilyListRow,
  opts: { personId: string; placeCount?: number; coverImage?: string | null },
): FamilyListView {
  const visibility: FamilyListVisibility = row.visibility === 'family' ? 'family' : 'private'
  const ownerId = row.owner_person_id ?? ''
  return {
    id: row.id as unknown as number,
    owner_id: ownerId as unknown as number,
    name: row.name?.trim() || 'Untitled list',
    description: trimOrNull(row.description),
    color: trimOrNull(row.color),
    cover_image: opts.coverImage !== undefined ? opts.coverImage : coverPublicUrl(row.cover_media),
    sort_order: row.sort_order ?? 0,
    place_count: opts.placeCount ?? 0,
    is_owner: Boolean(ownerId) && ownerId === opts.personId,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
    visibility,
  }
}

export type FamilyCollectionPlace = CollectionPlace & {
  catalog_kind: FamilyListItemKind | string
  catalog_entity_id: string | null
}

export function mapFamilyListItem(
  row: FamilyListItemRow,
  catalog: CatalogSnap | null,
): FamilyCollectionPlace {
  const status: CollectionStatus =
    row.status === 'want' || row.status === 'visited' || row.status === 'idea' ? row.status : 'idea'
  const kindLabel = KIND_LABEL[row.item_kind] ?? row.item_kind
  const name = catalog?.name?.trim() || row.name?.trim() || kindLabel || 'Untitled'
  const lat = catalog?.lat ?? null
  const lng = catalog?.lng ?? null
  return {
    id: row.id as unknown as number,
    collection_id: row.list_id as unknown as number,
    name,
    description: catalog?.notes ?? trimOrNull(row.notes),
    lat,
    lng,
    address: catalog?.address ?? kindLabel,
    notes: trimOrNull(row.notes),
    image_url: catalog?.coverUrl ?? null,
    website: catalog?.website ?? null,
    phone: catalog?.phone ?? null,
    status,
    sort_order: row.sort_order ?? 0,
    created_at: row.added_at ?? undefined,
    label_ids: [],
    catalog_kind: row.item_kind,
    catalog_entity_id: familyListItemEntityId(row),
  }
}

export async function listFamilyLists(familyId: string): Promise<FamilyListRow[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('lists')
    .select(LIST_SELECT)
    .eq('family_id', familyId)
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as FamilyListRow[]
}

export async function listFamilyListMembership(
  familyId: string,
  kind: FamilyListCatalogKind,
  entityId: string,
): Promise<FamilyListMembership[]> {
  const fid = familyId.trim()
  const eid = entityId.trim()
  if (!fid || !eid) return []
  const fk = familyListItemFkColumn(kind)
  const { data, error } = await getSupabaseBrowserClient()
    .from('list_items')
    .select('id,list_id,lists!inner(family_id,archived_at)')
    .eq('item_kind', kind)
    .eq(fk, eid)
    .eq('lists.family_id', fid)
    .is('lists.archived_at', null)
  if (error) throw error
  return mapFamilyListMembershipRows((data ?? []) as Array<{ id: string; list_id: string }>)
}

export async function listFamilyListItems(listIds: string[]): Promise<FamilyListItemRow[]> {
  const unique = [...new Set(listIds.filter(Boolean))]
  if (unique.length === 0) return []
  const { data, error } = await getSupabaseBrowserClient()
    .from('list_items')
    .select(ITEM_SELECT)
    .in('list_id', unique)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as FamilyListItemRow[]
}

type CatalogRow = {
  id: string
  name: string | null
  latitude?: unknown
  longitude?: unknown
  address?: string | null
  notes?: string | null
  inspiration_url?: string | null
  link_url?: string | null
  website?: string | null
  contact_phone?: string | null
  cover_media?: CoverEmbed
}

function snapFromCatalog(kind: FamilyListCatalogKind, row: CatalogRow): CatalogSnap {
  const website =
    kind === 'experience' ? trimOrNull(row.inspiration_url)
      : kind === 'food' ? trimOrNull(row.link_url)
        : kind === 'hotel' ? trimOrNull(row.website)
          : null
  return {
    name: row.name?.trim() || KIND_LABEL[kind] || 'Untitled',
    lat: numOrNull(row.latitude),
    lng: numOrNull(row.longitude),
    address: trimOrNull(row.address),
    notes: trimOrNull(row.notes),
    coverUrl: coverPublicUrl(row.cover_media),
    website,
    phone: kind === 'hotel' ? trimOrNull(row.contact_phone) : null,
  }
}

async function hydrateCatalog(items: FamilyListItemRow[]): Promise<Map<string, CatalogSnap>> {
  const out = new Map<string, CatalogSnap>()
  const byKind = new Map<FamilyListCatalogKind, string[]>()
  for (const item of items) {
    if (!isFamilyListCatalogKind(item.item_kind)) continue
    const entityId = familyListItemEntityId(item)
    if (!entityId) continue
    const list = byKind.get(item.item_kind) ?? []
    list.push(entityId)
    byKind.set(item.item_kind, list)
  }

  const sb = getSupabaseBrowserClient()
  await Promise.all([...byKind.entries()].map(async ([kind, ids]) => {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return
    const { data, error } = await sb
      .from(KIND_TABLE[kind])
      .select(KIND_SELECT[kind])
      .in('id', unique)
    if (error) throw error
    for (const row of ((data ?? []) as unknown as CatalogRow[])) {
      if (!row.id) continue
      out.set(`${kind}:${row.id}`, snapFromCatalog(kind, row))
    }
  }))
  return out
}

export async function loadFamilyCollections(opts: {
  familyId: string
  personId: string
}): Promise<{ collections: FamilyListView[]; places: FamilyCollectionPlace[] }> {
  const rows = await listFamilyLists(opts.familyId)
  const items = await listFamilyListItems(rows.map(r => r.id))
  const catalog = await hydrateCatalog(items)
  const places = items.map(item => {
    const kind = item.item_kind
    const entityId = familyListItemEntityId(item)
    const snap = entityId && isFamilyListCatalogKind(kind) ? catalog.get(`${kind}:${entityId}`) ?? null : null
    return mapFamilyListItem(item, snap)
  })
  const countByList = new Map<string, number>()
  for (const item of items) {
    countByList.set(item.list_id, (countByList.get(item.list_id) ?? 0) + 1)
  }
  const signed = await signFamilyListCoverUrls(rows)
  const collections = rows.map(row => mapFamilyList(row, {
    personId: opts.personId,
    placeCount: countByList.get(row.id) ?? 0,
    coverImage: signed[row.id] ?? coverPublicUrl(row.cover_media),
  }))
  return { collections, places }
}

type SignedUrlRow = {
  signedUrl?: string | null
  error?: string | null
}

/** Batch signed URLs for family-bucket list covers. Soft-fail → omit (color-only hero). */
export async function signFamilyListCoverUrls(rows: FamilyListRow[]): Promise<Record<string, string>> {
  const byBucket = new Map<string, { listId: string; path: string }[]>()
  for (const row of rows) {
    if (coverPublicUrl(row.cover_media)) continue
    const ref = familyListCoverStorageRef(row.cover_media)
    if (!ref) continue
    const list = byBucket.get(ref.bucket) ?? []
    list.push({ listId: row.id, path: ref.path })
    byBucket.set(ref.bucket, list)
  }
  const out: Record<string, string> = {}
  if (byBucket.size === 0) return out
  const storage = getSupabaseBrowserClient().storage
  for (const [bucket, items] of byBucket) {
    try {
      const { data, error } = await storage.from(bucket).createSignedUrls(
        items.map(i => i.path),
        COVER_SIGNED_EXPIRES_SEC,
      )
      if (error || !data) continue
      const signed = data as SignedUrlRow[]
      for (let i = 0; i < items.length; i++) {
        const url = signed[i]?.signedUrl?.trim()
        if (url && !signed[i]?.error) out[items[i].listId] = url
      }
    } catch {
      // color-only hero
    }
  }
  return out
}

export type FamilyListWrite = {
  name?: string
  description?: string | null
  color?: string | null
  visibility?: FamilyListVisibility
  clearCover?: boolean
}

export async function createFamilyList(opts: {
  familyId: string
  name: string
  visibility?: FamilyListVisibility
  description?: string | null
  color?: string | null
}): Promise<string> {
  const { data, error } = await getSupabaseBrowserClient().rpc('create_family_list', {
    p_family_id: opts.familyId,
    p_name: opts.name,
    p_visibility: opts.visibility ?? 'private',
    p_description: opts.description ?? null,
    p_color: opts.color ?? null,
  })
  if (error) throw error
  if (typeof data !== 'string' || !data) throw new Error('create_family_list returned no id')
  return data
}

export async function updateFamilyList(listId: string, patch: FamilyListWrite): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('update_family_list', {
    p_list_id: listId,
    p_name: patch.name ?? null,
    // RPC: null = keep; '' = clear.
    p_description: patch.description === undefined ? null : (patch.description ?? ''),
    p_color: patch.color === undefined ? null : patch.color,
    p_visibility: patch.visibility ?? null,
    p_clear_cover: patch.clearCover === true,
  })
  if (error) throw error
}

export async function uploadFamilyListCover(opts: {
  familyId: string
  listId: string
  file: File
}): Promise<void> {
  assertFamilyListCoverFile(opts.file)
  const file = await normalizeImageFile(opts.file)
  if (file.size > FAMILY_LIST_COVER_MAX_BYTES) {
    throw new FamilyListCoverError('too-large')
  }
  const mime = (file.type || '').toLowerCase()
  if (!(FAMILY_LIST_COVER_MIME as readonly string[]).includes(mime)) {
    throw new FamilyListCoverError('bad-type')
  }
  const filename = `${crypto.randomUUID()}.${coverExt(mime)}`
  const path = `${opts.familyId}/lists/${opts.listId}/${filename}`
  const sb = getSupabaseBrowserClient()
  const { error: upErr } = await sb.storage.from(FAMILY_LIST_COVER_BUCKET).upload(path, file, {
    contentType: mime,
    upsert: false,
  })
  if (upErr) throw upErr
  try {
    await finalizePrivateUpload({
      kind: 'list_cover',
      path,
      listId: opts.listId,
      filename,
    })
  } catch (err) {
    await sb.storage.from(FAMILY_LIST_COVER_BUCKET).remove([path]).catch(() => {})
    throw err
  }
}

export async function archiveFamilyList(listId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('archive_family_list', { p_list_id: listId })
  if (error) throw error
}

export async function addFamilyListItem(opts: {
  listId: string
  kind: FamilyListCatalogKind
  entityId: string
  status?: CollectionStatus
}): Promise<string> {
  const { data, error } = await getSupabaseBrowserClient().rpc('add_list_item', {
    p_list_id: opts.listId,
    p_kind: opts.kind,
    p_entity_id: opts.entityId,
    p_status: opts.status ?? 'idea',
  })
  if (error) throw error
  if (typeof data !== 'string' || !data) throw new Error('add_list_item returned no id')
  return data
}

export async function removeFamilyListItem(itemId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('remove_list_item', { p_item_id: itemId })
  if (error) throw error
}

export async function setFamilyListItemStatus(itemId: string, status: CollectionStatus): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('set_list_item_status', {
    p_item_id: itemId,
    p_status: status,
  })
  if (error) throw error
}

export type CatalogListHit = { id: string; name: string }

export async function searchCatalogForList(opts: {
  kind: FamilyListCatalogKind
  query: string
  excludeIds?: string[]
  limit?: number
}): Promise<CatalogListHit[]> {
  const q = opts.query.trim()
  if (q.length < 2) return []
  const { data, error } = await getSupabaseBrowserClient()
    .from(KIND_TABLE[opts.kind])
    .select('id,name')
    .is('archived_at', null)
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(opts.limit ?? 80)
  if (error) throw error
  const exclude = new Set(opts.excludeIds ?? [])
  return ((data ?? []) as Array<{ id: string; name: string | null }>)
    .filter(r => r.id && !exclude.has(r.id))
    .map(r => ({
      id: r.id,
      name: r.name?.trim() || KIND_LABEL[opts.kind] || 'Untitled',
    }))
}
