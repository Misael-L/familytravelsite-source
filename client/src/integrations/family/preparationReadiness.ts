import { currentPreparedFilePool, type PreparedFilePool, type PreparedFileRead } from '../../repo/preparedFilePreview';
import type { SyncOutcome } from '../../sync/tripSyncManager';
import { completePreparationSource } from './offlineTripQualification';
import { selectPreparationFile } from './privateFileAcquisition';
import {
  matchesPublicPreparationImage,
  PUBLIC_IMAGE_PREPARATION_LIMIT,
  selectPublicPreparationImages,
} from './publicImagePreparation';
import { createPublicVariantCache } from './publicVariantCache';

type Cache = Pick<ReturnType<typeof createPublicVariantCache>, 'read'>;
type Counts = { ready: number; missing: number; failed: number };
type Run = {
  read: PreparedFileRead;
  signal: AbortSignal;
  check: () => void;
  verify: () => Promise<void>;
  wait: <T>(work: () => Promise<T>) => Promise<T>;
};
export class PreparationReadinessError extends Error {
  constructor(public readonly code: 'scope' | 'busy') {
    super('Preparation status refused: ' + code);
    this.name = 'PreparationReadinessError';
  }
}
const identity = (e: PreparedFileRead['envelope']) =>
  JSON.stringify([e.format, e.source, e.scope, e.ownership, e.generation, e.digest, e.verifiedAt, e.expiresAt]);
