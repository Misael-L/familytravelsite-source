// The native UI cache and the preserved Family auth snapshot have different formats.
// Keep Family's existing key and bytes intact. This cache conveys no authorization.
export const NATIVE_AUTH_SNAPSHOT_KEY = 'trek_native_auth_snapshot';
const LEGACY_AUTH_SNAPSHOT_KEY = 'trek_auth_snapshot';
type SnapshotStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function oldNativeSnapshot(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw),
      state = parsed?.state,
      user = state?.user;
    // Family payloads (including old version-zero payloads) are never native UI cache.
    if (
      parsed.version !== 0 ||
      !state ||
      typeof state !== 'object' ||
      ['authUserId', 'personId', 'familyId', 'membershipRole', 'isSuperAdmin'].some((key) => key in state) ||
      typeof state.isAuthenticated !== 'boolean'
    )
      return null;
    if (user !== null && (!user || !Number.isSafeInteger(user.id) || user.id <= 0)) return null;
    return JSON.stringify({
      version: 0,
      state: {
        isAuthenticated: state.isAuthenticated,
        user:
          user === null
            ? null
            : {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                mfa_enabled: user.mfa_enabled,
                must_change_password: user.must_change_password,
              },
      },
    });
  } catch {
    return null; // Malformed cache is not a session or an offline database owner.
  }
}

/** Copy only a recognized old native display cache; never remove/modify its source. */
export function readNativeAuthSnapshot(storage: SnapshotStorage): string | null {
  const current = storage.getItem(NATIVE_AUTH_SNAPSHOT_KEY);
  if (current !== null) return current;
  const migrated = oldNativeSnapshot(storage.getItem(LEGACY_AUTH_SNAPSHOT_KEY));
  if (migrated === null) return null;
  try {
    storage.setItem(NATIVE_AUTH_SNAPSHOT_KEY, migrated);
  } catch {
    return migrated; // Storage quota may prevent copying, but the readable source still works.
  }
  return migrated;
}

export function nativeAuthStorage(storage: SnapshotStorage) {
  return {
    getItem: () => readNativeAuthSnapshot(storage),
    setItem: (key: string, value: string) => storage.setItem(key, value),
    removeItem: (key: string) => storage.removeItem(key),
  };
}

/** Choose the existing native per-user database, never Family's sentinel user 0. */
export function nativeAuthSnapshotUserId(storage: SnapshotStorage): number | null {
  try {
    const snapshot = JSON.parse(readNativeAuthSnapshot(storage) ?? 'null'),
      id = snapshot?.state?.user?.id;
    return snapshot?.version === 0 && snapshot.state.isAuthenticated === true && Number.isSafeInteger(id) && id > 0
      ? id
      : null;
  } catch {
    return null;
  }
}
