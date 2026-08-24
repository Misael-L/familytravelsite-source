import { describe, expect, it } from 'vitest'
import en from '@trek/shared/i18n/en'
import es from '@trek/shared/i18n/es'
import type { FamilyCapabilityPolicy } from '../../data/supabase/familyPermissions'
import {
  groupPolicies,
  parseScopeSelect,
  scopeSelectValue,
  summarizeAuditContext,
} from './familyPermissionsModel'

function policy(partial: Partial<FamilyCapabilityPolicy> & Pick<FamilyCapabilityPolicy, 'key' | 'group'>): FamilyCapabilityPolicy {
  return {
    context: 'trip',
    displayOrder: 1,
    configurable: true,
    defaultDirectScope: 'patriarch',
    defaultProposeScope: null,
    effectiveDirectScope: 'patriarch',
    effectiveProposeScope: null,
    allowedDirectScopes: ['patriarch'],
    allowedProposeScopes: [],
    isCustom: false,
    ...partial,
  }
}

describe('familyPermissionsModel', () => {
  it('groups known capability groups in frozen order', () => {
    const grouped = groupPolicies([
      policy({ key: 'trip.files.upload', group: 'files' }),
      policy({ key: 'family.members.manage', group: 'family' }),
      policy({ key: 'trip.places.manage', group: 'content' }),
    ])
    expect(grouped.map(g => g.group)).toEqual(['family', 'content', 'files'])
  })

  it('treats empty select as deny (null scope)', () => {
    expect(scopeSelectValue(null)).toBe('')
    expect(parseScopeSelect('')).toBeNull()
    expect(parseScopeSelect('trip_travelers')).toBe('trip_travelers')
    expect(parseScopeSelect('bogus')).toBeNull()
  })

  it('summarizes audit context without dumping full rows', () => {
    expect(summarizeAuditContext({ fields: ['archived_at', 'cover_url'] })).toBe('archived_at, cover_url')
    expect(summarizeAuditContext({ op: 'update', id: 'abc' })).toContain('op=update')
  })
})

describe('admin.permissions / familyAudit copy', () => {
  it('keeps English keys translated in Spanish with matching placeholders', () => {
    const keys = Object.keys(en).filter(k =>
      k.startsWith('admin.permissions.') || k.startsWith('admin.familyAudit.'),
    )
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
