import { describe, expect, it } from 'vitest'
import { FAMILY_PLANE_NAV_TABS, visibleFamilyPlaneNavTabs } from './familyPlaneNav'

describe('FAMILY_PLANE_NAV_TABS', () => {
  it('includes Vacay and Collections Bookmark tabs', () => {
    expect(FAMILY_PLANE_NAV_TABS.map(t => t.id)).toEqual(['vacay', 'collections'])
    const collections = FAMILY_PLANE_NAV_TABS.find(t => t.id === 'collections')
    expect(collections?.path).toBe('/collections')
    expect(collections?.labelKey).toBe('admin.addons.catalog.collections.name')
  })

  it('hides gated tabs when the family feature is off', () => {
    expect(visibleFamilyPlaneNavTabs(() => true).map(t => t.id)).toEqual(['vacay', 'collections'])
    expect(visibleFamilyPlaneNavTabs(key => key !== 'vacay').map(t => t.id)).toEqual(['collections'])
    expect(visibleFamilyPlaneNavTabs(() => false)).toEqual([])
  })
})
