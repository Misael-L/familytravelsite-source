const listeners = new Set<() => void>();
let failedCleanups = 0;
export const privateSessionCleanupFailures = () => failedCleanups;

/** Volatile private consumers retire synchronously with the existing offline-session epoch. */
export function onPrivateSessionEnd(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function notifyPrivateSessionEnd(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      failedCleanups++; /* Record the failure without blocking other cleanup or account teardown. */
    }
  }
}
