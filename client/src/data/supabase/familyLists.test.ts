import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { finalizePrivateUpload } from './privateUploads'
import {
  addFamilyListItem,
  archiveFamilyList,
  assertFamilyListCoverFile,
  createFamilyList,
  FAMILY_LIST_COVER_BUCKET,
  FamilyListCoverError,
  familyListItemEntityId,
  familyListItemFkColumn,
  listFamilyListMembership,
  listFamilyLists,
  mapFamilyListMembershipRows,
  loadFamilyCollections,
  mapFamilyList,
  mapFamilyListItem,
  searchCatalogForList,
  updateFamilyList,
  uploadFamilyListCover,
} from './familyLists'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

vi.mock('./privateUploads', () => ({
  finalizePrivateUpload: vi.fn(),
}))

vi.mock('../../utils/convertHeic', () => ({
  normalizeImageFile: async (file: File) => file,
}))

function thenable(result: { data: unknown; error: unknown }) {
  const t: Record<string, unknown> = {}
  const self = () => t
  for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'is', 'not', 'neq', 'order', 'ilike', 'insert', 'update', 'upsert', 'delete', 'maybeSingle', 'single', 'limit']) {
    t[m] = vi.fn(self)
  }
  t.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return t
}

describe('familyLists mapper', () => {
  it('maps a private list owned by the viewer', () => {
    const view = mapFamilyList({
      id: 'list-1',
      family_id: 'fam-1',
      name: '  Tokyo  ',
      description: 'eats',
      color: '#14b8a6',
      visibility: 'private',
      sort_order: 2,
      owner_person_id: 'p1',
      archived_at: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
      cover_media: { public_url: 'https://cdn.example/cover.jpg' },
    }, { personId: 'p1', placeCount: 3 })
    expect(view.id).toBe('list-1')
    expect(view.name).toBe('Tokyo')
    expect(view.is_owner).toBe(true)
    expect(view.place_count).toBe(3)
    expect(view.cover_image).toBe('https://cdn.example/cover.jpg')
    expect(view.visibility).toBe('private')
  })

  it('uses a signed cover override when public_url is absent', () => {
    const view = mapFamilyList({
      id: 'list-3',
      family_id: 'fam-1',
      name: 'Private',
      description: null,
      color: null,
      visibility: 'private',
      sort_order: 0,
      owner_person_id: 'p1',
      archived_at: null,
      created_at: null,
      updated_at: null,
      cover_media: { public_url: null, bucket: 'family', storage_path: 'fam-1/lists/list-3/a.jpg' },
    }, { personId: 'p1', coverImage: 'https://signed.example/a.jpg' })
    expect(view.cover_image).toBe('https://signed.example/a.jpg')
  })

  it('treats family-visible lists owned by someone else as not owner', () => {
    const view = mapFamilyList({
      id: 'list-2',
      family_id: 'fam-1',
      name: 'Shared eats',
      description: null,
      color: null,
      visibility: 'family',
      sort_order: 0,
      owner_person_id: 'p-other',
      archived_at: null,
      created_at: null,
      updated_at: null,
    }, { personId: 'p1', placeCount: 0 })
    expect(view.is_owner).toBe(false)
    expect(view.visibility).toBe('family')
  })

  it('joins catalog name/coords/cover onto a list item and omits missing coords', () => {
    const withCoords = mapFamilyListItem({
      id: 'item-1',
      list_id: 'list-1',
      item_kind: 'place',
      status: 'want',
      sort_order: 1,
      name: null,
      notes: null,
      country_id: null,
      place_id: 'pl-1',
      experience_id: null,
      hotel_id: null,
      airport_id: null,
      airline_id: null,
      guide_id: null,
      food_id: null,
      added_at: '2026-08-01',
    }, {
      name: 'Gubbio',
      lat: 43.35,
      lng: 12.57,
      address: null,
      notes: 'hill town',
      coverUrl: 'https://cdn.example/g.jpg',
      website: null,
      phone: null,
    })
    expect(withCoords.id).toBe('item-1')
    expect(withCoords.collection_id).toBe('list-1')
    expect(withCoords.name).toBe('Gubbio')
    expect(withCoords.lat).toBe(43.35)
    expect(withCoords.lng).toBe(12.57)
    expect(withCoords.image_url).toBe('https://cdn.example/g.jpg')
    expect(withCoords.status).toBe('want')

    const noCoords = mapFamilyListItem({
      id: 'item-2',
      list_id: 'list-1',
      item_kind: 'food',
      status: 'idea',
      sort_order: 0,
      name: null,
      notes: null,
      country_id: null,
      place_id: null,
      experience_id: null,
      hotel_id: null,
      airport_id: null,
      airline_id: null,
      guide_id: null,
      food_id: 'f-1',
      added_at: null,
    }, {
      name: 'Trattoria',
      lat: null,
      lng: null,
      address: 'Via Roma',
      notes: null,
      coverUrl: null,
      website: null,
      phone: null,
    })
    expect(noCoords.lat).toBeNull()
    expect(noCoords.lng).toBeNull()
    expect(noCoords.address).toBe('Via Roma')
  })

  it('reads the matching FK for each catalog kind', () => {
    expect(familyListItemEntityId({
      id: 'i', list_id: 'l', item_kind: 'experience', status: 'idea', sort_order: 0,
      name: null, notes: null, country_id: null, place_id: null, experience_id: 'ex-1',
      hotel_id: null, airport_id: null, airline_id: null, guide_id: null, food_id: null, added_at: null,
    })).toBe('ex-1')
    expect(familyListItemFkColumn('place')).toBe('place_id')
    expect(familyListItemFkColumn('experience')).toBe('experience_id')
    expect(familyListItemFkColumn('food')).toBe('food_id')
    expect(familyListItemFkColumn('hotel')).toBe('hotel_id')
  })

  it('maps membership rows to listId/itemId and drops blanks', () => {
    expect(mapFamilyListMembershipRows([
      { id: 'item-1', list_id: 'list-1' },
      { id: '  ', list_id: 'list-2' },
      { id: 'item-3', list_id: null },
    ])).toEqual([{ listId: 'list-1', itemId: 'item-1' }])
  })
})

