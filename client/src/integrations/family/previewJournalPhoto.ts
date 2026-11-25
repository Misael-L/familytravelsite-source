import { z } from 'zod';
import { isEffectivelyOffline } from '../../sync/networkMode';
import type { FamilyIdentityRegistry } from './identity';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import { JOURNEY_IMAGE_MAX_BYTES, uploadJourneyImage } from './legacy/data/supabase/journeys';
import { handlePreviewJournalText } from './previewJournalText';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { scopeFamilyOperations } from './requestContext';
import type { FamilyRequest } from './transport';

const attachment = z.object({
  entryId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  revision: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  uploadId: z.uuidv4(),
});
const numberId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const photoChange = z.strictObject({
  action: z.enum(['remove-photo', 'restore-photo']),
  entryId: numberId,
  photoId: numberId,
  revision: numberId,
});
const photoState = z.object({
  revision: numberId,
  photos: z.array(z.object({ id: z.uuid(), attached: z.boolean() })),
});

export type PreviewJournalPhotoChange = z.infer<typeof photoChange>;
export type PreviewJournalPhotoState = { revision: number; photos: { id: number; attached: boolean }[] };

function parsePhotoRequest(request: FamilyRequest) {
  if (request.method === 'GET' && request.query.size === 1 && request.query.has('entryId')) {
    const entryId = numberId.safeParse(Number(request.query.get('entryId')));
    if (entryId.success) return { entryId: entryId.data, command: null };
  }
  if (request.method === 'PATCH' && !request.query.size) {
    const change = photoChange.safeParse(request.body);
    if (change.success) return { entryId: change.data.entryId, command: change.data };
  }
  throw new FamilyApiError(422, 'invalid_journal_photo_action', 'Choose a saved entry and photo.');
}

async function changePhotoLink(request: FamilyRequest, ids: FamilyIdentityRegistry, tripId: string, journeyId: string) {
  if (isEffectivelyOffline()) throw new FamilyApiError(503, 'journal_offline', 'Connect to edit Journal photos.');
  const { entryId, command } = parsePhotoRequest(request);
  const photoId = command ? ids.uuid('journeyPhoto', command.photoId) : null;
  const rpc = getSupabaseBrowserClient().rpc('manage_family_trip_journal_photo_v1', {
    p_trip_id: tripId,
    p_journey_id: journeyId,
    p_entry_id: ids.uuid('journeyEntry', entryId),
    p_action: command?.action ?? 'list',
    p_photo_id: photoId,
    p_expected_revision: command?.revision ?? null,
  });
  const { data, error } = await (request.signal ? rpc.abortSignal(request.signal) : rpc);
  if (error?.code === 'PT409')
    throw new FamilyApiError(409, 'journal_entry_changed', 'This entry changed. Reload entries before changing its photos.');
  if (error?.code === '42501')
    throw new FamilyApiError(403, 'journal_photo_denied', 'You no longer have access to manage these photos.');
  const state = photoState.safeParse(data);
  if (error || !state.success)
    throw new FamilyApiError(503, 'journal_photo_unavailable', 'The photo change could not be confirmed. Try again.');
  if (command) {
    const attached = state.data.photos.find(photo => photo.id === photoId)?.attached;
    if (state.data.revision < command.revision || attached !== (command.action === 'restore-photo'))
      throw new FamilyApiError(503, 'journal_photo_unconfirmed', 'The photo change could not be confirmed. Try again.');
    return handlePreviewJournalText({ ...request, method: 'GET', body: undefined }, ids, tripId, journeyId);
  }
  return {
    revision: state.data.revision,
    photos: state.data.photos.map(photo => ({ ...photo, id: ids.register('journeyPhoto', photo.id) })),
  } satisfies PreviewJournalPhotoState;
}

function attachmentError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'journal_entry_changed':
      return new FamilyApiError(409, code, 'This entry changed. Reload it before attaching a photo.');
    case 'journal_photo_denied':
      return new FamilyApiError(403, code, 'You no longer have access to add a photo to this entry.');
    case 'too-large':
    case 'bad-type':
    case 'content_rejected':
    case 'size_or_mime_rejected':
      return new FamilyApiError(422, 'invalid_journal_photo', 'Choose a supported image no larger than 8 MiB.');
    default:
      return new FamilyApiError(503, 'journal_photo_unavailable', 'The attachment could not be confirmed. Retry the same photo.');
  }
}

export async function handlePreviewJournalPhoto(
  request: FamilyRequest,
  repo: FamilyFrontendRepository,
  ids: FamilyIdentityRegistry,
  tripId: string,
  journeyId: string
) {
  if (request.method === 'GET' || request.method === 'PATCH')
    return changePhotoLink(request, ids, tripId, journeyId);
  if (request.method !== 'POST' || request.query.size || !(request.body instanceof FormData))
    throw new FamilyApiError(405, 'journal_photo_method', 'Select a photo to attach to this entry.');
  const file = request.body.get('photo');
  const fields = attachment.safeParse({
    entryId: request.body.get('entryId'), revision: request.body.get('revision'), uploadId: request.body.get('uploadId'),
  });
  if (!fields.success || request.body.getAll('photo').length !== 1 ||
      !(file instanceof File) || file.size < 1 || file.size > JOURNEY_IMAGE_MAX_BYTES)
    throw new FamilyApiError(422, 'invalid_journal_photo', 'Choose one image no larger than 8 MiB.');

  const { entryId, revision, uploadId } = fields.data;
  const read = () => handlePreviewJournalText({ ...request, method: 'GET', body: undefined }, ids, tripId, journeyId);
  const existing = (await read()).some(entry => entry.id === entryId && !entry.trashed);
  if (!existing) throw new FamilyApiError(409, 'journal_entry_changed', 'This entry changed. Reload it before attaching a photo.');
  const { familyId } = await repo.session();
  const uploader = scopeFamilyOperations(repo, { uploadJourneyImage }, repo.captureContext(tripId, { revision: false }));
  try {
    await uploader.uploadJourneyImage({
      familyId, journeyId, file, entryId: ids.uuid('journeyEntry', entryId),
      linkedEntry: { tripId, expectedRevision: revision, uploadId },
    });
  } catch (error) {
    if (error instanceof FamilyApiError) throw error;
    throw attachmentError(error);
  }
  return read();
}
