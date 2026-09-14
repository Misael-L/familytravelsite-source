import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../../tests/helpers/render'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { useAuthStore } from '../../store/authStore'
import { buildUser } from '../../../tests/helpers/factories'
import { ToastContainer } from '../../components/shared/Toast'
import FamilyPlaceCategoryManager from './FamilyPlaceCategoryManager'

const { listCategories, upsertCategory, deleteCategory } = vi.hoisted(() => ({
  listCategories: vi.fn(),
  upsertCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))

vi.mock('../../data/supabase/familyPlaceCategories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyPlaceCategories')>()
  return {
    ...actual,
    listFamilyPlaceCategories: listCategories,
    upsertFamilyPlaceCategory: upsertCategory,
    deleteFamilyPlaceCategory: deleteCategory,
  }
})

const food = {
  id: 'cat-1',
  familyId: 'fam-1',
  name: 'Food',
  colorHex: '#10b981',
  iconKey: 'Utensils',
  sortOrder: 0,
}

beforeEach(() => {
  resetAllStores()
  listCategories.mockReset()
  upsertCategory.mockReset()
  deleteCategory.mockReset()
  listCategories.mockResolvedValue({ familyId: 'fam-1', canManage: true, categories: [] })
  upsertCategory.mockResolvedValue({
    id: 'cat-new',
    familyId: 'fam-1',
    name: 'Stay',
    colorHex: '#6366f1',
    iconKey: 'MapPin',
    sortOrder: 0,
  })
  seedStore(useAuthStore, {
    isAuthenticated: true,
    user: buildUser({ username: 'mom', role: 'user' }),
    familyId: 'fam-1',
    authUserId: 'auth-1',
    membershipRole: 'parent',
    isSuperAdmin: false,
    membershipLoaded: true,
  })
})

describe('FamilyPlaceCategoryManager', () => {
  it('shows empty state and creates a category without Nest calls', async () => {
    render(<><ToastContainer /><FamilyPlaceCategoryManager /></>)
    await screen.findByText('No categories yet')
    fireEvent.click(screen.getByRole('button', { name: /new category/i }))
    fireEvent.change(screen.getByPlaceholderText('Category name'), {
      target: { value: 'Stay' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => {
      expect(upsertCategory).toHaveBeenCalledWith('fam-1', null, {
        name: 'Stay',
        colorHex: '#6366f1',
        iconKey: 'MapPin',
      })
    })
    await screen.findByText('Category created')
  })

  it('edits color/icon and keeps the draft on save failure', async () => {
    listCategories.mockResolvedValue({ familyId: 'fam-1', canManage: true, categories: [food] })
    upsertCategory.mockRejectedValueOnce(new Error('save failed'))
    render(<><ToastContainer /><FamilyPlaceCategoryManager /></>)
    await screen.findByText('Food')
    fireEvent.click(screen.getByRole('button', { name: /edit category/i }))
    const nameInput = await screen.findByDisplayValue('Food')
    fireEvent.change(nameInput, { target: { value: 'Dining' } })
    fireEvent.click(screen.getByRole('button', { name: /^update$/i }))
    await screen.findByText('save failed')
    expect(screen.getByDisplayValue('Dining')).toBeInTheDocument()
    expect(upsertCategory).toHaveBeenCalledWith('fam-1', 'cat-1', {
      name: 'Dining',
      colorHex: '#10b981',
      iconKey: 'Utensils',
    })
  })

  it('confirms deletion and hides write chrome when read-only', async () => {
    listCategories.mockResolvedValue({ familyId: 'fam-1', canManage: true, categories: [food] })
    deleteCategory.mockResolvedValue(undefined)
    const { unmount } = render(<><ToastContainer /><FamilyPlaceCategoryManager /></>)
    await screen.findByText('Food')
    fireEvent.click(screen.getByRole('button', { name: /delete category/i }))
    expect(screen.getByText(/Delete place category/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() => {
      expect(deleteCategory).toHaveBeenCalledWith('fam-1', 'cat-1')
    })
    unmount()

    listCategories.mockResolvedValue({ familyId: 'fam-1', canManage: false, categories: [food] })
    render(<FamilyPlaceCategoryManager />)
    await screen.findByText('Food')
    expect(screen.getByText('View only')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new category/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit category/i })).not.toBeInTheDocument()
  })
})
