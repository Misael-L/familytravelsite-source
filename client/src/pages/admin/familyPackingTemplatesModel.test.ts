import { describe, expect, it } from 'vitest'
import en from '@trek/shared/i18n/en'
import es from '@trek/shared/i18n/es'
import {
  documentToDraft,
  flattenDraft,
  groupItems,
  isDraftDirty,
  serializeDraft,
} from './familyPackingTemplatesModel'
import type { FamilyPackingTemplateDocument } from '../../data/supabase/familyPackingTemplates'

const doc: FamilyPackingTemplateDocument = {
  id: 'tmpl-1',
  familyId: 'fam-1',
  name: 'Beach',
  items: [
    { id: '1', name: 'Towel', category: 'Beach', quantity: 1, weightGrams: 400, sortOrder: 0 },
    { id: '2', name: 'Sunscreen', category: 'Beach', quantity: 1, weightGrams: null, sortOrder: 1 },
    { id: '3', name: 'Passport', category: 'Documents', quantity: 1, weightGrams: 50, sortOrder: 2 },
  ],
}

describe('familyPackingTemplatesModel', () => {
  it('groups items by first-seen category and flattens without empty groups', () => {
    const groups = groupItems(doc.items)
    expect(groups.map(g => g.name)).toEqual(['Beach', 'Documents'])
    expect(groups[0].items.map(i => i.name)).toEqual(['Towel', 'Sunscreen'])
    const draft = documentToDraft(doc)
    draft.groups.push({ clientKey: 'empty', name: 'Empty', items: [] })
    draft.groups[0].items.push({ clientKey: 'blank', id: null, name: '  ', quantity: 1, weightGrams: null })
    expect(flattenDraft(draft)).toEqual([
      { name: 'Towel', category: 'Beach', quantity: 1, weightGrams: 400 },
      { name: 'Sunscreen', category: 'Beach', quantity: 1, weightGrams: null },
      { name: 'Passport', category: 'Documents', quantity: 1, weightGrams: 50 },
    ])
  })

  it('treats quantity/weight/name edits as dirty and ignores empty groups', () => {
    const draft = documentToDraft(doc)
    expect(isDraftDirty(draft, doc)).toBe(false)
    draft.groups[0].items[0].quantity = 3
    expect(isDraftDirty(draft, doc)).toBe(true)
    expect(serializeDraft(draft)).toContain('"quantity":3')
  })
})

describe('admin.packingTemplates copy', () => {
  it('keeps English keys translated in Spanish with matching placeholders', () => {
    const keys = Object.keys(en).filter(k => k.startsWith('admin.packingTemplates.'))
    expect(keys.length).toBeGreaterThan(15)
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
