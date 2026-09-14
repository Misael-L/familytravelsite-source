/**
 * Public share/journey URLs must never call Family map RPCs, even when the
 * visitor is signed in. Appearance isolation for `/shared/` stays separate.
 */
export function isPublicMapIsolatedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const path = pathname.split(/[?#]/, 1)[0]
  if (path === '/shared' || path.startsWith('/shared/')) return true
  if (path === '/public/journey' || path.startsWith('/public/journey/')) return true
  return false
}
