import { describe, expect, it } from 'vitest'
import en from '@trek/shared/i18n/en'
import es from '@trek/shared/i18n/es'
import {
  canEditPublished,
  canStageDraft,
  canUseDraftableEditors,
  failedResolveCodes,
  resolveWorkspaceWriteMode,
  writeModeForCapability,
} from './workspaceGovernanceModel'

describe('resolveWorkspaceWriteMode', () => {
  it('keeps HOF published writes direct', () => {
    expect(resolveWorkspaceWriteMode({ layer: 'published', canMutate: true, canDraft: true })).toBe('direct')
  })

  it('stages on My Draft when the actor may draft', () => {
    expect(resolveWorkspaceWriteMode({ layer: 'myDraft', canMutate: false, canDraft: true })).toBe('draft')
    expect(resolveWorkspaceWriteMode({ layer: 'myDraft', canMutate: true, canDraft: true })).toBe('draft')
  })

  it('nudges eligible non-HOF viewers to My Draft', () => {
    expect(resolveWorkspaceWriteMode({ layer: 'published', canMutate: false, canDraft: true })).toBe('nudge')
  })

  it('denies guests who cannot draft', () => {
    expect(resolveWorkspaceWriteMode({ layer: 'published', canMutate: false, canDraft: false })).toBe('deny')
    expect(resolveWorkspaceWriteMode({ layer: 'myDraft', canMutate: false, canDraft: false })).toBe('deny')
  })
})

describe('layer helpers', () => {
  it('derives published vs draft editor chrome', () => {
    expect(canEditPublished({ layer: 'published', canMutate: true })).toBe(true)
    expect(canEditPublished({ layer: 'myDraft', canMutate: true })).toBe(false)
    expect(canStageDraft({ layer: 'myDraft', canDraft: true })).toBe(true)
    expect(canStageDraft({ layer: 'published', canDraft: true })).toBe(false)
    expect(canUseDraftableEditors('direct')).toBe(true)
    expect(canUseDraftableEditors('draft')).toBe(true)
    expect(canUseDraftableEditors('nudge')).toBe(false)
  })

  it('collects fail-closed apply codes', () => {
    expect(failedResolveCodes([
      { status: 'applied' },
      { status: 'rejected', errorCode: 'apply_failed' },
      { status: 'rejected', errorCode: 'unsupported_schema_version' },
    ])).toEqual(['apply_failed', 'unsupported_schema_version'])
  })
})

describe('writeModeForCapability', () => {
  it('keeps HOF published writes direct', () => {
    expect(writeModeForCapability({
      layer: 'published', outcome: 'direct', key: 'trip.places.manage', isHof: true,
    })).toBe('direct')
  })

  it('nudges travelers on published Phase 1A modules', () => {
    expect(writeModeForCapability({
      layer: 'published', outcome: 'propose', key: 'trip.places.manage', isHof: false,
    })).toBe('nudge')
  })

  it('does not stage packing even if propose is later granted', () => {
    expect(writeModeForCapability({
      layer: 'myDraft', outcome: 'propose', key: 'trip.packing.manage', isHof: false,
    })).toBe('deny')
  })

  it('allows HOF voluntary draft on Phase 1A modules', () => {
    expect(writeModeForCapability({
      layer: 'myDraft', outcome: 'direct', key: 'trip.schedule.manage', isHof: true,
    })).toBe('draft')
  })
})

describe('trip.governance copy', () => {
  it('keeps every English key translated in Spanish with matching placeholders', () => {
    const keys = Object.keys(en).filter(k => k.startsWith('trip.governance.'))
    expect(keys.length).toBeGreaterThan(40)
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
