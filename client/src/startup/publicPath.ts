/** Public auth/share routes that skip blocking membership bootstrap. */
export function isPublicAuthPath(pathname: string): boolean {
  return (
    pathname.startsWith('/shared/')
    || pathname.startsWith('/public/')
    || pathname.startsWith('/login')
    || pathname.startsWith('/request-access')
    || pathname.startsWith('/forgot-password')
    || pathname.startsWith('/reset-password')
  )
}

export function isLoginOrRequestAccessPath(pathname: string): boolean {
  return pathname.startsWith('/login') || pathname.startsWith('/request-access')
}