describe('familyLists adapter', () => {
  const from = vi.fn()
  const rpc = vi.fn()
  const upload = vi.fn()
  const remove = vi.fn()
  const createSignedUrls = vi.fn()

  beforeEach(() => {
    from.mockReset()
    rpc.mockReset()
    upload.mockReset()
    remove.mockReset()
    createSignedUrls.mockReset()
    vi.mocked(finalizePrivateUpload).mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      from,
      rpc,
      storage: { from: vi.fn(() => ({ upload, remove, createSignedUrls })) },
    } as never)
  })

  it('lists unarchived family lists and throws on error', async () => {
    const chain = thenable({ data: [], error: null })
    from.mockReturnValue(chain)
    await listFamilyLists('fam-1')
    expect(from).toHaveBeenCalledWith('lists')
    expect(chain.eq).toHaveBeenCalledWith('family_id', 'fam-1')
    expect(chain.is).toHaveBeenCalledWith('archived_at', null)

    const fail = thenable({ data: null, error: { message: 'boom' } })
    from.mockReturnValue(fail)
    await expect(listFamilyLists('fam-1')).rejects.toEqual({ message: 'boom' })
  })

  it('retries list and catalog selects without cover_media when the embed is denied', async () => {
    const listsDenied = thenable({ data: null, error: { message: 'embed denied', code: '42501' } })
    const listsOk = thenable({
      data: [{
        id: 'list-1',
        family_id: 'fam-1',
        name: 'Eats',
        description: null,
        color: '#6366f1',
        visibility: 'family',
        sort_order: 0,
        owner_person_id: 'p1',
        archived_at: null,
        created_at: null,
        updated_at: null,
      }],
      error: null,
    })
    const itemsOk = thenable({
      data: [{
        id: 'item-1',
        list_id: 'list-1',
        item_kind: 'place',
        status: 'want',
        sort_order: 0,
        name: null,
        notes: null,
        country_id: null,
        place_id: 'pl-1',
        experience_id: null,
        hotel_id: null,
        airport_id: null,
        airline_id: null,
        guide_id: null,
        food_id: null,
        added_at: null,
      }],
      error: null,
    })
    const placesDenied = thenable({ data: null, error: { message: 'embed denied', code: '42501' } })
    const placesOk = thenable({
      data: [{ id: 'pl-1', name: 'Florence', latitude: 43.77, longitude: 11.25, notes: null }],
      error: null,
    })
    from
      .mockReturnValueOnce(listsDenied)
      .mockReturnValueOnce(listsOk)
      .mockReturnValueOnce(itemsOk)
      .mockReturnValueOnce(placesDenied)
      .mockReturnValueOnce(placesOk)
    const loaded = await loadFamilyCollections({ familyId: 'fam-1', personId: 'p1' })
    expect(loaded.collections).toHaveLength(1)
    expect(loaded.places).toHaveLength(1)
    expect(loaded.places[0].lat).toBe(43.77)
    expect(loaded.places[0].lng).toBe(11.25)
    expect(from).toHaveBeenNthCalledWith(1, 'lists')
    expect(from).toHaveBeenNthCalledWith(2, 'lists')
    expect(from).toHaveBeenNthCalledWith(5, 'places')
  })

  it('selects membership by catalog FK and throws on { error }', async () => {
    const chain = thenable({
      data: [{ id: 'item-1', list_id: 'list-1' }, { id: 'item-2', list_id: 'list-2' }],
      error: null,
    })
    from.mockReturnValue(chain)
    await expect(listFamilyListMembership('fam-1', 'place', 'pl-1')).resolves.toEqual([
      { listId: 'list-1', itemId: 'item-1' },
      { listId: 'list-2', itemId: 'item-2' },
    ])
    expect(from).toHaveBeenCalledWith('list_items')
    expect(chain.select).toHaveBeenCalledWith('id,list_id,lists!inner(family_id,archived_at)')
    expect(chain.eq).toHaveBeenCalledWith('item_kind', 'place')
    expect(chain.eq).toHaveBeenCalledWith('place_id', 'pl-1')
    expect(chain.eq).toHaveBeenCalledWith('lists.family_id', 'fam-1')
    expect(chain.is).toHaveBeenCalledWith('lists.archived_at', null)

    const fail = thenable({ data: null, error: { message: 'denied' } })
    from.mockReturnValue(fail)
    await expect(listFamilyListMembership('fam-1', 'hotel', 'h-1')).rejects.toEqual({ message: 'denied' })
  })

  it('returns no membership without a family or entity id', async () => {
    await expect(listFamilyListMembership('', 'place', 'pl-1')).resolves.toEqual([])
    await expect(listFamilyListMembership('fam-1', 'place', '  ')).resolves.toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it('hydrates catalog joins on load and does not use person_catalog_saves', async () => {
    const listsChain = thenable({
      data: [{
        id: 'list-1',
        family_id: 'fam-1',
        name: 'Eats',
        description: null,
        color: '#6366f1',
        visibility: 'private',
        sort_order: 0,
        owner_person_id: 'p1',
        archived_at: null,
        created_at: null,
        updated_at: null,
        cover_media: null,
      }],
      error: null,
    })
    const itemsChain = thenable({
      data: [{
        id: 'item-1',
        list_id: 'list-1',
        item_kind: 'place',
        status: 'idea',
        sort_order: 0,
        name: null,
        notes: null,
        country_id: null,
        place_id: 'pl-1',
        experience_id: null,
        hotel_id: null,
        airport_id: null,
        airline_id: null,
        guide_id: null,
        food_id: null,
        added_at: null,
      }],
      error: null,
    })
    const placesChain = thenable({
      data: [{
        id: 'pl-1',
        name: 'Gubbio',
        latitude: 43.35,
        longitude: 12.57,
        notes: null,
        cover_media: { public_url: 'https://cdn.example/g.jpg' },
      }],
      error: null,
    })
    from
      .mockReturnValueOnce(listsChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(placesChain)

    const loaded = await loadFamilyCollections({ familyId: 'fam-1', personId: 'p1' })
    expect(from.mock.calls.map(c => c[0])).toEqual(['lists', 'list_items', 'places'])
    expect(from.mock.calls.map(c => c[0])).not.toContain('person_catalog_saves')
    expect(loaded.collections).toHaveLength(1)
    expect(loaded.collections[0].place_count).toBe(1)
    expect(loaded.places[0].name).toBe('Gubbio')
    expect(loaded.places[0].lat).toBe(43.35)
  })

  it('creates via RPC and throws on { error }', async () => {
    rpc.mockResolvedValueOnce({ data: 'new-list', error: null })
    await expect(createFamilyList({ familyId: 'fam-1', name: 'Eats', visibility: 'private' }))
      .resolves.toBe('new-list')
    expect(rpc).toHaveBeenCalledWith('create_family_list', expect.objectContaining({
      p_family_id: 'fam-1',
      p_name: 'Eats',
      p_visibility: 'private',
    }))

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'nope' } })
    await expect(createFamilyList({ familyId: 'fam-1', name: 'X' })).rejects.toEqual({ message: 'nope' })
  })

  it('archives and adds items via RPCs', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await archiveFamilyList('list-1')
    expect(rpc).toHaveBeenCalledWith('archive_family_list', { p_list_id: 'list-1' })

    rpc.mockResolvedValueOnce({ data: 'item-9', error: null })
    await expect(addFamilyListItem({ listId: 'list-1', kind: 'hotel', entityId: 'h-1' }))
      .resolves.toBe('item-9')
    expect(rpc).toHaveBeenCalledWith('add_list_item', {
      p_list_id: 'list-1',
      p_kind: 'hotel',
      p_entity_id: 'h-1',
      p_status: 'idea',
    })
  })

  it('searches catalog by kind without a country scope', async () => {
    const chain = thenable({
      data: [{ id: 'pl-1', name: 'Perugia' }],
      error: null,
    })
    from.mockReturnValue(chain)
    const hits = await searchCatalogForList({ kind: 'place', query: 'pe', excludeIds: ['skip'] })
    expect(from).toHaveBeenCalledWith('places')
    expect(chain.ilike).toHaveBeenCalledWith('name', '%pe%')
    expect(hits).toEqual([{ id: 'pl-1', name: 'Perugia' }])
  })

  it('signs family-bucket covers and does not throw when signing fails', async () => {
    const listsChain = thenable({
      data: [{
        id: 'list-1',
        family_id: 'fam-1',
        name: 'Eats',
        description: null,
        color: '#6366f1',
        visibility: 'private',
        sort_order: 0,
        owner_person_id: 'p1',
        archived_at: null,
        created_at: null,
        updated_at: null,
        cover_media: { public_url: null, bucket: 'family', storage_path: 'fam-1/lists/list-1/a.jpg' },
      }],
      error: null,
    })
    const itemsChain = thenable({ data: [], error: null })
    from.mockReturnValueOnce(listsChain).mockReturnValueOnce(itemsChain)
    createSignedUrls.mockResolvedValueOnce({
      data: [{ signedUrl: 'https://signed.example/a.jpg', error: null }],
      error: null,
    })
    const loaded = await loadFamilyCollections({ familyId: 'fam-1', personId: 'p1' })
    expect(createSignedUrls).toHaveBeenCalledWith(['fam-1/lists/list-1/a.jpg'], 3600)
    expect(loaded.collections[0].cover_image).toBe('https://signed.example/a.jpg')
  })

  it('clears a cover via update_family_list', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await updateFamilyList('list-1', { clearCover: true })
    expect(rpc).toHaveBeenCalledWith('update_family_list', expect.objectContaining({
      p_list_id: 'list-1',
      p_clear_cover: true,
    }))
  })

  it('uploads to family Storage then finalize-private-upload and rolls back on error', async () => {
    const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'c.jpg', { type: 'image/jpeg' })
    upload.mockResolvedValueOnce({ error: null })
    vi.mocked(finalizePrivateUpload).mockRejectedValueOnce({ message: 'nope' })
    remove.mockResolvedValueOnce({ error: null })
    await expect(uploadFamilyListCover({ familyId: 'fam-1', listId: 'list-1', file }))
      .rejects.toEqual({ message: 'nope' })
    expect(upload).toHaveBeenCalledWith(
      'fam-1/lists/list-1/11111111-1111-4111-8111-111111111111.jpg',
      expect.any(File),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false }),
    )
    expect(finalizePrivateUpload).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'list_cover',
      listId: 'list-1',
      path: 'fam-1/lists/list-1/11111111-1111-4111-8111-111111111111.jpg',
    }))
    expect(remove).toHaveBeenCalledWith(['fam-1/lists/list-1/11111111-1111-4111-8111-111111111111.jpg'])
    expect(FAMILY_LIST_COVER_BUCKET).toBe('family')
    uuid.mockRestore()
  })
})

describe('family list cover file gate', () => {
  it('rejects oversize and non-image files', () => {
    const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })
    expect(() => assertFamilyListCoverFile(big)).toThrow(FamilyListCoverError)
    const pdf = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })
    try {
      assertFamilyListCoverFile(pdf)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(FamilyListCoverError)
      expect((err as FamilyListCoverError).code).toBe('bad-type')
    }
  })
})
