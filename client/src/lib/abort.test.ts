import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  abortError,
  isAbortError,
  raceTimeout,
  throwIfAborted,
  timeoutAbort,
  timeoutError,
} from './abort'

describe('abort helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('FE-LIB-ABORT-001: isAbortError matches AbortError only', () => {
    expect(isAbortError(abortError())).toBe(true)
    expect(isAbortError(timeoutError('slow'))).toBe(false)
    expect(isAbortError(new Error('fail'))).toBe(false)
  })

  it('FE-LIB-ABORT-002: throwIfAborted no-ops until aborted', () => {
    const ctrl = new AbortController()
    expect(() => throwIfAborted(ctrl.signal)).not.toThrow()
    ctrl.abort()
    expect(() => throwIfAborted(ctrl.signal)).toThrow(/Aborted/)
  })

  it('FE-LIB-ABORT-003: raceTimeout rejects TimeoutError when the promise hangs', async () => {
    vi.useFakeTimers()
    const hung = new Promise<string>(() => {})
    const pending = raceTimeout(hung, 1_000)
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(1_000)
    await assertion
  })

  it('FE-LIB-ABORT-004: raceTimeout rejects AbortError when the signal aborts first', async () => {
    const ctrl = new AbortController()
    const hung = new Promise<string>(() => {})
    const pending = raceTimeout(hung, 10_000, ctrl.signal)
    ctrl.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('FE-LIB-ABORT-005: timeoutAbort child aborts on parent abort and dispose is safe', () => {
    const parent = new AbortController()
    const child = timeoutAbort(parent.signal, 10_000)
    expect(child.signal.aborted).toBe(false)
    parent.abort()
    expect(child.signal.aborted).toBe(true)
    expect(() => child.dispose()).not.toThrow()
  })
})
