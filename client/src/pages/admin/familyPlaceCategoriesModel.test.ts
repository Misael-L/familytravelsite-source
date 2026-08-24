import { describe, expect, it } from 'vitest'
import en from '@trek/shared/i18n/en'
import es from '@trek/shared/i18n/es'
import { CATEGORY_ICON_MAP } from '../../components/shared/categoryIcons'
import type { FamilyPlaceCategory } from '../../data/supabase/familyPlaceCategories'
import {
  DEFAULT_PLACE_CATEGORY_COLOR,
  DEFAULT_PLACE_CATEGORY_ICON,
  emptyPlaceCategoryForm,
  formFromCategory,
  isAllowedPlaceCategoryIcon,
  isPresetPlaceCategoryColor,
  PLACE_CATEGORY_ICON_KEYS,
  PLACE_CATEGORY_PRESET_COLORS,
} from './familyPlaceCategoriesModel'

const food: FamilyPlaceCategory = {
  id: 'cat-1',
  familyId: 'fam-1',
  name: 'Food',
  colorHex: '#10b981',
  iconKey: 'Utensils',
  sortOrder: 0,
}

describe('familyPlaceCategoriesModel', () => {
  it('freezes TREK icon keys and preset colors', () => {
    expect(PLACE_CATEGORY_ICON_KEYS).toEqual(Object.keys(CATEGORY_ICON_MAP))
    expect(PLACE_CATEGORY_ICON_KEYS).toHaveLength(47)
    expect(PLACE_CATEGORY_PRESET_COLORS).toContain('#6366f1')
    expect(isAllowedPlaceCategoryIcon('MapPin')).toBe(true)
    expect(isAllowedPlaceCategoryIcon('not-an-icon')).toBe(false)
    expect(isPresetPlaceCategoryColor('#10b981')).toBe(true)
    expect(isPresetPlaceCategoryColor('#abcdef')).toBe(false)
  })

  it('builds create and edit forms without Nest numeric ids', () => {
    expect(emptyPlaceCategoryForm()).toEqual({
      name: '',
      color: DEFAULT_PLACE_CATEGORY_COLOR,
      icon: DEFAULT_PLACE_CATEGORY_ICON,
    })
    expect(formFromCategory(food)).toEqual({
      name: 'Food',
      color: '#10b981',
      icon: 'Utensils',
    })
    expect(formFromCategory({ ...food, iconKey: 'bogus' }).icon).toBe(DEFAULT_PLACE_CATEGORY_ICON)
  })
})

describe('admin.placeCategories copy', () => {
  it('keeps English keys translated in Spanish with matching placeholders', () => {
    const keys = Object.keys(en).filter(k => k.startsWith('admin.placeCategories.'))
    expect(keys.length).toBeGreaterThan(4)
    const placeholder = /\{[a-zA-Z0-9_]+\}/g
    for (const key of keys) {
      const english = en[key]
      const spanish = es[key]
      expect(typeof spanish, key).toBe('string')
      expect(String(spanish).length, key).toBeGreaterThan(0)
      if (typeof english !== 'string' || typeof spanish !== 'string') continue
      const placeholders = english.match(placeholder) ?? []
      for (const token of new Set(placeholders)) {
        expect(spanish, key).toContain(token)
      }
    }
  })
})
