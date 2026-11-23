import { extractBookingFiles, importItemToTransportDraft, type FamilyImportItem } from '@family/backend/booking-import';
import type { BookingImportPreviewItem, BookingImportPreviewResponse } from '@trek/shared';
import { getImportFiles } from '../../db/offlineDb';
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
function importPreview(item: FamilyImportItem, index: number): BookingImportPreviewItem {
  const transport = item.kind === 'transport' ? importItemToTransportDraft(item, []) : null;
  return {
    type: item.type,
    title: item.title,
    reservation_time: item.startsAt,
    reservation_end_time: item.endsAt,
    confirmation_number: item.confirmationCode,
    location: item.location,
    needs_review: true,
    metadata: item.url ? { url: item.url } : {},
    ...(item.venueName ? { _venue: { name: item.venueName } } : {}),
    ...(transport
      ? {
          endpoints: transport.endpoints.map((endpoint, sequence) => ({
            role:
              sequence === 0
                ? ('from' as const)
                : sequence === transport.endpoints.length - 1
                  ? ('to' as const)
                  : ('stop' as const),
            sequence,
            name: endpoint.name ?? '',
            code: endpoint.code ?? null,
            lat: endpoint.latitude ?? null,
            lng: endpoint.longitude ?? null,
            timezone: endpoint.timeZone ?? null,
            local_time: endpoint.localTime ?? null,
            local_date: endpoint.localDate ?? null,
          })),
        }
      : {}),
    source: { fileName: item.sourceFileName, index },
  };
}
type Job = {
  userId: string;
  tripId: string;
  status: 'running' | 'done' | 'error';
  done: number;
  total: number;
  result?: BookingImportPreviewResponse;
  error?: string;
};
const jobs = new Map<string, Job>();
function parse(id: string, job: Job, files: File[], viewTripId: string) {
  jobs.set(id, job);
  void extractBookingFiles(files).then(
    (result) => {
      if (jobs.get(id) !== job) return;
      job.result = { items: result.items.map(importPreview), warnings: result.warnings };
      job.status = 'done';
      job.done = files.length;
      useBackgroundTasksStore.getState().setDone(id, viewTripId, job.result.items, job.result.warnings);
    },
    (error) => {
      if (jobs.get(id) !== job) return;
      job.status = 'error';
      job.error = error instanceof Error ? error.message : 'Booking extraction failed.';
      useBackgroundTasksStore.getState().setError(id, viewTripId, job.error);
    }
  );
}
export async function startFamilyImport(repo: FamilyFrontendRepository, tripId: string, files: File[]) {
  const session = await repo.session(),
    v = await repo.views();
  await repo.core(tripId);
  if (
    !files.length ||
    files.length > 5 ||
    files.some((file) => file.size > 10 * 1024 * 1024 || !/\.(eml|pdf|pkpass|html?|txt)$/i.test(file.name))
  )
    throw new FamilyApiError(
      422,
      'invalid_import_files',
      'Choose up to five booking documents, each no larger than 10 MB.'
    );
  const jobId = `family-local-${crypto.randomUUID()}`;
  parse(
    jobId,
    { userId: session.userId, tripId, status: 'running', done: 0, total: files.length },
    files,
    String(v.ids.register('trip', tripId))
  );
  return { jobId };
}
export async function familyImportStatus(repo: FamilyFrontendRepository, tripId: string, jobId: string) {
  const session = await repo.session(),
    v = await repo.views();
  await repo.core(tripId);
  let job = jobs.get(jobId);
  if (!job && /^family-local-[0-9a-f-]{36}$/.test(jobId)) {
    const task = useBackgroundTasksStore
      .getState()
      .tasks.find((task) => task.id === jobId && task.tripId === String(v.ids.register('trip', tripId)));
    if (task) {
      const files = await getImportFiles(jobId);
      if (files.length) {
        job = { userId: session.userId, tripId, status: 'running', done: 0, total: files.length };
        parse(jobId, job, files, task.tripId);
      }
    }
  }
  if (!job || job.userId !== session.userId || job.tripId !== tripId)
    throw new FamilyApiError(404, 'import_unavailable', 'This import is unavailable.');
  return { status: job.status, done: job.done, total: job.total, result: job.result, error: job.error };
}
export function clearFamilyImportJobs() {
  jobs.clear();
}
