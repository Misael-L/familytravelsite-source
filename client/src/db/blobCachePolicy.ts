// Keep cached trip documents from exhausting the origin's storage alongside map tiles.
export const BLOB_CACHE_MAX_ENTRIES = 200;
export const BLOB_CACHE_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

/** Receives rows in IndexedDB's cachedAt order, including its primary-key tie order. */
export function blobCacheEvictionKeys(
  entries: readonly { url: string; bytes?: number | null }[],
  maxCount: number,
  maxBytes: number
): string[] {
  let count = entries.length;
  let totalBytes = entries.reduce((sum, e) => sum + (e.bytes ?? 0), 0);
  if (count <= maxCount && totalBytes <= maxBytes) return [];

  const toDelete: string[] = [];
  for (const e of entries) {
    if (count <= maxCount && totalBytes <= maxBytes) break;
    toDelete.push(e.url);
    totalBytes -= e.bytes ?? 0;
    count -= 1;
  }
  return toDelete;
}
