// Browser-only fault scheduler. It never changes Auth, network responses or stored row values.
export function installStorageFaults() {
  if (globalThis.location.hostname !== '127.0.0.1' || globalThis.location.protocol !== 'http:') return;
  const key = '__d16_storage_fault';
  let armed = JSON.parse(globalThis.sessionStorage.getItem(key) || 'null');
  const hits = [];
  const allowed = new Set(['write-quota', 'write-abort', 'read-abort', 'cache-open']);
  const control = {
    arm(kind, reload = false) {
      if (!allowed.has(kind)) throw Error('Unknown storage fixture fault');
      armed = { kind, remaining: kind === 'cache-open' ? 999 : 1 };
      if (reload) globalThis.sessionStorage.setItem(key, JSON.stringify(armed));
    },
    disarm() {
      armed = null;
      globalThis.sessionStorage.removeItem(key);
    },
    summary() {
      return { armed, hits: hits.map((h) => ({ ...h })) };
    },
  };
  globalThis.__d16StorageFaults = control;
  const objectStore = globalThis.IDBObjectStore.prototype;
  for (const method of ['get', 'add', 'put']) {
    const original = objectStore[method];
    objectStore[method] = function (...args) {
      const database = this.transaction.db.name;
      const matches =
        armed?.remaining > 0 &&
        database === 'family-planner-cache-v1' &&
        ((armed.kind === 'read-abort' && this.name === 'completeHeads' && method === 'get') ||
          (armed.kind === 'write-quota' && this.name === 'completeHeads' && method === 'put') ||
          (armed.kind === 'write-abort' && this.name === 'completeSnapshots' && method === 'add'));
      if (matches) {
        const hit = { kind: armed.kind, method, store: this.name, abortObserved: false };
        hits.push(hit);
        --armed.remaining;
        globalThis.sessionStorage.removeItem(key);
        this.transaction.addEventListener(
          'abort',
          () => {
            hit.abortObserved = true;
          },
          { once: true }
        );
        this.transaction.abort();
        throw new globalThis.DOMException(
          'Synthetic browser storage failure',
          armed.kind === 'write-quota' ? 'QuotaExceededError' : 'AbortError'
        );
      }
      return original.apply(this, args);
    };
  }
  const factory = globalThis.IDBFactory.prototype,
    open = factory.open;
  factory.open = function (name, ...args) {
    if (name === 'family-planner-cache-v1' && armed?.kind === 'cache-open' && armed.remaining > 0) {
      --armed.remaining;
      hits.push({ kind: armed.kind, method: 'open', store: null, abortObserved: false });
      throw new globalThis.DOMException('Synthetic inaccessible cache database', 'UnknownError');
    }
    return open.call(this, name, ...args);
  };
}
