import { describe, expect, it } from 'vitest'
import { FAMILY_PLANE_NAV_TABS, visibleFamilyPlaneNavTabs } from './familyPlaneNav'

describe('FAMILY_PLANE_NAV_TABS', () => {
  it('includes Vacay, Collections, and Journey tabs', () => {
    expect(FAMILY_PLANE_NAV_TABS.map(t => t.id)).toEqual(['vacay', 'collections', 'journey'])
    expect(FAMILY_PLANE_NAV_TABS.find(t => t.id === 'journey')?.path).toBe('/journey')
    expect(FAMILY_PLANE_NAV_TABS.find(t => t.id === 'journey')?.featureKey).toBe('journey')
    const collections = FAMILY_PLANE_NAV_TABS.find(t => t.id === 'collections')
    expect(collections?.path).toBe('/collections')
    expect(collections?.labelKey).toBe('admin.addons.catalog.collections.name')
  })

  it('hides gated tabs when the family feature is off', () => {
    expect(visibleFamilyPlaneNavTabs(() => true).map(t => t.id)).toEqual(['vacay', 'collections', 'journey'])
    expect(visibleFamilyPlaneNavTabs(key => key !== 'vacay').map(t => t.id)).toEqual(['collections', 'journey'])
    expect(visibleFamilyPlaneNavTabs(key => key === 'journey')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'journey' })]),
    )
    expect(visibleFamilyPlaneNavTabs(() => false)).toEqual([])
  })
})
