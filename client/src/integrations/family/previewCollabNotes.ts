import { z } from 'zod';
import type { CollabNote } from '../../components/Collab/CollabNotes.types';
import { hasReadOnlyBuild } from '../../db/readOnlySession';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { FamilyApiError } from './errors';
import type { FamilyIdentityRegistry } from './identity';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import type { FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';

const note = z.object({
  id: z.string().uuid(),
  author_person_id: z.string().uuid(),
  author_name: z.string().min(1),
  title: z.string(),
  content: z.string(),
  category: z.string(),
  color: z
    .string()
    .regex(/^#[\da-f]{6}$/i)
    .nullable(),
  pinned: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  revision: z.number().int().positive(),
  trashed_at: z.string().nullable(),
});
const boardResult = z.object({
  trip_id: z.string().uuid(),
  notes: z.array(note),
  trashed_notes: z.array(note),
  can_edit: z.boolean(),
});
const saveResult = z.object({ trip_id: z.string().uuid(), note });
const movePayload = z.strictObject({ operationId: z.uuidv4(), expectedRevision: z.number().int().positive() });
const savePayload = z.strictObject({
  operationId: z.uuidv4(),
  expectedRevision: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(160),
  content: z.string().max(20000),
  category: z.string().trim().max(60),
  color: z
    .string()
    .regex(/^#[\da-f]{6}$/i)
    .nullable(),
});

function noteView(
  { id, author_person_id, author_name, color, ...content }: z.infer<typeof note>,
  ids: FamilyIdentityRegistry,
  tripId: string
): CollabNote {
  return {
    ...content,
    id: ids.register('collabNote', id),
    trip_id: ids.register('trip', tripId),
    user_id: ids.register('person', author_person_id),
    username: author_name,
    color: color ?? null,
    website: null,
    avatar: null,
    avatar_url: null,
    attachments: [],
  };
}

function collabRequest(tripId: string, suffix: string, request: FamilyRequest, ids: FamilyIdentityRegistry) {
  const client = getSupabaseBrowserClient();
  if (!request.query.size && suffix === 'collab/notes' && request.method === 'GET')
    return { kind: 'board', rpc: client.rpc('get_family_trip_collab_notes_v1', { p_trip_id: tripId }) } as const;
  const move = request.method === 'POST' && !request.query.size ? /^collab\/notes\/(\d+)\/(trash|restore)$/.exec(suffix) : null;
  if (move) {
    const input = movePayload.safeParse(request.body);
    if (!input.success) throw new FamilyApiError(422, 'collab_note_invalid', 'Open the note again before moving it.');
    return {
      kind: 'move',
      rpc: client.rpc('move_family_trip_collab_note_v1', {
        p_trip_id: tripId,
        p_note_id: ids.uuid('collabNote', move[1]),
        p_operation_id: input.data.operationId,
        p_expected_revision: input.data.expectedRevision,
        p_move_to_trash: move[2] === 'trash',
      }),
    } as const;
  }
  const editId = request.method === 'PUT' ? /^collab\/notes\/(\d+)$/.exec(suffix)?.[1] : undefined;
  const create = request.method === 'POST' && suffix === 'collab/notes';
  if (request.query.size || (!create && editId === undefined))
    throw new FamilyApiError(405, 'collab_preview_unavailable', 'This shared note action is unavailable.');
  const parsed = savePayload.safeParse(request.body);
  if (!parsed.success || (parsed.data.expectedRevision === undefined) !== create)
    throw new FamilyApiError(422, 'collab_note_invalid', 'Enter a valid title and note text.');
  const input = parsed.data;
  return {
    kind: 'save',
    rpc: client.rpc('save_family_trip_collab_note_v1', {
      p_trip_id: tripId,
      p_operation_id: input.operationId,
      p_note_id: editId === undefined ? null : ids.uuid('collabNote', editId),
      p_expected_revision: input.expectedRevision ?? null,
      p_title: input.title,
      p_body: input.content,
      p_category: input.category,
      p_color: input.color,
    }),
  } as const;
}

export async function handlePreviewCollabNotes(
  repo: FamilyFrontendRepository,
  tripId: string,
  suffix: string,
  request: FamilyRequest
) {
  if (isEffectivelyOffline()) throw new FamilyApiError(503, 'collab_offline', 'Connect to use shared notes.');
  const scope = repo.captureContext(tripId);
  const { ids } = await scope.perform(() => repo.views());
  const { kind, rpc } = collabRequest(tripId, suffix, request, ids);
  const { data, error } = await scope.perform(async () => (request.signal ? rpc.abortSignal(request.signal) : rpc));
  if (error?.code === '42501')
    throw new FamilyApiError(403, 'collab_notes_denied', 'Shared notes are unavailable for this trip or session.');
  if (error?.code === 'PT409')
    throw new FamilyApiError(
      409,
      'collab_note_conflict',
      kind === 'move' ? 'The note changed. Refresh Notes and check its current location.' :
        'The note or this save changed. Copy any unsaved text, then reopen Collab and check the saved note.'
    );
  if (error?.code === '22023')
    throw new FamilyApiError(422, 'collab_note_invalid', 'Enter a valid title and note text.');
  if (error) throw new FamilyApiError(503, 'collab_notes_unavailable', 'Shared notes are temporarily unavailable.');
  if (kind === 'board') {
    const board = boardResult.safeParse(data);
    if (board.success && board.data.trip_id === tripId) {
      const canEdit = board.data.can_edit && !hasReadOnlyBuild();
      return {
        notes: board.data.notes.map((row) => noteView(row, ids, tripId)),
        trashed_notes: canEdit ? board.data.trashed_notes.map((row) => noteView(row, ids, tripId)) : [],
        can_edit: canEdit,
      };
    }
  } else {
    const saved = saveResult.safeParse(data);
    if (saved.success && saved.data.trip_id === tripId) return { note: noteView(saved.data.note, ids, tripId) };
  }
  throw new FamilyApiError(503, 'collab_notes_unavailable', 'Shared notes are temporarily unavailable.');
}
