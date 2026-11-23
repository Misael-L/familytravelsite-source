import { TRIP_FILE_ACCEPT, TRIP_FILE_MAX_BYTES, type FamilyTripFile } from '@family/backend/supabase/tripFiles';
import type { StoredCompleteTrip } from './completeTripV4';
import { readObservedFileWithBody } from './filePreview';
import { privateFilePreparationSource } from './offlineTripQualification';
import type { FamilyFrontendRepository } from './repository';

type SavedFile = StoredCompleteTrip['data']['companions']['files'][number];
export type PrivateFilePreparationRead = {
  envelope: StoredCompleteTrip;
  check: () => void;
  verify: () => Promise<void>;
};
export class PrivateFileAcquisitionError extends Error {
  constructor(public readonly code: 'intent' | 'scope' | 'metadata' | 'content' | 'limit') {
    super('Private file acquisition refused: ' + code);
    this.name = 'PrivateFileAcquisitionError';
  }
}
function reject(code: PrivateFileAcquisitionError['code']): never {
  throw new PrivateFileAcquisitionError(code);
}
function mime(value: string | null) {
  const normalized = (value ?? '').split(';')[0].trim().toLowerCase();
  if (!TRIP_FILE_ACCEPT.includes(normalized)) reject('metadata');
  return normalized;
}
/** This is an unversioned metadata binding, not an immutable server content identifier. */
export function selectPreparationFile(envelope: StoredCompleteTrip, fileId: string) {
  const row = envelope.data.companions.files.find((f) => f.id === fileId);
  if (
    !['family.offline-trip.v2', 'family.offline-trip.v3', 'family.offline-trip.v4'].includes(envelope.format) ||
    envelope.scope.layer !== 'published' ||
    !privateFilePreparationSource(envelope.source, envelope.format) ||
    !row ||
    !row.storage_path ||
    row.trip_id !== envelope.scope.trip_id ||
    row.deleted_at !== null ||
    !Number.isSafeInteger(row.size_bytes) ||
    row.size_bytes < 0 ||
    row.size_bytes > TRIP_FILE_MAX_BYTES ||
    !envelope.bindings.some((b) => b.kind === 'file' && b.uuid === row.id) ||
    !envelope.media.some((m) => m.kind === 'file' && m.id === row.id && m.reference === row.storage_path) ||
    /^(?:\w+:|\/)|(?:^|\/)\.\.?(?:\/|$)|[?#%\\]/.test(row.storage_path)
  )
    reject('metadata');
  return { ...row, mime_type: mime(row.mime_type) };
}
export function assertObservedPreparationFile(selected: SavedFile, row: FamilyTripFile) {
  if (
    row.id !== selected.id ||
    row.tripId !== selected.trip_id ||
    row.storagePath !== selected.storage_path ||
    row.originalName !== selected.original_name ||
    row.sizeBytes !== selected.size_bytes ||
    row.uploadedBy !== selected.uploaded_by ||
    row.createdAt !== selected.created_at ||
    row.deletedAt !== null ||
    mime(row.mimeType) !== selected.mime_type
  )
    reject('metadata');
}
function checkBody(check: () => void, signal?: AbortSignal) {
  check();
  if (signal?.aborted) throw new DOMException('Private file acquisition cancelled.', 'AbortError');
}
type BodyExpectation = { size_bytes: number; mime_type: string };
function checkedPreparationBody(response: Response, expected: BodyExpectation) {
  if (
    !Number.isSafeInteger(expected.size_bytes) ||
    expected.size_bytes < 0 ||
    expected.size_bytes > TRIP_FILE_MAX_BYTES
  )
    reject('limit');
  if (!response.ok || mime(response.headers.get('content-type')) !== mime(expected.mime_type)) reject('content');
  const length = response.headers.get('content-length'),
    encoded = response.headers.get('content-encoding');
  // Fetch exposes decoded chunks. A compressed representation's length is not the decoded length.
  if (
    length !== null &&
    (!/^(?:0|[1-9][0-9]*)$/.test(length) ||
      !Number.isSafeInteger(Number(length)) ||
      ((!encoded || encoded === 'identity') && Number(length) !== expected.size_bytes))
  )
    reject('content');
  if (!response.body) reject('content');
  return response.body;
}
/** Bound decoded bytes while reading; never use blob() as an unbounded fallback. */
export async function readPreparationFileBody({
  response,
  expected,
  check,
  signal,
}: {
  response: Response;
  expected: BodyExpectation;
  check: () => void;
  signal?: AbortSignal;
}) {
  let stream: ReadableStream<Uint8Array>;
  try {
    checkBody(check, signal);
    stream = checkedPreparationBody(response, expected);
  } catch (error) {
    // Header/admission refusal must also release a response that has not been consumed.
    void response.body?.cancel().catch(() => false);
    throw error;
  }
  const reader = stream.getReader(),
    parts: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  const abort = () => {
    void reader.cancel().catch(() => false);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    checkBody(check, signal);
    while (true) {
      const part = await reader.read();
      checkBody(check, signal);
      if (part.done) break;
      total += part.value.byteLength;
      if (total > expected.size_bytes || total > TRIP_FILE_MAX_BYTES) reject('limit');
      parts.push(new Uint8Array(part.value));
    }
    if (total !== expected.size_bytes) reject('content');
    return new Blob(parts, { type: mime(expected.mime_type) });
  } finally {
    signal?.removeEventListener('abort', abort);
    // Never let a stalled producer prevent refusal/cancellation from settling.
    void reader.cancel().catch(() => false);
    reader.releaseLock();
  }
}
function checkedSignedUrl(value: RequestInfo | URL, source: string, row: SavedFile) {
  if (typeof value !== 'string') reject('content');
  const url = new URL(value),
    prefix = '/storage/v1/object/sign/trip-files/';
  if (
    url.origin !== source ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.startsWith(prefix) ||
    decodeURIComponent(url.pathname.slice(prefix.length)) !== row.storage_path ||
    url.searchParams.getAll('token').length !== 1 ||
    !url.searchParams.get('token') ||
    [...url.searchParams.keys()].some((k) => !['token', 'download'].includes(k))
  )
    reject('content');
}
type AcquisitionInput = {
  repo: FamilyFrontendRepository;
  read: PrivateFilePreparationRead;
  fileId: string;
  intent: 'user-request';
  network?: typeof fetch;
  signal?: AbortSignal;
};
async function acquireBoundFile({ repo, read, fileId, intent, network = fetch, signal }: AcquisitionInput) {
  if (intent !== 'user-request') reject('intent');
  const e = read.envelope,
    selected = selectPreparationFile(e, fileId),
    identity = JSON.stringify([
      e.generation,
      e.digest,
      e.source,
      e.scope,
      e.ownership,
      e.verifiedAt,
      e.expiresAt,
      selected,
    ]),
    context = repo.captureContext(e.scope.trip_id);
  function check() {
    read.check();
    context.assertCurrent();
    if (
      Date.now() < e.verifiedAt ||
      Date.now() >= e.expiresAt ||
      identity !==
        JSON.stringify([
          e.generation,
          e.digest,
          e.source,
          e.scope,
          e.ownership,
          e.verifiedAt,
          e.expiresAt,
          selectPreparationFile(e, fileId),
        ])
    )
      reject('scope');
    checkBody(() => {}, signal);
  }
  const verify = async () => {
    check();
    await read.verify();
    check();
  };
  await verify();
  const session = await context.perform(() => repo.session());
  if (
    session.userId !== e.scope.user_id ||
    session.personId !== e.scope.person_id ||
    session.familyId !== e.scope.family_id
  )
    reject('scope');
  const observation = await context.perform(() => repo.observeFile(fileId));
  assertObservedPreparationFile(selected, observation.row);
  await verify();
  const blob = await readObservedFileWithBody({
    repo,
    observation,
    signal,
    network: async (url, init) => {
      check();
      checkedSignedUrl(url, e.source, selected);
      return network(url, { ...init, cache: 'no-store' });
    },
    readBody: (response) => readPreparationFileBody({ response, expected: selected, check, signal }),
  });
  await verify();
  // Re-read real RLS metadata after the body. This is not a transactional Storage-version proof.
  const after = await context.perform(() => repo.observeFile(fileId));
  assertObservedPreparationFile(selected, after.row);
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  await verify();
  return {
    blob,
    receipt: {
      format: 'family.private-file-acquisition.v1' as const,
      source: e.source,
      scope: { ...e.scope },
      ownership: { ...e.ownership },
      generation: e.generation,
      snapshotDigest: e.digest,
      file: { id: selected.id, storagePath: selected.storage_path, createdAt: selected.created_at },
      content: {
        bytes: blob.size,
        mime: blob.type,
        sha256: Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join(''),
      },
      observedAt: Date.now(),
      expiresAt: e.expiresAt,
      serverContentVersion: 'unversioned' as const,
      persisted: false as const,
    },
  };
}

/** Explicit one-file acquisition with its own deadline, scope watch and caller cancellation. */
export async function acquirePreparationFile(input: AcquisitionInput) {
  const controller = new AbortController(),
    signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal,
    context = input.repo.captureContext(input.read.envelope.scope.trip_id),
    lifetime = Math.max(0, input.read.envelope.expiresAt - Date.now()),
    deadline = performance.now() + lifetime;
  const retire = () => {
    try {
      input.read.check();
      context.assertCurrent();
      const e = input.read.envelope;
      if (Date.now() < e.verifiedAt || Date.now() >= e.expiresAt || performance.now() >= deadline) reject('scope');
    } catch (error) {
      controller.abort(error);
    }
  };
  const timer = setTimeout(retire, lifetime),
    watch = setInterval(retire, 1000);
  let cancel = () => {};
  try {
    retire();
    if (signal.aborted) throw signal.reason;
    const cancelled = new Promise<never>((_, fail) => {
      cancel = () => fail(signal.reason);
      signal.addEventListener('abort', cancel, { once: true });
    });
    // SDK signing/metadata promises may not accept AbortSignal. Their late result is still fenced,
    // while cancellation can settle this caller without waiting for that remote promise.
    const result = await Promise.race([acquireBoundFile({ ...input, signal }), cancelled]);
    retire();
    if (signal.aborted) throw signal.reason;
    return result;
  } finally {
    clearTimeout(timer);
    clearInterval(watch);
    signal.removeEventListener('abort', cancel);
  }
}
