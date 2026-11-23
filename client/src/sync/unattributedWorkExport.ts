import { unattributedDatabaseName } from '../db/nativeDatabaseNames';
import {
  encodeOriginalWork,
  ORIGINAL_WORK_MAX_BYTES,
  ORIGINAL_WORK_MAX_ROWS,
  OriginalWorkExportError,
} from './originalWorkArchive';
export const UNATTRIBUTED_WORK_FORMAT = 'family.unattributed-work.v1';
export const UNATTRIBUTED_WORK_FILENAME = 'family-unattributed-work-v1.json';
const stores = ['mutationQueue', 'importFiles', 'syncMeta'];
const refuse = () =>
  new OriginalWorkExportError('Device recovery was refused or cancelled. Nothing was changed or removed.');
type Row = { key: IDBValidKey; row: unknown };
type Capture = { queue: Row[]; imports: Row[]; excluded: string[]; at: string };

/** All requests stay in the same readonly transaction; Blob reads happen after it completes. */
function captureRows(db: IDBDatabase, tx: IDBTransaction, guard: () => void, fail: () => void) {
  const keys: Record<string, string | string[]> = {
    mutationQueue: 'id',
    importFiles: ['jobId', 'fileName'],
    syncMeta: 'tripId',
  };
  for (const name of stores) {
    const store = tx.objectStore(name);
    if (store.autoIncrement || JSON.stringify(store.keyPath) !== JSON.stringify(keys[name])) throw refuse();
  }
  const state = {
    complete: false,
    data: {
      queue: [],
      imports: [],
      at: '',
      excluded: Array.from(db.objectStoreNames)
        .filter((name) => !['mutationQueue', 'importFiles'].includes(name))
        .sort(),
    } as Capture,
  };
  const counts: number[] = [];
  const load = () => {
    if (counts.length !== 2) return;
    if (counts[0] + counts[1] > ORIGINAL_WORK_MAX_ROWS || counts[0] + counts[1] === 0) {
      fail();
      return;
    }
    let finished = 0;
    for (const [name, target] of [
      ['mutationQueue', state.data.queue],
      ['importFiles', state.data.imports],
    ] as const) {
      const cursor = tx.objectStore(name).openCursor();
      cursor.onsuccess = () => {
        try {
          guard();
          if (!cursor.result) {
            state.complete = ++finished === 2;
            return;
          }
          target.push({ key: cursor.result.primaryKey, row: cursor.result.value });
          cursor.result.continue();
        } catch {
          fail();
        }
      };
    }
  };
  const owner = tx.objectStore('syncMeta').getKey(0);
  owner.onsuccess = () => {
    try {
      guard();
      if (owner.result !== undefined) throw refuse();
      for (const name of ['mutationQueue', 'importFiles']) {
        const count = tx.objectStore(name).count();
        count.onsuccess = () => {
          counts.push(count.result);
          load();
        };
      }
    } catch {
      fail();
    }
  };
  return state;
}

