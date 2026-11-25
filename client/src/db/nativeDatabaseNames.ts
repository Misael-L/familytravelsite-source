/** Device locators only. A numeric key never establishes account or source ownership. */
const OWNED_NAME = /^trek-offline-f1-[a-f0-9]{64}-u([1-9][0-9]*)$/;
const LEGACY_NAME = /^trek-offline-u([1-9][0-9]*)$/;
export function sourceDatabaseName(name: string): boolean {
  return OWNED_NAME.test(name);
}
export function nativeDatabaseUser(name: string): number | null {
  const value = name.match(OWNED_NAME)?.[1] ?? name.match(LEGACY_NAME)?.[1];
  return value && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}
export function unattributedDatabaseName(name: string): boolean {
  return LEGACY_NAME.test(name) && nativeDatabaseUser(name) !== null;
}
