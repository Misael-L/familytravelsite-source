/** Queue wire format, independent of Dexie construction and Family activation. */
export const MUTATION_SCHEMA_VERSION = 2;
/** An unstamped row is native format 1. Unknown or malformed stamps are preserved, never interpreted. */
export function isSupportedMutationFormat(row: { schemaVersion?: number }): boolean {
  const version = row.schemaVersion === undefined ? 1 : row.schemaVersion;
  return Number.isSafeInteger(version) && version >= 1 && version <= MUTATION_SCHEMA_VERSION;
}
