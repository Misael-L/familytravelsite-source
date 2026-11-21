import { TRIP_FILE_MAX_BYTES } from '@family/backend/supabase/tripFiles';
import { notifyFilePreviewChange, type FilePreviewLease, type FilePreviewPort } from '../../repo/filePreview';
import {
  currentPreparedFilePool,
  currentSavedFilePreview,
  retireObservedFilePool,
} from '../../repo/preparedFilePreview';
import { isAuthed } from '../../sync/authGate';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { onPrivateSessionEnd } from '../../sync/privateSessionEvents';
import { captureReadSession, type ReadSession } from '../../sync/readSession';
import { onFamilyActorChange } from './actorEvents';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

type Observation = Awaited<ReturnType<FamilyFrontendRepository['observeFile']>>;
export function familyFileKey(value: string, origin: string): string {
  if (!value || value.startsWith('//') || value.includes('\\')) throw unavailable();
  const url = new URL(value, origin);
  const match = url.pathname.match(
    /^\/api\/family\/files\/([1-9][0-9]*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/open$/i
  );
  if (url.origin !== origin || url.username || url.password || !match) throw unavailable();
  return match[1];
}
function unavailable() {
  return new FamilyApiError(404, 'file_unavailable', 'This file preview is unavailable.');
}
function assertSignal(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('The original file request was cancelled.', 'AbortError');
}
/** Read the whole response under the same observation, including the asynchronous body. */
export async function readObservedFileWithBody({
  repo,
  observation,
  network,
  signal,
  readBody,
}: {
  repo: FamilyFrontendRepository;
  observation: Observation;
  network: typeof fetch;
  signal?: AbortSignal;
  readBody: (response: Response) => Promise<Blob>;
}): Promise<Blob> {
  assertSignal(signal);
  if (observation.row.sizeBytes > TRIP_FILE_MAX_BYTES) throw unavailable();
  const url = await observation.perform(() => repo.readers.files.signedTripFileUrl(observation.row.storagePath, 120));
  assertSignal(signal);
  const response = await observation.perform(() => network(url, { signal, credentials: 'omit', redirect: 'error' }));
  assertSignal(signal);
  if (!response.ok)
    throw new FamilyApiError(
      response.status >= 400 ? response.status : 503,
      'file_download_unavailable',
      'This file could not be opened.'
    );
  if (Number(response.headers.get('content-length')) > TRIP_FILE_MAX_BYTES) throw unavailable();
  const blob = await observation.perform(() => readBody(response));
  assertSignal(signal);
  if (blob.size > TRIP_FILE_MAX_BYTES) throw unavailable();
  return blob;
}

/** Preserve the existing online preview policy; preparation opts into stricter streamed consumption. */
export function readObservedFile(
  repo: FamilyFrontendRepository,
  observation: Observation,
  network: typeof fetch,
  signal?: AbortSignal
): Promise<Blob> {
  return readObservedFileWithBody({ repo, observation, network, signal, readBody: (response) => response.blob() });
}

async function readCachedFile({
  repo,
  owner,
  key,
  value,
  origin,
}: {
  repo: FamilyFrontendRepository;
  owner: ReadSession;
  key: string;
  value: string;
  origin: string;
}) {
  const views = repo.knownViews();
  if (!views) throw unavailable();
  const uuid = views.ids.uuid('file', key),
    id = views.ids.register('file', uuid);
  const path = new URL(value, origin).pathname;
  const cached = await owner.db.transaction('r', [owner.db.tripFiles, owner.db.blobCache, owner.db.trips], async () => {
    const file = await owner.db.tripFiles.get(id);
    if (!file || file.deleted_at || !file.url || views.ids.uuid('file', familyFileKey(file.url, origin)) !== uuid)
      throw unavailable();
    const bytes =
      (await owner.db.blobCache.get(value)) ??
      (await owner.db.blobCache.get(path)) ??
      (await owner.db.blobCache.get(file.url));
    if (
      !bytes ||
      bytes.tripId !== file.trip_id ||
      bytes.bytes > TRIP_FILE_MAX_BYTES ||
      bytes.blob.size > TRIP_FILE_MAX_BYTES ||
      !(await owner.db.trips.get(file.trip_id))
    )
      throw unavailable();
    return { file, bytes };
  });
  owner.assertCurrent();
  const tripId = views.ids.uuid('trip', cached.file.trip_id);
  const trip = repo.captureContext(tripId);
  const assertFile = () => trip.assertCurrent();
  const blob = cached.bytes.blob.type
    ? cached.bytes.blob
    : new Blob([cached.bytes.blob], { type: cached.bytes.mime || 'application/octet-stream' });

  return { tripId, assertFile, blob };
}

/** Family private bytes become temporary browser URLs; native download tokens never enter this path. */
export function createFamilyFilePreviewPort(
  repo: FamilyFrontendRepository,
  network: typeof fetch,
  origin: string
): FilePreviewPort {
  let disposed = false;
  const jobs = new Set<{ controller: AbortController; tripId: string | null }>();
  const leases = new Set<{ tripId: string; release: () => void }>();
  const retire = (tripId?: string) => {
    for (const job of jobs) if (!tripId || job.tripId === null || job.tripId === tripId) job.controller.abort();
    for (const lease of [...leases]) if (!tripId || lease.tripId === tripId) lease.release();
  };
  const stopSession = onPrivateSessionEnd(() => retire());
  const stopActor = onFamilyActorChange(() => retire());
  const stopTrip = repo.subscribeContext((trip) => retire(trip));
  return {
    async acquire(value, signal) {
      if (disposed) throw unavailable();
      const saved = isEffectivelyOffline() ? currentSavedFilePreview() : null;
      if (saved) return saved.acquire(value, signal);
      const observedPool = currentPreparedFilePool();
      // The saved owner opens asynchronously after disconnect. Until it is installed,
      // refuse without using native blobs or treating a local miss as a live access denial.
      if (isEffectivelyOffline() && observedPool) throw unavailable();
      const key = familyFileKey(value, origin),
        owner = captureReadSession(),
        context = repo.captureContext();
      const job = { controller: new AbortController(), tripId: null as string | null };
      const assertCurrent = () => {
        if (disposed || !isAuthed()) throw unavailable();
        owner.assertCurrent();
        context.assertCurrent();
        assertSignal(job.controller.signal);
      };
      assertCurrent();
      assertSignal(signal);
      const cancel = () => job.controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      jobs.add(job);
      try {
        let blob: Blob, tripId: string, assertFile: () => void;
        if (isEffectivelyOffline()) {
          ({ tripId, assertFile, blob } = await readCachedFile({ repo, owner, key, value, origin }));
        } else {
          const file = await repo.observeFile(key);
          assertCurrent();
          tripId = file.row.tripId;
          job.tripId = tripId;
          assertFile = file.assertCurrent;
          blob = await readObservedFile(repo, file, network, job.controller.signal);
        }
        assertCurrent();
        assertFile();
        const url = URL.createObjectURL(blob);
        let released = false;
        const entry = {
          tripId,
          release: () => {
            if (released) return;
            released = true;
            leases.delete(entry);
            URL.revokeObjectURL(url);
            notifyFilePreviewChange();
          },
        };
        const lease: FilePreviewLease = {
          url,
          release: entry.release,
          current: () => {
            if (released) return false;
            try {
              assertCurrent();
              assertFile();
              return true;
            } catch {
              return false;
            }
          },
        };
        leases.add(entry);
        return lease;
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) retireObservedFilePool(observedPool);
        throw error;
      } finally {
        jobs.delete(job);
        signal?.removeEventListener('abort', cancel);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopSession();
      stopActor();
      stopTrip();
      retire();
    },
  };
}
