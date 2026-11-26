import { cmp, type DBCore, type DBCoreKeyRange, type DBCoreMutateRequest } from 'dexie';
import { nativeDatabaseUser, sourceDatabaseName } from './nativeDatabaseNames';
export { nativeDatabaseUser, sourceDatabaseName } from './nativeDatabaseNames';

export type SourceDatabaseOwner = Readonly<{
  format: 'family.native-owner.v1';
  source: string;
  user_id: string;
  family_id: string;
  person_id: string;
  native_user: number;
}>;
export type SourceDatabaseBinding = {
  name: string;
  owner: SourceDatabaseOwner;
  current: () => boolean;
  writable: () => boolean;
  initialize: () => boolean;
  selected?: () => void;
};
export type SourceDatabasePolicy = {
  select: (user: number | string) => Promise<SourceDatabaseBinding>;
  read: () => Promise<SourceDatabaseBinding>;
};
export const SOURCE_OWNER_KEY = 0;
export const SOURCE_PAUSE_KEY = -1;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const bindings = new Map<string, SourceDatabaseBinding>();
let policy: SourceDatabasePolicy | null = null;
export class SourceOwnershipError extends Error {
  constructor() {
    super('Original local work needs its verified source owner. Nothing was moved or removed.');
    this.name = 'SourceOwnershipError';
  }
}
export function sourceOwner(value: unknown): SourceDatabaseOwner {
  if (!value || typeof value !== 'object') throw new SourceOwnershipError();
  const o = value as SourceDatabaseOwner;
  const url = new URL(o.source);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new SourceOwnershipError();
  if (
    o.format !== 'family.native-owner.v1' ||
    ![o.user_id, o.family_id, o.person_id].every((v) => typeof v === 'string' && UUID.test(v)) ||
    !Number.isSafeInteger(o.native_user) ||
    o.native_user <= 0 ||
    Object.keys(o).length !== 6
  )
    throw new SourceOwnershipError();
  return Object.freeze({
    format: o.format,
    source: url.href.replace(/\/+$/, ''),
    user_id: o.user_id,
    family_id: o.family_id,
    person_id: o.person_id,
    native_user: o.native_user,
  });
}
export async function sourceOwnerName(owner: SourceDatabaseOwner): Promise<string> {
  const checked = sourceOwner(owner);
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(checked)))
  );
  return `trek-offline-f1-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}-u${checked.native_user}`;
}
export function sourceOwnerMarker(owner: SourceDatabaseOwner) {
  return {
    tripId: SOURCE_OWNER_KEY,
    lastSyncedAt: null,
    status: 'idle' as const,
    tilesBbox: null,
    filesCachedCount: 0,
    sourceOwner: owner,
  };
}
export function currentSourcePolicy() {
  return policy;
}
export function installSourcePolicy(value: SourceDatabasePolicy) {
  if (policy) throw new SourceOwnershipError();
  policy = value;
  return () => {
    if (policy === value) policy = null;
  };
}
export function bindSourceDatabase(binding: SourceDatabaseBinding) {
  if (!sourceDatabaseName(binding.name) || nativeDatabaseUser(binding.name) !== binding.owner.native_user)
    throw new SourceOwnershipError();
  bindings.set(binding.name, binding);
}
export function sourceDatabaseCurrent(name: string): boolean {
  try {
    assertSourceDatabase(name);
    return true;
  } catch {
    return false;
  }
}
export function sourceBinding(name: string) {
  return bindings.get(name);
}
export function assertSourceDatabase(name: string) {
  if (!sourceDatabaseName(name)) {
    if (policy && name !== 'trek-offline') throw new SourceOwnershipError();
    return;
  }
  if (!bindings.get(name)?.current()) throw new SourceOwnershipError();
}
/** Called only by populate, never by an upgrade or an existing unmarked database. */
export function initializeSourceDatabase(name: string, transaction: IDBTransaction): Promise<void> | undefined {
  if (!sourceDatabaseName(name)) return;
  const binding = bindings.get(name);
  if (!binding?.current() || !binding.initialize()) throw new SourceOwnershipError();
  return new Promise((resolve, reject) => {
    const request = transaction.objectStore('syncMeta').add(sourceOwnerMarker(binding.owner));
    request.onerror = () => reject(new SourceOwnershipError());
    request.onsuccess = () => {
      if (!binding.current() || !binding.initialize()) {
        transaction.abort();
        reject(new SourceOwnershipError());
      } else resolve();
    };
  });
}
function includesOwner(range: DBCoreKeyRange): boolean {
  if (range.type === 4) return false; // DBCoreRangeType.Never
  if (range.type === 3) return true; // DBCoreRangeType.Any
  const lower = range.lower === undefined ? -1 : cmp(range.lower, SOURCE_OWNER_KEY);
  const upper = range.upper === undefined ? 1 : cmp(range.upper, SOURCE_OWNER_KEY);
  return (lower < 0 || (lower === 0 && !range.lowerOpen)) && (upper > 0 || (upper === 0 && !range.upperOpen));
}
function changesOwner(request: DBCoreMutateRequest): boolean {
  if (request.type === 'deleteRange') return includesOwner(request.range);
  if (request.type === 'delete') return request.keys.includes(SOURCE_OWNER_KEY);
  return request.values.some((row) => row?.tripId === SOURCE_OWNER_KEY);
}
/** The native IDB owner read is queued first; a mismatch aborts before any caller request can publish/commit. */
export function sourceDatabaseMiddleware(name: string) {
  return {
    stack: 'dbcore' as const,
    name: 'FamilySourceOwner',
    level: 20,
    create(core: DBCore): DBCore {
      return {
        ...core,
        transaction(stores, mode, options) {
          if (!sourceDatabaseName(name)) {
            if (policy && stores.some((store) => ['mutationQueue', 'importFiles'].includes(store)))
              throw new SourceOwnershipError();
            return core.transaction(stores, mode, options);
          }
          const binding = bindings.get(name);
          if (!binding || !binding.current() || (mode === 'readwrite' && !binding.writable()))
            throw new SourceOwnershipError();
          const transaction = core.transaction([...new Set([...stores, 'syncMeta'])], mode, options) as IDBTransaction;
          const request = transaction.objectStore('syncMeta').get(SOURCE_OWNER_KEY);
          request.onsuccess = () => {
            if (
              !binding.current() ||
              JSON.stringify(request.result) !== JSON.stringify(sourceOwnerMarker(binding.owner))
            )
              transaction.abort();
          };
          return transaction;
        },
        table(tableName) {
          const table = core.table(tableName);
          if (!sourceDatabaseName(name)) return table;
          const check = (write = false) => {
            if (!sourceDatabaseName(name)) return;
            const binding = bindings.get(name);
            if (!binding?.current() || (write && !binding.writable())) throw new SourceOwnershipError();
          };
          const guarded =
            <A, R>(read: (argument: A) => Promise<R>) =>
            (argument: A): Promise<R> => {
              const original = bindings.get(name);
              check();
              return read(argument).then((result) => {
                check();
                if (original && !original.current()) throw new SourceOwnershipError();
                return result;
              });
            };
          return {
            ...table,
            get: guarded(table.get),
            getMany: guarded(table.getMany),
            query: guarded(table.query),
            count: guarded(table.count),
            openCursor: guarded(table.openCursor),
            mutate(request) {
              check(true);
              if (sourceDatabaseName(name) && tableName === 'syncMeta' && changesOwner(request))
                throw new SourceOwnershipError();
              return table.mutate(request);
            },
          };
        },
      };
    },
  };
}
