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

  it('starts default-on for pilot keys and keeps Journey off after a failed hydrate', async () => {
    expect(useFamilyFeatureStore.getState().isEnabled('vacay')).toBe(true)
    expect(useFamilyFeatureStore.getState().isEnabled('journey')).toBe(false)
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
      journey: false,
    })
    await useFamilyFeatureStore.getState().hydrate('fam-1')
    expect(useFamilyFeatureStore.getState().isEnabled('vacay')).toBe(false)
    expect(useFamilyFeatureStore.getState().isEnabled('collections')).toBe(true)
    expect(useFamilyFeatureStore.getState().isEnabled('workspace.place_categories')).toBe(false)
    expect(useFamilyFeatureStore.getState().isEnabled('journey')).toBe(false)
  })

  it('ignores a late hydrate from a previous family', async () => {
    let finishFirst: ((value: Record<string, boolean>) => void) | undefined
    getEffective
      .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
      .mockResolvedValueOnce({
        vacay: false,
        collections: true,
        'workspace.place_categories': true,
        journey: false,
      })
    const first = useFamilyFeatureStore.getState().hydrate('fam-1')
    const second = useFamilyFeatureStore.getState().hydrate('fam-2')
    finishFirst?.({
      vacay: true,
      collections: true,
      'workspace.place_categories': true,
      journey: true,
    })
    await Promise.all([first, second])
    expect(useFamilyFeatureStore.getState().familyId).toBe('fam-2')
    expect(useFamilyFeatureStore.getState().isEnabled('vacay')).toBe(false)
    expect(useFamilyFeatureStore.getState().error).toBeNull()
  })
})
