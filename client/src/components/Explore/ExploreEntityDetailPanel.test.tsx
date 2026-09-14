import React from 'react'
import { render, screen, waitFor } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastContainer } from '../shared/Toast'
import { useSaveToCollectionStore } from '../../store/saveToCollectionStore'
import { fetchExploreCatalogDetail } from '../../data/supabase/catalogExploreLists'
import { listFamilyListMembership } from '../../data/supabase/familyLists'
import { isCatalogSaved } from '../../data/supabase/catalogSaves'

vi.mock('../../data/supabase/catalogExploreLists', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/catalogExploreLists')>()
  return {
    ...actual,
    fetchExploreCatalogDetail: vi.fn(),
  }
})

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

import ExploreEntityDetailPanel from './ExploreEntityDetailPanel'

const detail = {
  id: 'pl-1',
  kind: 'place' as const,
  name: 'Gubbio',
  notes: null,
  address: null,
  linkUrl: null,
  phone: null,
  typeLabel: null,
  latitude: 43.35,
  longitude: 12.57,
  coverUrl: null,
  placeId: null,
}

function renderPanel(opts?: { familyId?: string | null; personId?: string | null }) {
  return render(
    <>
      <ToastContainer />
      <ExploreEntityDetailPanel
        kind="place"
        entityId="pl-1"
        onBack={vi.fn()}
        tripId="trip-1"
        canMutate={false}
        tripPlaceIds={[]}
        days={[]}
        scheduleItems={[]}
        onItineraryChanged={vi.fn().mockResolvedValue(undefined)}
        familyId={opts?.familyId === undefined ? 'fam-1' : opts.familyId}
        personId={opts?.personId === undefined ? 'p1' : opts.personId}
      />
    </>,
  )
}

describe('ExploreEntityDetailPanel — Add to list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSaveToCollectionStore.setState({ target: null, version: 0 })
    vi.mocked(fetchExploreCatalogDetail).mockResolvedValue(detail)
    vi.mocked(listFamilyListMembership).mockResolvedValue([])
    vi.mocked(isCatalogSaved).mockResolvedValue(false)
  })

  it('places Bookmark left of the unchanged heart and opens the list picker', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByRole('heading', { level: 1, name: 'Gubbio' })
    const add = screen.getByRole('button', { name: 'Add to list' })
    const heart = screen.getByRole('button', { name: 'Save' })
    expect(add.compareDocumentPosition(heart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(add)
    expect(useSaveToCollectionStore.getState().target).toEqual({
      name: 'Gubbio',
      catalog_kind: 'place',
      catalog_entity_id: 'pl-1',
    })
  })

  it('fills the bookmark when the entity is on a visible list', async () => {
    vi.mocked(listFamilyListMembership).mockResolvedValue([
      { listId: 'list-1', itemId: 'item-1' },
    ])
    renderPanel()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'On a list' })).toHaveAttribute('aria-pressed', 'true')
    })
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('toasts missingPerson when the family profile is not linked', async () => {
    const user = userEvent.setup()
    renderPanel({ familyId: null, personId: null })
    await screen.findByRole('heading', { level: 1, name: 'Gubbio' })
    const add = screen.getByRole('button', { name: 'Add to list' })
    expect(add).toHaveAttribute('aria-disabled', 'true')
    await user.click(add)
    expect(await screen.findByText(/family profile is not linked/i)).toBeInTheDocument()
    expect(useSaveToCollectionStore.getState().target).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
