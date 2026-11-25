import { type TrekOfflineDb, currentOfflineDatabase, offlineSessionEpoch } from '../db/offlineDb';
import { sourceDatabaseCurrent } from '../db/sourceDatabase';
import { isAuthed } from './authGate';
export class QueueSessionChanged extends Error {
  constructor() {
    super('The original offline queue session ended. Original work remains in its account.');
    this.name = 'QueueSessionChanged';
  }
}
/** Every table access stays on one concrete connection and one authentication epoch. */
export function captureQueueSession() {
  const original = currentOfflineDatabase(),
    epoch = offlineSessionEpoch();
  const current = () =>
    isAuthed() &&
    sourceDatabaseCurrent(original.name) &&
    original === currentOfflineDatabase() &&
    original.isOpen() &&
    epoch === offlineSessionEpoch();
  const assertCurrent = () => {
    if (!current()) throw new QueueSessionChanged();
  };
  return { db: guardSessionDatabase(original, assertCurrent), current, assertCurrent };
}

/** Share the concrete-connection guard with read sessions; authorization stays with each caller. */
export function guardSessionDatabase(original: TrekOfflineDb, assertCurrent: () => void): TrekOfflineDb {
  const tables = new WeakMap<object, object>();
  const guardedTable = (table: object) => {
    let proxy = tables.get(table);
    if (!proxy) {
      proxy = new Proxy(table, {
        get(target, key) {
          const value = Reflect.get(target, key);
          return typeof value === 'function'
            ? (...args: unknown[]) => {
                assertCurrent();
                return value.apply(target, args);
              }
            : value;
        },
      });
      tables.set(table, proxy);
    }
    return proxy;
  };
  const db = new Proxy(original, {
    get(target, key) {
      assertCurrent();
      const value = Reflect.get(target, key);
      if (typeof value === 'function')
        return (...args: unknown[]) => {
          assertCurrent();
          return value.apply(target, args);
        };
      if (value && typeof value === 'object' && 'schema' in value && 'db' in value) return guardedTable(value);
      return value;
    },
  });
  return db;
}
