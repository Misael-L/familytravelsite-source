import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compiledFeatureMap } from '../data/supabase/familyFeatures'
import { useFamilyFeatureStore } from './familyFeatureStore'

const getEffective = vi.hoisted(() => vi.fn())

vi.mock('../data/supabase/familyFeatures', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyFeatures')>()
  return { ...actual, getMyEffectiveFeatures: getEffective }
})

describe('familyFeatureStore', () => {
  beforeEach(() => {
    getEffective.mockReset()
    useFamilyFeatureStore.getState().reset()
  })

  it('starts default-on and stays on after a failed hydrate', async () => {
    expect(useFamilyFeatureStore.getState().isEnabled('vacay')).toBe(true)
    getEffective.mockRejectedValue(new Error('network'))
    await useFamilyFeatureStore.getState().hydrate('fam-1')
    expect(useFamilyFeatureStore.getState().features).toEqual(compiledFeatureMap())
    expect(useFamilyFeatureStore.getState().hydrated).toBe(true)
    expect(useFamilyFeatureStore.getState().error).toBe('network')
  })

  it('applies RPC flags after a successful hydrate', async () => {
    getEffective.mockResolvedValue({
      vacay: false,
      collections: true,
      'workspace.place_categories': false,
    })
    await useFamilyFeatureStore.getState().hydrate('fam-1')
    expect(useFamilyFeatureStore.getState().isEnabled('vacay')).toBe(false)
    expect(useFamilyFeatureStore.getState().isEnabled('collections')).toBe(true)
    expect(useFamilyFeatureStore.getState().isEnabled('workspace.place_categories')).toBe(false)
  })
})
