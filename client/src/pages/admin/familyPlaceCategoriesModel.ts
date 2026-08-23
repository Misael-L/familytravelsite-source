import { CATEGORY_ICON_MAP } from '../../components/shared/categoryIcons'
import type { FamilyPlaceCategory } from '../../data/supabase/familyPlaceCategories'

export const PLACE_CATEGORY_PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#84cc16',
  '#6b7280', '#1f2937',
] as const

export const PLACE_CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICON_MAP)

export const DEFAULT_PLACE_CATEGORY_COLOR = '#6366f1'
export const DEFAULT_PLACE_CATEGORY_ICON = 'MapPin'

export type PlaceCategoryForm = {
  name: string
  color: string
  icon: string
}

export function emptyPlaceCategoryForm(): PlaceCategoryForm {
  return {
    name: '',
    color: DEFAULT_PLACE_CATEGORY_COLOR,
    icon: DEFAULT_PLACE_CATEGORY_ICON,
  }
}

export function formFromCategory(category: FamilyPlaceCategory): PlaceCategoryForm {
  return {
    name: category.name,
    color: category.colorHex || DEFAULT_PLACE_CATEGORY_COLOR,
    icon: PLACE_CATEGORY_ICON_KEYS.includes(category.iconKey)
      ? category.iconKey
      : DEFAULT_PLACE_CATEGORY_ICON,
  }
}

export function isPresetPlaceCategoryColor(color: string): boolean {
  return (PLACE_CATEGORY_PRESET_COLORS as readonly string[]).includes(color.toLowerCase())
    || (PLACE_CATEGORY_PRESET_COLORS as readonly string[]).includes(color)
}

export function isAllowedPlaceCategoryIcon(icon: string): boolean {
  return PLACE_CATEGORY_ICON_KEYS.includes(icon)
}
