/** The host supplies lifecycle checks; PostgreSQL/Storage remain the authorization authority. */
export type FamilyOperationOwner = { assertCurrent(): void }
let invocation: FamilyOperationOwner | undefined
let factory: (() => FamilyOperationOwner) | undefined

/** Synchronous invocation scope only: never retain a mutable global across an await. */
export function withFamilyOperationContext<T>(owner: FamilyOperationOwner, invoke: () => T): T {
  const previous = invocation
  invocation = owner
  try {
    return invoke()
  } finally {
    invocation = previous
  }
}

/** Standalone legacy calls capture the host actor. Disposal cannot remove a newer host. */
export function installFamilyOperationContext(capture: () => FamilyOperationOwner): () => void {
  factory = capture
  return () => {
    if (factory === capture) factory = undefined
  }
}

export function captureFamilyOperation() {
  // No host preserves the standalone package's legacy contract; it is not an authorization grant.
  const owner = invocation ?? factory?.() ?? { assertCurrent() {} }
  const assertCurrent = () => owner.assertCurrent()
  assertCurrent()
  return {
    assertCurrent,
    async perform<T>(operation: () => PromiseLike<T> | T): Promise<T> {
      assertCurrent()
      try {
        const result = await withFamilyOperationContext(owner, operation)
        assertCurrent()
        return result
      } catch (error) {
        assertCurrent()
        throw error
      }
    },
  }
}
