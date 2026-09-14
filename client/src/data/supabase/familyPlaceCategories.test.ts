import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  deleteFamilyPlaceCategory,
  listFamilyPlaceCategories,
  listMemberFamilyPlaceCategories,
  upsertFamilyPlaceCategory,
} from './familyPlaceCategories'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('familyPlaceCategories adapters', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseBrowserClient).mockReset()
  })

  it('throws when list_family_place_categories errors', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    } as never)
    await expect(listFamilyPlaceCategories('fam-1')).rejects.toMatchObject({ message: 'boom' })
  })

  it('maps palette rows and can_manage', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        family_id: 'fam-1',
        can_manage: true,
        categories: [{
          id: 'cat-1',
          family_id: 'fam-1',
          name: 'Food',
          color_hex: '#6366f1',
          icon_key: 'Utensils',
          sort_order: 0,
        }],
      },
      error: null,
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    const result = await listFamilyPlaceCategories('fam-1')
    expect(result.canManage).toBe(true)
    expect(result.categories[0]).toMatchObject({
      id: 'cat-1',
      name: 'Food',
      colorHex: '#6366f1',
      iconKey: 'Utensils',
      sortOrder: 0,
    })
    expect(rpc).toHaveBeenCalledWith('list_family_place_categories', { p_family_id: 'fam-1' })
  })

  it('sends snake_case fields on upsert and throws on delete error', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        category: {
          id: 'cat-1',
          family_id: 'fam-1',
          name: 'Food',
          color_hex: '#10b981',
          icon_key: 'Utensils',
          sort_order: 1,
        },
      },
      error: null,
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    await upsertFamilyPlaceCategory('fam-1', 'cat-1', {
      name: 'Food',
      colorHex: '#10b981',
      iconKey: 'Utensils',
      sortOrder: 1,
    })
    expect(rpc).toHaveBeenCalledWith('upsert_family_place_category', {
      p_family_id: 'fam-1',
      p_category_id: 'cat-1',
      p_name: 'Food',
      p_color_hex: '#10b981',
      p_icon_key: 'Utensils',
      p_sort_order: 1,
    })

    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } }),
    } as never)
    await expect(deleteFamilyPlaceCategory('fam-1', 'cat-1')).rejects.toMatchObject({ message: 'denied' })
  })

  it('reads the member palette through table SELECT, not the Admin list RPC', async () => {
    const orderName = vi.fn().mockResolvedValue({
      data: [{
        id: 'cat-1',
        family_id: 'fam-1',
        name: 'Food',
        color_hex: '#10b981',
        icon_key: 'Utensils',
        sort_order: 0,
      }],
      error: null,
    })
    const orderSort = vi.fn().mockReturnValue({ order: orderName })
    const eq = vi.fn().mockReturnValue({ order: orderSort })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const rpc = vi.fn()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ from, rpc } as never)
    const rows = await listMemberFamilyPlaceCategories('fam-1')
    expect(from).toHaveBeenCalledWith('family_place_categories')
    expect(rpc).not.toHaveBeenCalled()
    expect(rows[0]).toMatchObject({ id: 'cat-1', name: 'Food', iconKey: 'Utensils' })
  })

  it('throws when the member palette SELECT errors', async () => {
    const orderName = vi.fn().mockResolvedValue({ data: null, error: { message: 'rls' } })
    const orderSort = vi.fn().mockReturnValue({ order: orderName })
    const eq = vi.fn().mockReturnValue({ order: orderSort })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ from } as never)
    await expect(listMemberFamilyPlaceCategories('fam-1')).rejects.toMatchObject({ message: 'rls' })
  })
})
