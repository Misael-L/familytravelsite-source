import { describe, expect, it } from 'vitest'
import {
  compiledFeatureMap,
  isFamilyFeatureKey,
  isMissingFeatureRpc,
  resolveEffectiveFeature,
} from './familyFeatures'

describe('family feature resolver', () => {
  it('keeps compiled defaults on for every pilot key', () => {
    expect(compiledFeatureMap()).toEqual({
      vacay: true,
      collections: true,
      'workspace.place_categories': true,
    })
    expect(isFamilyFeatureKey('vacay')).toBe(true)
    expect(isFamilyFeatureKey('addons')).toBe(false)
  })

  it('applies global disabled, preview, enabled, and inherit precedence', () => {
    expect(resolveEffectiveFeature(true, 'disabled', true)).toBe(false)
    expect(resolveEffectiveFeature(true, 'preview', true)).toBe(true)
    expect(resolveEffectiveFeature(true, 'preview', false)).toBe(false)
    expect(resolveEffectiveFeature(true, 'preview', null)).toBe(false)
    expect(resolveEffectiveFeature(true, 'enabled', false)).toBe(false)
    expect(resolveEffectiveFeature(true, 'enabled', true)).toBe(true)
    expect(resolveEffectiveFeature(true, 'enabled', null)).toBe(true)
    expect(resolveEffectiveFeature(false, 'enabled', null)).toBe(false)
    expect(resolveEffectiveFeature(true, null, null)).toBe(true)
  })

  it('treats missing RPCs as schema-lag, not a hard failure', () => {
    expect(isMissingFeatureRpc({ code: 'PGRST202', message: 'Could not find the function' })).toBe(true)
    expect(isMissingFeatureRpc({ code: '42501', message: 'not authorized' })).toBe(false)
  })
})