async function waitFor<T>(work: () => Promise<T>, signal: AbortSignal, check: () => void) {
  check();
  let cancel = () => {};
  try {
    const aborted = new Promise<never>((_, reject) => {
      cancel = () => reject(new DOMException('Preparation status cancelled.', 'AbortError'));
      signal.addEventListener('abort', cancel, { once: true });
    });
    const value = await Promise.race([work(), aborted]);
    check();
    return value;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
async function inspectImages(run: Run, cache: Cache) {
  const selected = selectPublicPreparationImages(run.read.envelope),
    descriptors = selected.descriptors.slice(0, PUBLIC_IMAGE_PREPARATION_LIMIT),
    counts: Counts = { ready: 0, missing: 0, failed: 0 };
  for (const descriptor of descriptors) {
    await run.verify();
    try {
      const value = await run.wait(() =>
        cache.read(descriptor, {
          signal: run.signal,
          current: () => {
            try {
              run.check();
              return true;
            } catch {
              return false;
            }
          },
        })
      );
      if (value.status === 'miss') counts.missing++;
      else if (matchesPublicPreparationImage(value.receipt, descriptor)) counts.ready++;
      else counts.failed++;
    } catch {
      run.check();
      counts.failed++;
    }
  }
  const eligible = selected.descriptors.length,
    deferred = eligible - descriptors.length;
  return {
    status:
      !eligible && !selected.unavailable
        ? 'empty'
        : counts.ready === eligible && !selected.unavailable
          ? 'complete'
          : 'partial',
    persistence: 'cache-storage' as const,
    counts: {
      ...counts,
      eligible,
      inspected: descriptors.length,
      deferred,
      unavailable: selected.unavailable,
      locationsWithoutCover: selected.locationsWithoutCover,
    },
  };
}
function fileSelection(read: PreparedFileRead) {
  const rows = read.envelope.data.companions.files,
    eligible: string[] = [];
  let unsupported = 0;
  for (const row of rows) {
    try {
      selectPreparationFile(read.envelope, row.id);
      eligible.push(row.id);
    } catch {
      unsupported++;
    }
  }
  return { total: rows.length, eligible, unsupported };
}
async function inspectFiles(run: Run, getPool: () => PreparedFilePool | null) {
  const selected = fileSelection(run.read),
    files = selected.eligible.slice(0, PUBLIC_IMAGE_PREPARATION_LIMIT),
    counts = { ready: 0, pending: 0, missing: files.length, failed: 0 };
  const pool = getPool(),
    inspect = pool?.inspect;
  if (files.length && inspect) {
    try {
      const result = await run.wait(() => inspect(run.read, files, run.signal));
      if (
        getPool() !== pool ||
        result.length !== files.length ||
        new Set(result.map((v) => v.fileId)).size !== files.length ||
        result.some((v) => !files.includes(v.fileId) || !['ready', 'pending', 'missing'].includes(v.status))
      )
        throw new Error('Private residency observation changed.');
      counts.ready = result.filter((v) => v.status === 'ready').length;
      counts.pending = result.filter((v) => v.status === 'pending').length;
      counts.missing = result.filter((v) => v.status === 'missing').length;
    } catch {
      run.check();
      counts.missing = 0;
      counts.failed = files.length;
    }
  }
  return {
    status: !selected.total ? 'empty' : counts.ready === selected.total ? 'complete' : 'partial',
    persistence: 'document-memory' as const,
    afterRestart: selected.total ? 'unavailable' : 'not-needed',
    counts: {
      ...counts,
      total: selected.total,
      inspected: files.length,
      deferred: selected.eligible.length - files.length,
      unsupported: selected.unsupported,
    },
  };
}
async function observe(run: Run, cache: Cache, pool: () => PreparedFilePool | null) {
  await run.verify();
  const publicImages = await inspectImages(run, cache);
  const privateFiles = await inspectFiles(run, pool);
  await run.verify();
  const e = run.read.envelope;
  return {
    format: 'family.preparation-readiness.v1' as const,
    source: e.source,
    scope: { ...e.scope },
    ownership: { ...e.ownership },
    generation: e.generation,
    snapshotDigest: e.digest,
    observedAt: Date.now(),
    expiresAt: e.expiresAt,
    metadata: { status: 'available' as const, persistence: 'indexeddb' as const, expiresAt: e.expiresAt },
    publicImages,
    privateFiles,
    mapSearch: { status: 'unsupported' as const, reason: 'family-map-search-unqualified' as const },
    wholeTripReady: false as const,
    nativeOutcome: { status: 'skipped', reason: 'planner-scope' } satisfies SyncOutcome,
  };
}
/** Fresh, bounded observations only. No capture, acquisition, signing, URL or whole-Trip completion. */
export function createPreparationReadiness(
  read: PreparedFileRead,
  dependencies: { cache?: Cache; privatePool?: () => PreparedFilePool | null } = {}
) {
  read.check();
  const e = read.envelope,
    owner = identity(e),
    deadline = performance.now() + Math.max(0, e.expiresAt - Date.now()),
    lifetime = new AbortController();
  if (
    !['family.offline-trip.v2', 'family.offline-trip.v3'].includes(e.format) ||
    e.scope.layer !== 'published' ||
    !completePreparationSource(e.source, e.format)
  )
    throw new PreparationReadinessError('scope');
  let disposed = false,
    busy = false;
  const check = () => {
    read.check();
    if (
      disposed ||
      identity(e) !== owner ||
      Date.now() < e.verifiedAt ||
      Date.now() >= e.expiresAt ||
      performance.now() >= deadline
    )
      throw new PreparationReadinessError('scope');
  };
  const dispose = () => {
    disposed = true;
    lifetime.abort();
    clearTimeout(expiry);
    clearInterval(watch);
  };
  const expiry = setTimeout(dispose, Math.max(0, e.expiresAt - Date.now()));
  const watch = setInterval(() => {
    try {
      check();
    } catch {
      dispose();
    }
  }, 1000);
  const cache = dependencies.cache ?? createPublicVariantCache({ source: e.source });
  return {
    dispose,
    async inspect(options: { signal?: AbortSignal } = {}) {
      check();
      if (busy) throw new PreparationReadinessError('busy');
      busy = true;
      const signal = options.signal ? AbortSignal.any([options.signal, lifetime.signal]) : lifetime.signal;
      const current = () => {
        check();
        if (signal.aborted) throw new DOMException('Preparation status cancelled.', 'AbortError');
      };
      const wait = <T>(work: () => Promise<T>) => waitFor(work, signal, current);
      const verify = () => wait(() => read.verify());
      try {
        return await observe(
          { read, signal, check: current, wait, verify },
          cache,
          dependencies.privatePool ?? currentPreparedFilePool
        );
      } finally {
        busy = false;
      }
    },
  };
}
