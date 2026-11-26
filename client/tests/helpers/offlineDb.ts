import { offlineDb } from '../../src/db/offlineDb';
/** Test teardown only. Deliberately erase fixtures without going through the guarded product cache action. */
export async function resetOfflineTestDatabase(): Promise<void> {
  await offlineDb.delete();
  await offlineDb.open();
}
