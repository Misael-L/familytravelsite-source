import { currentOfflineDatabase, offlineSessionEpoch } from '../db/offlineDb';
import { sourceDatabaseCurrent } from '../db/sourceDatabase';
import { isAuthed } from './authGate';
import { guardSessionDatabase } from './queueSession';

export class ReadSessionChanged extends Error {
  constructor() {
    super('The original read session ended.');
    this.name = 'ReadSessionChanged';
  }
}
/** Read-only startup may run before authentication and before the lazy DB first opens. */
export function captureReadSession() {
  const original = currentOfflineDatabase(),
    epoch = offlineSessionEpoch(),
    authenticated = isAuthed();
  // Lifecycle identity only. This must never grant permission or publish private values.
  // A newly captured refused context is stable too; replacing it during every render loops forever.
  const contextCurrent = () =>
    original === currentOfflineDatabase() && epoch === offlineSessionEpoch() && authenticated === isAuthed();
  const current = () => contextCurrent() && sourceDatabaseCurrent(original.name);
  const assertCurrent = () => {
    if (!current()) throw new ReadSessionChanged();
  };
  return { current, contextCurrent, assertCurrent, db: guardSessionDatabase(original, assertCurrent) };
}
export type ReadSession = ReturnType<typeof captureReadSession>;
/** A failed optional cache copy must not discard a valid online response. Cancellation still propagates. */
export async function optionalReadCache(write: Promise<unknown>, session: ReadSession): Promise<boolean> {
  try {
    await write;
    session.assertCurrent();
    return true;
  } catch {
    session.assertCurrent();
    return false;
  }
}
