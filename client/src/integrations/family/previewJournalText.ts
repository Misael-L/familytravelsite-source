import { z } from 'zod';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { FamilyApiError } from './errors';
import type { FamilyIdentityRegistry } from './identity';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import type { FamilyRequest } from './transport';

const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const entryId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const command = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('create'),
    operationId: z.uuidv4(),
    entryDate: z.iso.date(),
    title: z.string().max(200),
    story: z.string().max(20000),
  }),
  z.strictObject({
    action: z.literal('edit'),
    entryId,
    revision,
    title: z.string().max(200),
    story: z.string().max(20000),
  }),
  z.strictObject({ action: z.literal('trash'), entryId, revision }),
  z.strictObject({ action: z.literal('restore'), entryId, revision }),
]);
const stories = z.array(
  z.object({
    id: z.string().uuid(),
    revision,
    title: z.string().nullable(),
    story: z.string().nullable(),
    entry_date: z.string(),
    trashed: z.boolean(),
  })
);

export type PreviewJournalCommand = z.infer<typeof command>;
export type PreviewJournalStory = Omit<z.infer<typeof stories>[number], 'id'> & { id: number };

function readCommand(request: FamilyRequest) {
  if (isEffectivelyOffline()) throw new FamilyApiError(503, 'journal_offline', 'Connect to use the Journal editor.');
  if (request.query.size || !['GET', 'POST'].includes(request.method))
    throw new FamilyApiError(405, 'journal_text_unavailable', 'This Journal action is unavailable.');

  if (request.method === 'GET') return null;
  const parsed = command.safeParse(request.body);
  if (!parsed.success)
    throw new FamilyApiError(422, 'invalid_journal_command', 'The Journal entry or its revision is invalid.');
  return parsed.data;
}

function journalTextRequest(
  input: PreviewJournalCommand | null,
  ids: FamilyIdentityRegistry,
  tripId: string,
  journeyId: string
) {
  const client = getSupabaseBrowserClient();
  return input?.action === 'create'
    ? client.rpc('create_family_trip_journal_text_v1', {
        p_trip_id: tripId,
        p_journey_id: journeyId,
        p_operation_id: input.operationId,
        p_entry_date: input.entryDate,
        p_title: input.title,
        p_story: input.story,
      })
    : client.rpc('family_trip_journal_text_v1', {
        p_trip_id: tripId,
        p_journey_id: journeyId,
        p_action: input?.action ?? 'list',
        p_entry_id: input ? ids.uuid('journeyEntry', input.entryId) : null,
        p_expected_revision: input?.revision ?? null,
        p_title: input?.action === 'edit' ? input.title : null,
        p_story: input?.action === 'edit' ? input.story : null,
      });
}

export async function handlePreviewJournalText(
  request: FamilyRequest,
  ids: FamilyIdentityRegistry,
  tripId: string,
  journeyId: string
): Promise<PreviewJournalStory[]> {
  const input = readCommand(request);
  const rpc = journalTextRequest(input, ids, tripId, journeyId);
  const { data, error } = await (request.signal ? rpc.abortSignal(request.signal) : rpc);
  if (error?.code === '42501')
    throw new FamilyApiError(403, 'journal_edit_denied', 'You no longer have access to edit this Journal.');
  if (error?.code === 'PT409')
    throw new FamilyApiError(
      409,
      'journal_entry_changed',
      input?.action === 'create'
        ? 'This draft was already saved with different text or a different date. Reload entries to find the saved version.'
        : 'This entry changed. Reload entries before saving again.'
    );
  if (error?.code === '22023')
    throw new FamilyApiError(422, 'invalid_journal_command', 'Enter a title or a story before saving.');
  const result = stories.safeParse(data);
  if (error || !result.success)
    throw new FamilyApiError(503, 'journal_text_unavailable', 'The Journal is temporarily unavailable. Try again.');
  return result.data.map((story) => ({ ...story, id: ids.register('journeyEntry', story.id) }));
}