class DeviceRecoverySession {
  private active = true;
  private sequence = 0;
  private candidates = new Set<string>();
  private connection: IDBDatabase | undefined;
  private transaction: IDBTransaction | undefined;
  constructor(
    private factory: IDBFactory,
    private origin: string
  ) {}
  private close() {
    try {
      this.transaction?.abort();
    } catch {
      /* A completed transaction cannot be aborted. */
    }
    this.transaction = undefined;
    this.connection?.close();
    this.connection = undefined;
  }
  cancel() {
    this.active = false;
    this.sequence++;
    this.candidates.clear();
    this.close();
  }
  private assertCurrent(ticket: number) {
    if (!this.active || this.sequence !== ticket) throw refuse();
  }
  async discover() {
    const ticket = ++this.sequence;
    this.close();
    this.candidates.clear();
    this.assertCurrent(ticket);
    if (typeof this.factory?.databases !== 'function') throw refuse();
    const names = (await this.factory.databases()).flatMap((value) =>
      typeof value.name === 'string' && unattributedDatabaseName(value.name) ? [value.name] : []
    );
    this.assertCurrent(ticket);
    if (names.length > 100) throw refuse();
    this.candidates = new Set(names);
    return [...this.candidates].sort();
  }
  private capture(name: string, ticket: number) {
    return new Promise<Capture>((resolve, reject) => {
      let settled = false,
        ownDb: IDBDatabase | undefined,
        ownTx: IDBTransaction | undefined;
      const cleanup = () => {
        try {
          ownTx?.abort();
        } catch {
          /* The readonly capture may already be complete. */
        }
        if (this.transaction === ownTx) this.transaction = undefined;
        if (this.connection === ownDb) this.connection = undefined;
        ownDb?.close();
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(refuse());
      };
      // Abort every upgrade, including a missing-name creation race. No version argument.
      const open = this.factory.open(name);
      open.onupgradeneeded = () => {
        open.transaction?.abort();
      };
      open.onerror = fail;
      open.onblocked = fail;
      open.onsuccess = () => {
        const db = open.result;
        if (settled) {
          db.close();
          return;
        }
        ownDb = db;
        try {
          this.assertCurrent(ticket);
          this.connection = db;
          const retire = () => {
            if (this.sequence === ticket) this.cancel();
            fail();
          };
          db.onversionchange = retire;
          db.onclose = retire;
          if (db.version !== 140 || stores.some((store) => !db.objectStoreNames.contains(store))) throw refuse();
          const tx = db.transaction(stores, 'readonly');
          ownTx = tx;
          this.transaction = tx;
          tx.onabort = fail;
          tx.onerror = fail;
          const state = captureRows(db, tx, () => this.assertCurrent(ticket), fail);
          tx.oncomplete = () => {
            if (settled) return;
            try {
              this.assertCurrent(ticket);
              if (!state.complete) throw refuse();
              state.data.at = new Date().toISOString();
              settled = true;
              cleanup();
              resolve(state.data);
            } catch {
              fail();
            }
          };
        } catch {
          fail();
        }
      };
    });
  }
  async prepare(name: string) {
    const ticket = ++this.sequence;
    this.close();
    this.assertCurrent(ticket);
    if (!unattributedDatabaseName(name) || !this.candidates.has(name)) throw refuse();
    const capture = await this.capture(name, ticket);
    this.assertCurrent(ticket);
    // Unknown store names are metadata, not exempt from known-credential refusal.
    await encodeOriginalWork(capture.excluded, () => this.assertCurrent(ticket));
    const graph = await encodeOriginalWork({ queue: capture.queue, imports: capture.imports }, () =>
      this.assertCurrent(ticket)
    );
    this.assertCurrent(ticket);
    const payload = JSON.stringify({
      attribution: { kind: 'unattributed' },
      device_origin: this.origin,
      database: { name, indexeddb_version: 140 },
      captured_at: capture.at,
      automatic_replay: false,
      captured_stores: ['mutationQueue', 'importFiles'],
      excluded_stores: capture.excluded,
      counts: { queue: capture.queue.length, imports: capture.imports.length },
      graph,
    });
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))),
      (b) => b.toString(16).padStart(2, '0')
    ).join('');
    this.assertCurrent(ticket);
    const blob = new Blob([JSON.stringify({ format: UNATTRIBUTED_WORK_FORMAT, sha256, payload })], {
      type: 'application/json',
    });
    if (blob.size > ORIGINAL_WORK_MAX_BYTES) throw refuse();
    return {
      blob,
      filename: UNATTRIBUTED_WORK_FILENAME,
      summary: {
        database: name,
        queue: capture.queue.length,
        imports: capture.imports.length,
        bytes: blob.size,
        excluded: capture.excluded,
      },
      assertCurrent: () => this.assertCurrent(ticket),
    };
  }
}
/** Explicit device custody, NOT current Family authentication or original source attribution. */
export function beginUnattributedRecovery(options: { consented: boolean; origin: string; factory?: IDBFactory }) {
  if (options.consented !== true) throw refuse();
  const origin = new URL(options.origin);
  if (!['https:', 'http:'].includes(origin.protocol) || origin.origin !== options.origin) throw refuse();
  return new DeviceRecoverySession(options.factory ?? globalThis.indexedDB, options.origin);
}
