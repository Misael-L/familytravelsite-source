import { describe, expect, it } from 'vitest'
import { selectStartupGate } from './selectStartupGate'

const base = {
  isLoading: false,
  isAuthenticated: true,
  authCheckFailed: false,
  membershipLoaded: true,
  authGate: 'ok' as const,
}

describe('selectStartupGate', () => {
  it('shows recovery when Family membership never finished and auth check failed', () => {
    expect(selectStartupGate({
      ...base,
      authCheckFailed: true,
      membershipLoaded: false,
      authGate: null,
    }, true)).toBe('recovery')
  })

  it('keeps a spinner while membership is in flight without a failure', () => {
    expect(selectStartupGate({
      ...base,
      membershipLoaded: false,
      authGate: null,
    }, true)).toBe('loading')
  })

  it('does not recover a Nest session that failed revalidation after it is already authenticated', () => {
    expect(selectStartupGate({
      ...base,
      authCheckFailed: true,
    }, false)).toBe('proceed')
  })

  it('shows the spinner while isLoading even on Nest', () => {
    expect(selectStartupGate({ ...base, isLoading: true, isAuthenticated: false }, false)).toBe('loading')
  })
})
