import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  deleteFamilyPackingTemplate,
  listFamilyPackingTemplates,
  upsertFamilyPackingTemplate,
} from './familyPackingTemplates'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('familyPackingTemplates adapters', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseBrowserClient).mockReset()
  })

  it('throws when list_family_packing_templates errors', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    } as never)
    await expect(listFamilyPackingTemplates('fam-1')).rejects.toMatchObject({ message: 'boom' })
  })

  it('maps nested template items and can_manage', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        family_id: 'fam-1',
        can_manage: true,
        templates: [{
          id: 'tmpl-1',
          family_id: 'fam-1',
          name: 'Beach',
          items: [{
            id: 'item-1',
            name: 'Towel',
            category: 'Beach',
            quantity: 2,
            weight_grams: 400,
            sort_order: 0,
          }],
        }],
      },
      error: null,
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    const result = await listFamilyPackingTemplates('fam-1')
    expect(result.canManage).toBe(true)
    expect(result.templates[0]).toMatchObject({
      id: 'tmpl-1',
      name: 'Beach',
      items: [{ name: 'Towel', category: 'Beach', quantity: 2, weightGrams: 400 }],
    })
    expect(rpc).toHaveBeenCalledWith('list_family_packing_templates', { p_family_id: 'fam-1' })
  })

  it('sends snake_case items on upsert and throws on error', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        template: { id: 'tmpl-1', family_id: 'fam-1', name: 'Beach', items: [] },
      },
      error: null,
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    await upsertFamilyPackingTemplate('fam-1', 'tmpl-1', 'Beach', [{
      name: 'Towel',
      category: 'Beach',
      quantity: 2,
      weightGrams: 400,
    }])
    expect(rpc).toHaveBeenCalledWith('upsert_family_packing_template', {
      p_family_id: 'fam-1',
      p_template_id: 'tmpl-1',
      p_name: 'Beach',
      p_items: [{
        name: 'Towel',
        category: 'Beach',
        quantity: 2,
        weight_grams: 400,
      }],
    })

    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } }),
    } as never)
    await expect(deleteFamilyPackingTemplate('fam-1', 'tmpl-1')).rejects.toMatchObject({ message: 'denied' })
  })
})
