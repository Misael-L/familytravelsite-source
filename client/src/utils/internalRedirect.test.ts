import { describe, expect, it } from 'vitest'
import { INTERNAL_REDIRECT_FALLBACK, resolveInternalRedirect, sanitizeInternalRedirect } from './internalRedirect'

describe('sanitizeInternalRedirect', () => {
  it('accepts internal path, query, and hash', () => {
    expect(sanitizeInternalRedirect('/trips/abc')).toBe('/trips/abc')
    expect(sanitizeInternalRedirect('/oauth/consent?client_id=foo')).toBe('/oauth/consent?client_id=foo')
    expect(sanitizeInternalRedirect('/settings?mfa=required#account')).toBe('/settings?mfa=required#account')
  })

  it('accepts a once-encoded internal path', () => {
    expect(sanitizeInternalRedirect('%2Foauth%2Fconsent%3Fclient_id%3Dfoo')).toBe(
      '/oauth/consent?client_id=foo',
    )
  })

  it('falls back for empty, null, and whitespace', () => {
    expect(sanitizeInternalRedirect(null)).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect(undefined)).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect(' /dashboard')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('/dashboard\n')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('/dash\u0000board')).toBe(INTERNAL_REDIRECT_FALLBACK)
  })

  it('rejects protocol-relative and host-bearing targets', () => {
    expect(sanitizeInternalRedirect('//evil.example')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('/\\evil.example')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('/\\\\evil.example')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('https://evil.example')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('https:evil.example')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('http://evil.example/path')).toBe(INTERNAL_REDIRECT_FALLBACK)
  })

  it('rejects encoded backslash and mixed-slash bypasses', () => {
    expect(sanitizeInternalRedirect('/%5cevil.example')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('/%5Cevil.example')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('/%2f%2fevil.example')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('/%2F%5Cevil.example')).toBe(INTERNAL_REDIRECT_FALLBACK)
  })

  it('rejects schemes and malformed encodings', () => {
    expect(sanitizeInternalRedirect('javascript:alert(1)')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('/javascript:alert(1)')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('data:text/html,hi')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(sanitizeInternalRedirect('%E0%A4%A')).toBe(INTERNAL_REDIRECT_FALLBACK)
  })

  it('resolveInternalRedirect is an alias', () => {
    expect(resolveInternalRedirect('//evil.example')).toBe(INTERNAL_REDIRECT_FALLBACK)
    expect(resolveInternalRedirect('/trips')).toBe('/trips')
  })
})
