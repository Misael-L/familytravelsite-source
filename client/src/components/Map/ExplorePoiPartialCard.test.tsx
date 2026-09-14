import React from 'react'
import { render, screen, waitFor } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastContainer } from '../shared/Toast'
import { useSaveToCollectionStore } from '../../store/saveToCollectionStore'
import { listFamilyListMembership } from '../../data/supabase/familyLists'
import type { Poi } from './poiCategories'

vi.mock('../../data/supabase/catalogExploreMedia', () => ({
  listCatalogMediaUrlsForEntity: vi.fn().mockResolvedValue([]),
  toDisplayImageUrl: (url: string) => url,
}))

vi.mock('../../data/supabase/catalogSaves', () => ({
  isCatalogSaved: vi.fn().mockResolvedValue(false),
  toggleCatalogSave: vi.fn(),
}))

vi.mock('../../data/supabase/familyLists', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyLists')>()
  return {
    ...actual,
    listFamilyListMembership: vi.fn().mockResolvedValue([]),
  }
})

import ExplorePoiPartialCard from './ExplorePoiPartialCard'

const FOOD_ID = '550e8400-e29b-41d4-a716-446655440000'

const catalogPoi: Poi = {
  osm_id: `catalog:food:${FOOD_ID}`,
  name: 'Trattoria Rossi',
  lat: 43.35,
  lng: 12.57,
  category: 'restaurant',
  poi_type: 'restaurant',
  address: 'Via Roma',
  website: null,
  phone: null,
  opening_hours: null,
  cuisine: null,
  source: 'catalog',
}

const osmPoi: Poi = {
  ...catalogPoi,
  osm_id: 'node/123456',
  name: 'OSM Cafe',
  source: 'openstreetmap',
}

function renderCard(opts?: {
  poi?: Poi
  familyId?: string | null
  personId?: string | null
}) {
  return render(
    <>
      <ToastContainer />
      <ExplorePoiPartialCard
        poi={opts?.poi ?? catalogPoi}
        onDismiss={vi.fn()}
        onOpenExplore={vi.fn()}
        familyId={opts?.familyId === undefined ? 'fam-1' : opts.familyId}
        personId={opts?.personId === undefined ? 'p1' : opts.personId}
      />
    </>,
  )
}

describe('ExplorePoiPartialCard — Add to list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSaveToCollectionStore.setState({ target: null, version: 0 })
    vi.mocked(listFamilyListMembership).mockResolvedValue([])
  })

  it('places Bookmark left of the unchanged heart and opens the list picker', async () => {
    const user = userEvent.setup()
    renderCard()
    const add = await screen.findByRole('button', { name: 'Add to list' })
    const heart = screen.getByRole('button', { name: 'Save' })
    expect(add.compareDocumentPosition(heart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(add)
    expect(useSaveToCollectionStore.getState().target).toEqual({
      name: 'Trattoria Rossi',
      catalog_kind: 'food',
      catalog_entity_id: FOOD_ID,
    })
  })

  it('fills the bookmark when the entity is on a visible list', async () => {
    vi.mocked(listFamilyListMembership).mockResolvedValue([
      { listId: 'list-1', itemId: 'item-1' },
    ])
    renderCard()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'On a list' })).toHaveAttribute('aria-pressed', 'true')
    })
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('toasts missingPerson when the family profile is not linked', async () => {
    const user = userEvent.setup()
    renderCard({ familyId: null, personId: null })
    const add = await screen.findByRole('button', { name: 'Add to list' })
    expect(add).toHaveAttribute('aria-disabled', 'true')
    await user.click(add)
    expect(await screen.findByText(/family profile is not linked/i)).toBeInTheDocument()
    expect(useSaveToCollectionStore.getState().target).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('omits Bookmark and heart on OSM partials', () => {
    renderCard({ poi: osmPoi })
    expect(screen.queryByRole('button', { name: 'Add to list' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})
