import React from 'react'
import { render, screen, waitFor } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastContainer } from '../shared/Toast'
import { useAuthStore } from '../../store/authStore'
import { useSaveToCollectionStore } from '../../store/saveToCollectionStore'
import { seedStore, resetAllStores } from '../../../tests/helpers/store'
import { buildUser } from '../../../tests/helpers/factories'
import { collectionsApi } from '../../api/collections'
import { useAddonStore } from '../../store/addonStore'
import {
  addFamilyListItem,
  listFamilyListMembership,
  listFamilyLists,
  removeFamilyListItem,
  type FamilyListRow,
} from '../../data/supabase/familyLists'

vi.mock('../../api/collections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/collections')>()
  return {
    ...actual,
    collectionsApi: {
      list: vi.fn(),
      membership: vi.fn(),
      savePlace: vi.fn(),
      deletePlace: vi.fn(),
    },
  }
})

vi.mock('../../data/supabase/familyLists', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyLists')>()
  return {
    ...actual,
    listFamilyLists: vi.fn(),
    listFamilyListMembership: vi.fn(),
    addFamilyListItem: vi.fn(),
    removeFamilyListItem: vi.fn(),
  }
})

import SaveToCollectionModal from './SaveToCollectionModal'

const familyRow: FamilyListRow = {
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
}

function renderModal() {
  return render(
    <>
      <ToastContainer />
      <SaveToCollectionModal />
    </>,
  )
}

describe('SaveToCollectionModal', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
    useSaveToCollectionStore.setState({ target: null, version: 0 })
    vi.stubEnv('VITE_DATA_PLANE', 'supabase')
    seedStore(useAuthStore, {
      isAuthenticated: true,
      user: buildUser(),
      familyId: 'fam-1',
      personId: 'p1',
    })
    vi.mocked(listFamilyLists).mockResolvedValue([familyRow])
    vi.mocked(listFamilyListMembership).mockResolvedValue([])
    vi.mocked(addFamilyListItem).mockResolvedValue('item-9')
    vi.mocked(removeFamilyListItem).mockResolvedValue(undefined)
    vi.mocked(collectionsApi.list).mockResolvedValue({ collections: [], incomingInvites: [] })
    vi.mocked(collectionsApi.membership).mockResolvedValue({ saved: false, lists: [] })
  })

  it('Family catalog toggle uses list RPCs and does not call collectionsApi', async () => {
    const user = userEvent.setup()
    useSaveToCollectionStore.getState().open({
      name: 'Gubbio',
      catalog_kind: 'place',
      catalog_entity_id: 'pl-1',
    })
    renderModal()
    await screen.findByRole('button', { name: /eats/i })
    await user.click(screen.getByRole('button', { name: /eats/i }))
    await waitFor(() => {
      expect(addFamilyListItem).toHaveBeenCalledWith({
        listId: 'list-1',
        kind: 'place',
        entityId: 'pl-1',
        status: 'idea',
      })
    })
    expect(collectionsApi.list).not.toHaveBeenCalled()
    expect(collectionsApi.membership).not.toHaveBeenCalled()
    expect(collectionsApi.savePlace).not.toHaveBeenCalled()
    expect(collectionsApi.deletePlace).not.toHaveBeenCalled()
    expect(await screen.findByText(/added to eats/i)).toBeInTheDocument()
  })

  it('Family catalog toggle off removes the list item', async () => {
    const user = userEvent.setup()
    vi.mocked(listFamilyListMembership).mockResolvedValue([
      { listId: 'list-1', itemId: 'item-1' },
    ])
    useSaveToCollectionStore.getState().open({
      name: 'Gubbio',
      catalog_kind: 'place',
      catalog_entity_id: 'pl-1',
    })
    renderModal()
    await screen.findByRole('button', { name: /eats/i })
    await user.click(screen.getByRole('button', { name: /eats/i }))
    await waitFor(() => {
      expect(removeFamilyListItem).toHaveBeenCalledWith('item-1')
    })
    expect(addFamilyListItem).not.toHaveBeenCalled()
    expect(collectionsApi.deletePlace).not.toHaveBeenCalled()
  })

  it('toasts already on this list from the Family RPC', async () => {
    const user = userEvent.setup()
    vi.mocked(addFamilyListItem).mockRejectedValue({ message: 'already on this list' })
    useSaveToCollectionStore.getState().open({
      name: 'Gubbio',
      catalog_kind: 'hotel',
      catalog_entity_id: 'h-1',
    })
    renderModal()
    await screen.findByRole('button', { name: /eats/i })
    await user.click(screen.getByRole('button', { name: /eats/i }))
    expect(await screen.findByText(/already on this list/i)).toBeInTheDocument()
  })

  it('Nest google membership path skips Family RPCs', async () => {
    const user = userEvent.setup()
    vi.stubEnv('VITE_DATA_PLANE', 'nest')
    seedStore(useAddonStore, {
      addons: [{ id: 'collections', name: 'Collections', type: 'global', icon: 'Bookmark', enabled: true }],
    })
    vi.mocked(collectionsApi.list).mockResolvedValue({
      collections: [{
        id: 7,
        owner_id: 1,
        name: 'Paris list',
        is_owner: true,
      }],
      incomingInvites: [],
    })
    vi.mocked(collectionsApi.membership).mockResolvedValue({ saved: false, lists: [] })
    vi.mocked(collectionsApi.savePlace).mockResolvedValue({ place: { id: 99 } } as never)
    useSaveToCollectionStore.getState().open({
      name: 'Eiffel Tower',
      google_place_id: 'ChIJxx',
    })
    renderModal()
    await screen.findByRole('button', { name: /paris list/i })
    await user.click(screen.getByRole('button', { name: /paris list/i }))
    await waitFor(() => {
      expect(collectionsApi.savePlace).toHaveBeenCalled()
    })
    expect(listFamilyLists).not.toHaveBeenCalled()
    expect(listFamilyListMembership).not.toHaveBeenCalled()
    expect(addFamilyListItem).not.toHaveBeenCalled()
  })

  it('empty Family library still offers a path to Collections', async () => {
    vi.mocked(listFamilyLists).mockResolvedValue([])
    useSaveToCollectionStore.getState().open({
      name: 'Gubbio',
      catalog_kind: 'place',
      catalog_entity_id: 'pl-1',
    })
    renderModal()
    expect(await screen.findByText(/create a list first/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new list/i })).toBeInTheDocument()
    expect(collectionsApi.list).not.toHaveBeenCalled()
  })
})
