import { Bookmark, CalendarDays, Compass } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FamilyFeatureKey } from '../../data/supabase/familyFeatures'

export type FamilyPlaneNavTab = {
  id: string
  path: string
  labelKey: string
  Icon: LucideIcon
  featureKey: FamilyFeatureKey
}

/** Product tabs on the Family (supabase) plane. Not Nest addons. */
export const FAMILY_PLANE_NAV_TABS: readonly FamilyPlaneNavTab[] = [
  { id: 'vacay', path: '/vacay', labelKey: 'admin.addons.catalog.vacay.name', Icon: CalendarDays, featureKey: 'vacay' },
  { id: 'collections', path: '/collections', labelKey: 'admin.addons.catalog.collections.name', Icon: Bookmark, featureKey: 'collections' },
  { id: 'journey', path: '/journey', labelKey: 'admin.addons.catalog.journey.name', Icon: Compass, featureKey: 'journey' },
]

export function visibleFamilyPlaneNavTabs(
  isEnabled: (key: FamilyFeatureKey) => boolean,
): FamilyPlaneNavTab[] {
  return FAMILY_PLANE_NAV_TABS.filter(tab => isEnabled(tab.featureKey))
}
