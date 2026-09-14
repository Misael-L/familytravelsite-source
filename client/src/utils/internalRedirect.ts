export const INTERNAL_REDIRECT_FALLBACK = '/dashboard'

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const DUMMY_ORIGIN = 'https://family.invalid'

function hasControlOrWhitespace(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return true
    if (/\s/.test(value[i])) return true
  }
  return false
}

function decodeUntilStable(value: string): string | null {
  let current = value
  for (let i = 0; i < 5; i++) {
    let next: string
    try {
      next = decodeURIComponent(current.replace(/\+/g, '%2B'))
    } catch {
      return null
    }
    if (next === current) return current
    current = next
  }
  return null
}

/**
 * Accept only same-origin internal absolute paths. Reject protocol-relative
 * URLs, backslashes, encoded bypasses, control characters, schemes,
 * credentials/hosts, malformed encodings, and external origins.
 */
export function sanitizeInternalRedirect(
  raw: string | null | undefined,
  fallback: string = INTERNAL_REDIRECT_FALLBACK,
): string {
  if (raw == null) return fallback
  const value = String(raw)
  if (!value || hasControlOrWhitespace(value)) return fallback
  if (value.includes('\\') || /%5c/i.test(value)) return fallback

  const decoded = decodeUntilStable(value)
  if (decoded == null) return fallback
  if (hasControlOrWhitespace(decoded) || decoded.includes('\\')) return fallback
  if (SCHEME.test(decoded) || decoded.startsWith('//') || !decoded.startsWith('/')) return fallback
  if (decoded.startsWith('//') || decoded.startsWith('/\\')) return fallback
  if (SCHEME.test(decoded.slice(1))) return fallback

  let url: URL
  try {
    url = new URL(decoded, DUMMY_ORIGIN)
  } catch {
    return fallback
  }
  if (url.origin !== DUMMY_ORIGIN || url.protocol !== 'https:' || url.username || url.password) {
    return fallback
  }
  if (url.href.includes('\\') || url.pathname.includes('\\')) return fallback
  if (url.pathname.startsWith('//')) return fallback

  const path = `${url.pathname}${url.search}${url.hash}`
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback
  if (hasControlOrWhitespace(path) || SCHEME.test(path.slice(1))) return fallback
  return path
}

export function resolveInternalRedirect(
  raw: string | null | undefined,
  fallback: string = INTERNAL_REDIRECT_FALLBACK,
): string {
  return sanitizeInternalRedirect(raw, fallback)
}
