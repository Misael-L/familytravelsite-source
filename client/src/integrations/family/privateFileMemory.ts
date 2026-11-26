import { notifyFilePreviewChange, type FilePreviewLease } from '../../repo/filePreview';
import type { PreparedFileRead, PreparedFileState } from '../../repo/preparedFilePreview';
import { selectPreparationFile, type acquirePreparationFile } from './privateFileAcquisition';
export const PRIVATE_FILE_MEMORY_LIMITS = Object.freeze({ bytes: 64 * 1024 * 1024, entries: 4 });
type Acquired = Awaited<ReturnType<typeof acquirePreparationFile>>;
type Scope = { envelope: PreparedFileRead['envelope']; check: () => void };
type Slot = {
  selected: ReturnType<typeof selectPreparationFile>;
  controller: AbortController;
  signal?: AbortSignal;
  refresh: boolean;
  pending: boolean;
  promise: Promise<Acquired['receipt']>;
  value?: Acquired;
  leases: Set<() => void>;
};
export class PrivateFileMemoryError extends Error {
  constructor(public readonly code: 'scope' | 'intent' | 'missing' | 'limit' | 'busy' | 'receipt') {
    super('Private file memory refused: ' + code);
    this.name = 'PrivateFileMemoryError';
  }
}
const fail: (code: PrivateFileMemoryError['code']) => never = (code) => {
  throw new PrivateFileMemoryError(code);
};
const identity = (e: Scope['envelope']) =>
  JSON.stringify([e.source, e.scope, e.ownership, e.generation, e.digest, e.verifiedAt, e.expiresAt]);
function assertReceipt(e: Scope['envelope'], slot: Slot, value: Acquired) {
  const receipt = value.receipt;
  if (
    receipt.format !== 'family.private-file-acquisition.v1' ||
    receipt.source !== e.source ||
    receipt.generation !== e.generation ||
    receipt.snapshotDigest !== e.digest ||
    receipt.expiresAt !== e.expiresAt ||
    JSON.stringify(receipt.scope) !== JSON.stringify(e.scope) ||
    JSON.stringify(receipt.ownership) !== JSON.stringify(e.ownership) ||
    receipt.file.id !== slot.selected.id ||
    receipt.file.storagePath !== slot.selected.storage_path ||
    receipt.file.createdAt !== slot.selected.created_at ||
    receipt.persisted !== false ||
    receipt.serverContentVersion !== 'unversioned' ||
    !/^[a-f0-9]{64}$/.test(receipt.content.sha256) ||
    value.blob.size !== slot.selected.size_bytes ||
    value.blob.type !== slot.selected.mime_type ||
    receipt.content.bytes !== value.blob.size ||
    receipt.content.mime !== value.blob.type
  )
    fail('receipt');
}
/** One original generation's capped RAM bytes; no IndexedDB/CacheStorage or snapshot writes. */
export function createPrivateFileMemory(
  read: Scope,
  acquire: (fileId: string, signal: AbortSignal) => Promise<Acquired>,
  urls = { create: (blob: Blob) => URL.createObjectURL(blob), revoke: (url: string) => URL.revokeObjectURL(url) }
) {
  const e = read.envelope,
    owner = identity(e),
    deadline = performance.now() + Math.max(0, e.expiresAt - Date.now()),
    slots = new Map<string, Slot>(),
    lifetime = new AbortController();
  let disposed = false;
  function check() {
    read.check();
    if (
      disposed ||
      identity(e) !== owner ||
      Date.now() < e.verifiedAt ||
      Date.now() >= e.expiresAt ||
      performance.now() >= deadline
    )
      fail('scope');
  }
  function drop(id: string, slot: Slot) {
    slot.controller.abort();
    for (const release of [...slot.leases]) release();
    slot.value = undefined;
    if (slots.get(id) === slot) slots.delete(id);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    for (const [id, slot] of slots) drop(id, slot);
    clearTimeout(expiry);
    clearInterval(watch);
  }
  const expiry = setTimeout(dispose, Math.max(0, e.expiresAt - Date.now()));
  const watch = setInterval(() => {
    try {
      check();
    } catch {
      dispose();
    }
  }, 1000);
  async function capture(fileId: string, slot: Slot) {
    try {
      const value = await acquire(fileId, slot.controller.signal);
      check();
      if (slot.controller.signal.aborted || slots.get(fileId) !== slot) fail('scope');
      assertReceipt(e, slot, value);
      slot.value = value;
      slot.pending = false;
      return value.receipt;
    } catch (error) {
      drop(fileId, slot);
      throw error;
    }
  }
  function prepare(intent: 'user-request', fileId: string, options: { signal?: AbortSignal; refresh?: boolean } = {}) {
    check();
    if (intent !== 'user-request') fail('intent');
    if (options.signal?.aborted) throw new DOMException('File preparation cancelled.', 'AbortError');
    const selected = selectPreparationFile(e, fileId),
      old = slots.get(fileId);
    if (old?.pending) {
      if (old.signal === options.signal && old.refresh === (options.refresh === true)) return old.promise;
      fail('busy');
    }
    if (old?.value && !options.refresh) return Promise.resolve(old.value.receipt);
    const rest = [...slots.entries()].filter(([id]) => id !== fileId);
    if (
      rest.length >= PRIVATE_FILE_MEMORY_LIMITS.entries ||
      rest.reduce((n, [, slot]) => n + slot.selected.size_bytes, 0) + selected.size_bytes >
        PRIVATE_FILE_MEMORY_LIMITS.bytes
    )
      fail('limit');
    if (old) drop(fileId, old);
    const controller = new AbortController(),
      cancel = () => controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    const slot: Slot = {
      selected,
      controller,
      signal: options.signal,
      refresh: options.refresh === true,
      pending: true,
      promise: Promise.resolve(undefined as never),
      leases: new Set(),
    };
    slots.set(fileId, slot);
    slot.promise = capture(fileId, slot).finally(() => options.signal?.removeEventListener('abort', cancel));
    return slot.promise;
  }

  return {
    prepare,
    inspect: (saved: PreparedFileRead, files: readonly string[], signal?: AbortSignal) =>
      inspectFiles({ check, owner, slots, lifetime: lifetime.signal }, saved, files, signal),
    borrow: (saved: PreparedFileRead, fileId: string, signal?: AbortSignal) =>
      borrowFile({ check, owner, slots, urls }, saved, fileId, signal),
    dispose,
    cancelPending: () => {
      for (const [id, slot] of slots) if (slot.pending) drop(id, slot);
    },
  };
}

