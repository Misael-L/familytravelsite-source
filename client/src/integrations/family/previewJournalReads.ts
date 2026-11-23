import { tripJournalAccessRoleSchema, tripJournalLinkResponseSchema } from '@trek/shared';
import { z } from 'zod';
import { FamilyApiError } from './errors';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import type { FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';

const link = z.object({
  journey_id: z.string().uuid(),
  title: z.string(),
  subtitle: z.string().nullable(),
  owner_id: z.string().uuid(),
  linked_by: z.string().uuid(),
  created_at: z.number().int(),
  my_role: tripJournalAccessRoleSchema,
});
const response = z.object({
  trip_id: z.string().uuid(),
  link: link.nullable(),
  journal: z.record(z.string(), z.unknown()).nullable(),
});

export async function readPreviewJournal(tripId: string, request: FamilyRequest, journeyId?: string) {
  if (request.method !== 'GET' || request.query.size)
    throw new FamilyApiError(405, 'journal_preview_read_only', 'Journal editing is unavailable in this preview.');
  const rpc = getSupabaseBrowserClient().rpc('get_family_trip_journal_v1', {
    p_trip_id: tripId,
    p_journey_id: journeyId ?? null,
  });
  const { data, error } = await (request.signal ? rpc.abortSignal(request.signal) : rpc);
  if (error?.code === '42501')
    throw new FamilyApiError(403, 'journal_access_denied', 'The Journal is unavailable for this trip or session.');
  const answer = response.safeParse(data);
  if (error || !answer.success || answer.data.trip_id !== tripId)
    throw new FamilyApiError(503, 'journal_read_unavailable', 'The Journal is temporarily unavailable.');
  return answer.data;
}

export async function handlePreviewJournalLink(repo: FamilyFrontendRepository, tripId: string, request: FamilyRequest) {
  const context = repo.captureContext(tripId);
  const { ids } = await context.perform(() => repo.views());
  const { link: row } = await context.perform(() => readPreviewJournal(tripId, request));
  return tripJournalLinkResponseSchema.parse({
    link: row && {
      ...row,
      journey_id: ids.register('journey', row.journey_id),
      owner_id: ids.register('person', row.owner_id),
      linked_by: ids.register('person', row.linked_by),
      cover_image: null,
      members: null,
    },
    can_link: false,
    can_unlink: false,
    can_edit_members: false,
  });
}
