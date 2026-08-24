import { describe, expect, it } from 'vitest'
import {
  getAdminSurfacePolicy,
  isAdminSurfaceVisible,
  isDeferredFamilySurface,
  type AdminSurfaceId,
} from './adminSurfaces'

const familyOpts = { supabasePlane: true, mcpEnabled: true, devMode: true }
const nestOpts = { supabasePlane: false, mcpEnabled: false, devMode: false }

describe('Admin surface registry', () => {
  it('shows only active or planned Family surfaces', () => {
    const visible: AdminSurfaceId[] = ['users', 'defaults', 'config', 'settings', 'features', 'notifications', 'export', 'audit']
    const hidden: AdminSurfaceId[] = [
      'addons',
      'plugins',
      'mcp-tokens',
      'github',
      'backup',
      'dev-notifications',
    ]

    for (const id of visible) expect(isAdminSurfaceVisible(id, familyOpts), id).toBe(true)
    for (const id of hidden) expect(isAdminSurfaceVisible(id, familyOpts), id).toBe(false)
  })

  it('keeps Nest surfaces and applies MCP/dev gates', () => {
    expect(isAdminSurfaceVisible('addons', nestOpts)).toBe(true)
    expect(isAdminSurfaceVisible('audit', nestOpts)).toBe(true)
    expect(isAdminSurfaceVisible('mcp-tokens', nestOpts)).toBe(false)
    expect(isAdminSurfaceVisible('dev-notifications', nestOpts)).toBe(false)
    expect(isAdminSurfaceVisible('mcp-tokens', { ...nestOpts, mcpEnabled: true })).toBe(true)
    expect(isAdminSurfaceVisible('dev-notifications', { ...nestOpts, devMode: true })).toBe(true)
  })

  it('classifies Family placeholders and platform operations explicitly', () => {
    expect(isDeferredFamilySurface('defaults', true)).toBe(false)
    expect(getAdminSurfacePolicy('defaults')).toMatchObject({
      controlPlane: 'family_administration',
      familyState: 'active',
    })
    expect(isDeferredFamilySurface('config', true)).toBe(false)
    expect(isDeferredFamilySurface('users', true)).toBe(false)
    expect(isDeferredFamilySurface('audit', true)).toBe(false)
    expect(isDeferredFamilySurface('notifications', true)).toBe(false)
    expect(isDeferredFamilySurface('settings', true)).toBe(false)
    expect(getAdminSurfacePolicy('settings')).toMatchObject({
      controlPlane: 'family_administration',
      familyState: 'active',
    })
    expect(getAdminSurfacePolicy('notifications')).toMatchObject({
      controlPlane: 'family_administration',
      familyState: 'active',
    })
    expect(getAdminSurfacePolicy('features')).toMatchObject({
      controlPlane: 'family_administration',
      familyState: 'active',
    })
    expect(getAdminSurfacePolicy('export')).toMatchObject({
      controlPlane: 'family_administration',
      familyState: 'active',
    })
    expect(getAdminSurfacePolicy('config')).toMatchObject({
      controlPlane: 'family_administration',
      familyState: 'active',
    })
    expect(getAdminSurfacePolicy('audit')).toMatchObject({
      controlPlane: 'family_administration',
      familyState: 'active',
    })
    expect(getAdminSurfacePolicy('backup')).toMatchObject({
      controlPlane: 'platform_operations',
      familyState: 'hidden',
    })
    expect(getAdminSurfacePolicy('plugins')).toMatchObject({
      controlPlane: 'excluded',
      familyState: 'hidden',
    })
  })
})
