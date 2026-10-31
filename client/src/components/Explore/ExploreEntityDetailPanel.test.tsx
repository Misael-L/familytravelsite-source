import React from 'react'
import { render, screen, waitFor } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastContainer } from '../shared/Toast'
import { useSaveToCollectionStore } from '../../store/saveToCollectionStore'
import { useAddonStore } from '../../store/addonStore'
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

vi.mock('../../data/supabase/catalogExploreMedia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/catalogExploreMedia')>()
  return {
    ...actual,
    listCatalogMediaUrlsForEntity: vi.fn().mockResolvedValue([]),
    listCatalogVariantSlidesForEntity: vi.fn().mockResolvedValue([]),
  }
})

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

import { listCatalogVariantSlidesForEntity } from '../../data/supabase/catalogExploreMedia'
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
  canonicalCoverUrl: null,
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
    useAddonStore.setState({
      addons: [{ id: 'collections', name: 'Collections', type: 'collections', icon: 'bookmark', enabled: true }],
      loaded: true,
    })
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

describe('ExploreEntityDetailPanel — displayed original', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSaveToCollectionStore.setState({ target: null, version: 0 })
    useAddonStore.setState({
      addons: [{ id: 'collections', name: 'Collections', type: 'collections', icon: 'bookmark', enabled: true }],
      loaded: true,
    })
    vi.mocked(fetchExploreCatalogDetail).mockResolvedValue(detail)
    vi.mocked(listFamilyListMembership).mockResolvedValue([])
    vi.mocked(isCatalogSaved).mockResolvedValue(false)
    vi.mocked(listCatalogVariantSlidesForEntity).mockResolvedValue([])
  })

  it('opens the displayed slide original when an earlier image has no hero', async () => {
    const user = userEvent.setup()
    const hero = 'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/bb/hero-b.webp'
    vi.mocked(listCatalogVariantSlidesForEntity).mockResolvedValue([
      { position: 0, mediaAssetId: 'a', canonicalUrl: 'https://cdn.example/a.jpg', heroUrl: null },
      { position: 1, mediaAssetId: 'b', canonicalUrl: 'https://cdn.example/b.jpg', heroUrl: hero },
    ])
    const view = renderPanel()
    const image = await waitFor(() => {
      const node = view.container.querySelector('img')
      expect(node).toHaveAttribute('src', hero)
      return node
    })
    await user.click(screen.getByRole('button', { name: 'View original' }))
    expect(image).toHaveAttribute('src', 'https://cdn.example/b.jpg')
  })

  it('uses the cover original when the gallery has no ready hero', async () => {
    const user = userEvent.setup()
    const hero = 'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/cc/hero-c.webp'
    vi.mocked(fetchExploreCatalogDetail).mockResolvedValue({
      ...detail,
      coverUrl: hero,
      canonicalCoverUrl: 'https://cdn.example/cover.jpg',
    })
    const view = renderPanel()
    const image = await waitFor(() => {
      const node = view.container.querySelector('img')
      expect(node).toHaveAttribute('src', hero)
      return node
    })
    await user.click(screen.getByRole('button', { name: 'View original' }))
    expect(image).toHaveAttribute('src', 'https://cdn.example/cover.jpg')
  })

  it('shows the placeholder when no ready hero or cover variant exists', async () => {
    vi.mocked(listCatalogVariantSlidesForEntity).mockResolvedValue([
      { position: 0, mediaAssetId: 'a', canonicalUrl: 'https://cdn.example/a.jpg', heroUrl: null },
    ])
    vi.mocked(fetchExploreCatalogDetail).mockResolvedValue({
      ...detail,
      coverUrl: null,
      canonicalCoverUrl: 'https://cdn.example/a.jpg',
    })
    const view = renderPanel()
    await screen.findByRole('heading', { level: 1, name: 'Gubbio' })
    await waitFor(() => {
      expect(listCatalogVariantSlidesForEntity).toHaveBeenCalled()
      expect(view.container.querySelector('img')).toBeNull()
    })
    expect(screen.queryByRole('button', { name: 'View original' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'View original' })).toBeNull()
    expect(view.container.innerHTML).not.toContain('/render/image/')
    expect(view.container.innerHTML).not.toContain('cdn.example/a.jpg')
  })

  it('moves to the next ready hero and opens that slide original', async () => {
    const user = userEvent.setup()
    const heroA = 'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/aa/hero-a.webp'
    const heroB = 'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/bb/hero-b.webp'
    vi.mocked(listCatalogVariantSlidesForEntity).mockResolvedValue([
      { position: 0, mediaAssetId: 'a', canonicalUrl: 'https://cdn.example/a.jpg', heroUrl: heroA },
      { position: 1, mediaAssetId: 'b', canonicalUrl: 'https://cdn.example/skipped.jpg', heroUrl: null },
      { position: 2, mediaAssetId: 'c', canonicalUrl: 'https://cdn.example/c.jpg', heroUrl: heroB },
    ])
    const view = renderPanel()
    const image = await waitFor(() => {
      const node = view.container.querySelector('img')
      expect(node).toHaveAttribute('src', heroA)
      return node
    })
    await user.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(image).toHaveAttribute('src', heroB)
    await user.click(screen.getByRole('button', { name: 'View original' }))
    expect(image).toHaveAttribute('src', 'https://cdn.example/c.jpg')
    expect(view.container.innerHTML).not.toContain('/render/image/')
  })
})
