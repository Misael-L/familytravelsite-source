export type AdminSurfaceId =
  | 'users'
  | 'defaults'
  | 'config'
  | 'settings'
  | 'features'
  | 'addons'
  | 'plugins'
  | 'notifications'
  | 'mcp-tokens'
  | 'github'
  | 'backup'
  | 'export'
  | 'audit'
  | 'dev-notifications'

export type AdminControlPlane =
  | 'family_administration'
  | 'platform_operations'
  | 'excluded'

export type FamilySurfaceState = 'active' | 'deferred' | 'hidden'

export interface AdminSurfacePolicy {
  id: AdminSurfaceId
  controlPlane: AdminControlPlane
  familyState: FamilySurfaceState
}

/**
 * §28 executable surface registry. TREK still renders every applicable surface
 * on the Nest plane; Family only renders active/planned Supabase surfaces.
 */
export const ADMIN_SURFACE_POLICIES: readonly AdminSurfacePolicy[] = [
  { id: 'users', controlPlane: 'family_administration', familyState: 'active' },
  { id: 'defaults', controlPlane: 'family_administration', familyState: 'active' },
  { id: 'config', controlPlane: 'family_administration', familyState: 'active' },
  { id: 'settings', controlPlane: 'family_administration', familyState: 'active' },
  { id: 'features', controlPlane: 'family_administration', familyState: 'active' },
  { id: 'addons', controlPlane: 'excluded', familyState: 'hidden' },
  { id: 'plugins', controlPlane: 'excluded', familyState: 'hidden' },
  { id: 'notifications', controlPlane: 'family_administration', familyState: 'active' },
  { id: 'mcp-tokens', controlPlane: 'platform_operations', familyState: 'hidden' },
  { id: 'github', controlPlane: 'excluded', familyState: 'hidden' },
  { id: 'backup', controlPlane: 'platform_operations', familyState: 'hidden' },
  { id: 'export', controlPlane: 'family_administration', familyState: 'active' },
  { id: 'audit', controlPlane: 'family_administration', familyState: 'active' },
  { id: 'dev-notifications', controlPlane: 'excluded', familyState: 'hidden' },
] as const

const POLICY_BY_ID = new Map<AdminSurfaceId, AdminSurfacePolicy>(
  ADMIN_SURFACE_POLICIES.map(policy => [policy.id, policy]),
)

export function getAdminSurfacePolicy(id: AdminSurfaceId): AdminSurfacePolicy {
  const policy = POLICY_BY_ID.get(id)
  if (!policy) throw new Error(`Unknown Admin surface: ${id}`)
  return policy
}

export function isAdminSurfaceVisible(
  id: AdminSurfaceId,
  opts: { supabasePlane: boolean; mcpEnabled: boolean; devMode: boolean },
): boolean {
  if (opts.supabasePlane) return getAdminSurfacePolicy(id).familyState !== 'hidden'
  if (id === 'mcp-tokens') return opts.mcpEnabled
  if (id === 'dev-notifications') return opts.devMode
  return true
}

export function isDeferredFamilySurface(id: AdminSurfaceId, supabasePlane: boolean): boolean {
  return supabasePlane && getAdminSurfacePolicy(id).familyState === 'deferred'
}
