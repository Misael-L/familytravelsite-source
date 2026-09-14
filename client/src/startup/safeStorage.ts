/**
 * Startup-critical browser storage. Quota / private-mode / blocked storage
 * must not crash bootstrap. Persisted keys and their meaning stay unchanged.
 */

export function readLocal(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  } catch {
    /* private mode / quota */
  }
}

export function removeLocal(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(key)
  } catch {
    /* private mode / quota */
  }
}

/** Zustand persist StateStorage that never throws. */
export const safePersistStorage = {
  getItem: (name: string): string | null => readLocal(name),
  setItem: (name: string, value: string): void => writeLocal(name, value),
  removeItem: (name: string): void => removeLocal(name),
}
