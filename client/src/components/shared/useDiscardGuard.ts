import { useCallback, useRef, useState } from 'react'

function freeze(value: unknown): string {
  try { return JSON.stringify(value) ?? 'null' } catch { return 'null' }
}

/**
 * Compares the editor's current snapshot with a baseline the editor sets for
 * this opening. The baseline is never taken from the first key or pointer, so
 * an edit cannot become the original value.
 */
export function useDiscardGuard(snapshot: unknown, onClose: () => void) {
  const baseline = useRef<string | null>(null)
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [asking, setAsking] = useState(false)

  const reset = useCallback((next: unknown) => {
    baseline.current = freeze(next)
    setAsking(false)
  }, [])

  const requestClose = useCallback(() => {
    if (baseline.current !== null && freeze(snapshotRef.current) !== baseline.current) setAsking(true)
    else onCloseRef.current()
  }, [])

  const ask = useCallback(() => setAsking(true), [])

  const keepEditing = useCallback(() => setAsking(false), [])

  const discard = useCallback(() => {
    setAsking(false)
    onCloseRef.current()
  }, [])

  return { asking, requestClose, ask, keepEditing, discard, reset }
}