async function verifySaved(read: PreparedFileRead, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Saved file read cancelled.', 'AbortError');
  let cancel = () => {};
  try {
    const aborted = new Promise<never>((_, fail) => {
      cancel = () => fail(new DOMException('Saved file read cancelled.', 'AbortError'));
      signal.addEventListener('abort', cancel, { once: true });
    });
    await Promise.race([read.verify(), aborted]);
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
async function borrowFile(
  {
    check,
    owner,
    slots,
    urls,
  }: {
    check: () => void;
    owner: string;
    slots: Map<string, Slot>;
    urls: { create: (blob: Blob) => string; revoke: (url: string) => void };
  },
  saved: PreparedFileRead,
  fileId: string,
  signal?: AbortSignal
): Promise<FilePreviewLease> {
  check();
  saved.check();
  if (signal?.aborted) fail('scope');
  if (identity(saved.envelope) !== owner) fail('scope');
  const selected = selectPreparationFile(saved.envelope, fileId),
    slot = slots.get(fileId);
  if (!slot?.value || slot.pending || JSON.stringify(slot.selected) !== JSON.stringify(selected)) fail('missing');
  const lifetime = signal ? AbortSignal.any([signal, slot.controller.signal]) : slot.controller.signal;
  await verifySaved(saved, lifetime);
  check();
  saved.check();
  if (signal?.aborted || slots.get(fileId) !== slot || !slot.value || identity(saved.envelope) !== owner) fail('scope');
  const url = urls.create(slot.value.blob);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    slot.leases.delete(release);
    lifetime.removeEventListener('abort', release);
    urls.revoke(url);
    notifyFilePreviewChange();
  };
  const current = () => {
    try {
      check();
      saved.check();
      return (
        !released && slots.get(fileId) === slot && !slot.pending && !!slot.value && identity(saved.envelope) === owner
      );
    } catch {
      release();
      return false;
    }
  };
  slot.leases.add(release);
  lifetime.addEventListener('abort', release, { once: true });
  if (lifetime.aborted || !url.startsWith('blob:') || !current()) {
    release();
    fail('scope');
  }
  return { url, current, release };
}

/** Read-only residency observation: no acquisition, URL, eviction or private byte exposure. */
async function inspectFiles(
  context: { check: () => void; owner: string; slots: Map<string, Slot>; lifetime: AbortSignal },
  saved: PreparedFileRead,
  files: readonly string[],
  signal?: AbortSignal
): Promise<PreparedFileState[]> {
  const check = () => {
    context.check();
    saved.check();
    if (identity(saved.envelope) !== context.owner) fail('scope');
  };
  check();
  if (files.length > 32 || new Set(files).size !== files.length) fail('limit');
  for (const id of files) selectPreparationFile(saved.envelope, id);
  await verifySaved(saved, signal ? AbortSignal.any([signal, context.lifetime]) : context.lifetime);
  if (signal?.aborted || context.lifetime.aborted) throw new DOMException('Residency check cancelled.', 'AbortError');
  check();
  return files.map((fileId) => {
    const slot = context.slots.get(fileId);
    return {
      fileId,
      status:
        !slot || slot.controller.signal.aborted
          ? 'missing'
          : slot.pending
            ? 'pending'
            : slot.value
              ? 'ready'
              : 'missing',
    };
  });
}
