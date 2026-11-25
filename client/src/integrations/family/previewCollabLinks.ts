import { collabLinkCreateRequestSchema } from '@trek/shared';
import { z } from 'zod';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { hasReadOnlyBuild } from '../../db/readOnlySession';
import { FamilyApiError } from './errors';
import type { FamilyIdentityRegistry } from './identity';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import type { FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';

const address = z.string().trim().max(2048).pipe(collabLinkCreateRequestSchema.shape.url).transform((value, context) => {
  const url = new URL(value);
  if (url.username || url.password || url.href.length > 2048) {
    context.addIssue({ code: 'custom', message: 'Enter an HTTP or HTTPS website address without credentials.' });
    return z.NEVER;
  }
  return url.href;
});
const title = z.string().trim().min(1).max(160);
const link = z.object({
  id: z.uuid(), title, url: address, pinned: z.boolean(), revision: z.number().int().positive(),
  created_at: z.string(), trashed_at: z.string().nullable(),
});
const boardSchema = z.object({ trip_id: z.uuid(), links: z.array(link), trashed_links: z.array(link), can_edit: z.boolean() });
const saveSchema = z.object({ trip_id: z.uuid(), link });
const actionPayload = z.strictObject({ operationId: z.uuidv4(), expectedRevision: z.number().int().positive() });
const savePayload = z.strictObject({
  operationId: z.uuidv4(),
  expectedRevision: z.number().int().positive().optional(),
  title,
  url: address,
});

function linkRequest(tripId: string, suffix: string, request: FamilyRequest, ids: FamilyIdentityRegistry) {
  if (request.query.size) throw new FamilyApiError(405, 'collab_links_unavailable', 'This shared link action is unavailable.');
  const client = getSupabaseBrowserClient();
  if (request.method === 'GET' && suffix === 'collab/links')
    return { kind: 'board', rpc: client.rpc('get_family_trip_collab_links_v1', { p_trip_id: tripId }) } as const;
  const action = request.method === 'POST' ? /^collab\/links\/(\d+)\/(pin|unpin|trash|restore)$/.exec(suffix) : null;
  if (action) {
    const input = actionPayload.safeParse(request.body);
    if (!input.success) throw new FamilyApiError(422, 'collab_link_invalid', 'Open the link again before changing it.');
    return {
      kind: 'action',
      rpc: client.rpc('manage_family_trip_collab_link_v1', {
        p_trip_id: tripId,
        p_link_id: ids.uuid('collabLink', action[1]),
        p_operation_id: input.data.operationId,
        p_expected_revision: input.data.expectedRevision,
        p_action: action[2],
      }),
    } as const;
  }

  const create = request.method === 'POST' && suffix === 'collab/links';
  const linkId = request.method === 'PUT' ? /^collab\/links\/(\d+)$/.exec(suffix)?.[1] : undefined;
  if (!create && linkId === undefined)
    throw new FamilyApiError(405, 'collab_links_unavailable', 'This shared link action is unavailable.');
  const parsed = savePayload.safeParse(request.body);
  if (!parsed.success || (parsed.data.expectedRevision === undefined) !== create)
    throw new FamilyApiError(422, 'collab_link_invalid', 'Enter a title and a valid HTTP or HTTPS website address without credentials.');
  const input = parsed.data;
  return {
    kind: 'save',
    rpc: client.rpc('save_family_trip_collab_link_v1', {
      p_trip_id: tripId,
      p_link_id: linkId === undefined ? null : ids.uuid('collabLink', linkId),
      p_operation_id: input.operationId,
      p_expected_revision: input.expectedRevision ?? null,
      p_title: input.title,
      p_url: input.url,
    }),
  } as const;
}

export async function handlePreviewCollabLinks(repo: FamilyFrontendRepository, tripId: string, suffix: string, request: FamilyRequest) {
  if (isEffectivelyOffline()) throw new FamilyApiError(503, 'collab_offline', 'Connect to use shared links.');
  const scope = repo.captureContext(tripId);
  const { ids } = await scope.perform(() => repo.views());
  const { kind, rpc } = linkRequest(tripId, suffix, request, ids);
  const { data, error } = await scope.perform(async () => (request.signal ? rpc.abortSignal(request.signal) : rpc));
  if (error?.code === '42501')
    throw new FamilyApiError(403, 'collab_links_denied', 'Shared links are unavailable for this trip or session.');
  if (error?.code === 'PT409')
    throw new FamilyApiError(409, 'collab_link_conflict', kind === 'action'
      ? 'The link changed. Refresh Links and check its current state.'
      : 'The link or this save changed. Copy any unsaved details, then reopen Links.');
  if (error?.code === '22023')
    throw new FamilyApiError(422, 'collab_link_invalid', 'Enter a title and a valid HTTP or HTTPS website address.');
  if (error) throw new FamilyApiError(503, 'collab_links_unavailable', 'Shared links are temporarily unavailable.');

  const view = (row: z.infer<typeof link>) => ({ ...row, id: ids.register('collabLink', row.id) });
  if (kind === 'board') {
    const board = boardSchema.safeParse(data);
    if (board.success && board.data.trip_id === tripId) {
      const canEdit = board.data.can_edit && !hasReadOnlyBuild();
      return {
        links: board.data.links.map(view),
        trashed_links: canEdit ? board.data.trashed_links.map(view) : [],
        can_edit: canEdit,
      };
    }
  } else {
    const saved = saveSchema.safeParse(data);
    if (saved.success && saved.data.trip_id === tripId) return { link: view(saved.data.link) };
  }
  throw new FamilyApiError(503, 'collab_links_unavailable', 'Shared links are temporarily unavailable.');
}
