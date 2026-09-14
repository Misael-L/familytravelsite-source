import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '../../../tests/helpers/render'
import { seedStore, resetAllStores } from '../../../tests/helpers/store'
import { useAuthStore } from '../../store/authStore'
import { collectionsApi } from '../../api/collections'
import {
  listFamilyListItems,
  listFamilyLists,
  signFamilyListCoverUrls,
  type FamilyListItemRow,
  type FamilyListRow,
} from '../../data/supabase/familyLists'
import CollectionsWidget from './CollectionsWidget'

vi.mock('../../api/collections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/collections')>()
  return {
    ...actual,
    collectionsApi: {
      ...actual.collectionsApi,
      list: vi.fn(),
    },
  }
})

vi.mock('../../data/supabase/familyLists', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyLists')>()
  return {
    ...actual,
    listFamilyLists: vi.fn(),
    listFamilyListItems: vi.fn(),
    signFamilyListCoverUrls: vi.fn(),
  }
})

const nestHtml = '<!DOCTYPE html><html><body><div id="root"></div></body></html>'

const familyList: FamilyListRow = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  family_id: 'fam-1',
  name: 'Tokyo eats',
  description: null,
  color: '#14b8a6',
  visibility: 'family',
  sort_order: 0,
  owner_person_id: 'p1',
  archived_at: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

const familyItem: FamilyListItemRow = {
  id: 'item-1',
  list_id: familyList.id,
  item_kind: 'place',
  status: 'want',
  sort_order: 0,
  name: 'Ramen',
  notes: null,
  country_id: null,
  place_id: 'place-1',
  experience_id: null,
  hotel_id: null,
  airport_id: null,
  airline_id: null,
  guide_id: null,
  food_id: null,
  added_at: null,
}

describe('CollectionsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAllStores()
    vi.stubEnv('VITE_DATA_PLANE', 'nest')
    vi.mocked(signFamilyListCoverUrls).mockResolvedValue({})
    vi.mocked(listFamilyListItems).mockResolvedValue([])
  })

  it('does not crash when Nest/SPA fallback returns HTML instead of collections', async () => {
    vi.mocked(collectionsApi.list).mockResolvedValue(nestHtml as never)
    render(<CollectionsWidget onOpen={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/no saved places yet/i)).toBeInTheDocument()
    })
  })

  it('does not crash when the list payload omits collections', async () => {
    vi.mocked(collectionsApi.list).mockResolvedValue({} as never)
    render(<CollectionsWidget onOpen={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/no saved places yet/i)).toBeInTheDocument()
    })
  })

  it('loads family lists on the supabase plane and never hits Nest collections', async () => {
    vi.stubEnv('VITE_DATA_PLANE', 'supabase')
    seedStore(useAuthStore, { familyId: 'fam-1', personId: 'p1' })
    vi.mocked(listFamilyLists).mockResolvedValue([familyList])
    vi.mocked(listFamilyListItems).mockResolvedValue([familyItem])

    render(<CollectionsWidget onOpen={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Tokyo eats')).toBeInTheDocument()
    })
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(collectionsApi.list).not.toHaveBeenCalled()
  })
})
