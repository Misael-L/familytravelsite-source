import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../../tests/helpers/render'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { useAuthStore } from '../../store/authStore'
import { buildUser } from '../../../tests/helpers/factories'
import { ToastContainer } from '../../components/shared/Toast'
import FamilyPackingTemplateManager from './FamilyPackingTemplateManager'

const { listTemplates, upsertTemplate, deleteTemplate } = vi.hoisted(() => ({
  listTemplates: vi.fn(),
  upsertTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}))

vi.mock('../../data/supabase/familyPackingTemplates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyPackingTemplates')>()
  return {
    ...actual,
    listFamilyPackingTemplates: listTemplates,
    upsertFamilyPackingTemplate: upsertTemplate,
    deleteFamilyPackingTemplate: deleteTemplate,
  }
})

const beach = {
  id: 'tmpl-1',
  familyId: 'fam-1',
  name: 'Beach',
  items: [
    { id: 'item-1', name: 'Towel', category: 'Beach', quantity: 1, weightGrams: 400, sortOrder: 0 },
  ],
}

beforeEach(() => {
  resetAllStores()
  listTemplates.mockReset()
  upsertTemplate.mockReset()
  deleteTemplate.mockReset()
  listTemplates.mockResolvedValue({ familyId: 'fam-1', canManage: true, templates: [] })
  upsertTemplate.mockResolvedValue({
    id: 'tmpl-new',
    familyId: 'fam-1',
    name: 'City',
    items: [],
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

describe('FamilyPackingTemplateManager', () => {
  it('shows empty state and creates a template without Nest calls', async () => {
    render(<><ToastContainer /><FamilyPackingTemplateManager /></>)
    await screen.findByText('No templates created yet')
    fireEvent.click(screen.getByRole('button', { name: /new template/i }))
    fireEvent.change(screen.getByPlaceholderText('Template name (e.g. Beach Holiday)'), {
      target: { value: 'City' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText('Template name (e.g. Beach Holiday)'), { key: 'Enter' })
    await waitFor(() => {
      expect(upsertTemplate).toHaveBeenCalledWith('fam-1', null, 'City', [])
    })
    await screen.findByText('Template created')
  })

  it('saves grouped item edits transactionally and keeps them on failure', async () => {
    listTemplates.mockResolvedValue({ familyId: 'fam-1', canManage: true, templates: [beach] })
    upsertTemplate.mockRejectedValueOnce(new Error('save failed'))
    render(<><ToastContainer /><FamilyPackingTemplateManager /></>)
    await screen.findByDisplayValue('Beach')
    fireEvent.click(screen.getByRole('button', { name: 'Beach' }))
    const nameInput = await screen.findByDisplayValue('Towel')
    fireEvent.change(nameInput, { target: { value: 'Beach towel' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await screen.findByText('save failed')
    expect(screen.getByDisplayValue('Beach towel')).toBeInTheDocument()
    expect(upsertTemplate).toHaveBeenCalledWith('fam-1', 'tmpl-1', 'Beach', [
      { name: 'Beach towel', category: 'Beach', quantity: 1, weightGrams: 400 },
    ])
  })

  it('confirms deletion and hides write chrome when read-only', async () => {
    listTemplates.mockResolvedValue({ familyId: 'fam-1', canManage: true, templates: [beach] })
    deleteTemplate.mockResolvedValue(undefined)
    const { unmount } = render(<><ToastContainer /><FamilyPackingTemplateManager /></>)
    await screen.findByDisplayValue('Beach')
    fireEvent.click(screen.getByRole('button', { name: /delete template/i }))
    expect(screen.getByText(/Delete packing template/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() => {
      expect(deleteTemplate).toHaveBeenCalledWith('fam-1', 'tmpl-1')
    })
    unmount()

    listTemplates.mockResolvedValue({ familyId: 'fam-1', canManage: false, templates: [beach] })
    render(<FamilyPackingTemplateManager />)
    await screen.findByText('Beach')
    expect(screen.getByText('View only')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new template/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
  })
})
