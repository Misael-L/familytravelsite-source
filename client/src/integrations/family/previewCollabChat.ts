import { z } from 'zod';
import type { ChatMessage } from '../../components/Collab/collabModel';
import { hasReadOnlyBuild } from '../../db/readOnlySession';
import { QUICK_REACTIONS } from '../../components/Collab/CollabChat.constants';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { FamilyApiError } from './errors';
import type { FamilyIdentityRegistry } from './identity';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import type { FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';
import { readChatDraft, stageChatImages } from './previewCollabChatImages';

const cursor = z.string().regex(/^\d{1,19}$/);
const revision = z.number().int().positive();
const attachment = z.object({
  id: z.uuid(), path: z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/chat\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[1-4]-[a-f0-9]{64}$/),
  name: z.string().min(1).max(180),
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  size_bytes: z.number().int().positive().max(10485760),
});
const reaction = z.object({
  emoji: z.enum(QUICK_REACTIONS),
  users: z.array(z.object({ id: z.uuid(), name: z.string() })),
  selected: z.boolean(),
});
const message = z.object({
  id: z.uuid(), author_person_id: z.uuid(), author_name: z.string(), text: z.string(),
  created_at: z.iso.datetime({ offset: true }), viewer_owned: z.boolean(),
  reply_to: z.uuid().nullable(), reply_text: z.string().nullable(), reply_username: z.string().nullable(),
  revision, deleted: z.boolean(), reply_revision: revision.nullable(), reactions: z.array(reaction),
  attachments: z.array(attachment).max(4),
});
const thread = z.object({
  trip_id: z.uuid(), messages: z.array(message), has_more: z.boolean(), can_send: z.boolean(),
  change_cursor: cursor, changes: z.array(message).default([]),
});
const sendResult = z.object({ trip_id: z.uuid(), message });
const trashResult = z.object({
  trip_id: z.uuid(), messages: z.array(z.object({ id: z.uuid(), title: z.string(), revision })),
});
const movePayload = z.strictObject({ operationId: z.uuidv4(), expectedRevision: revision });
const reactionPayload = z.strictObject({ operationId: z.uuidv4(), emoji: z.enum(QUICK_REACTIONS), present: z.boolean() });

function chatReadRequest(tripId: string, suffix: string, request: FamilyRequest, ids: FamilyIdentityRegistry) {
  const client = getSupabaseBrowserClient();
  if (suffix === 'collab/messages/trash' && !request.query.size) {
    return { kind: 'trash', rpc: client.rpc('get_family_trip_collab_chat_trash_v1', { p_trip_id: tripId }) } as const;
  }
  const updates = suffix === 'collab/messages/updates';
  const afterChange = request.query.get('change');
  const key = updates ? 'after' : 'before';
  const position = request.query.get(key);
  const positionCount = position === null ? 0 : 1;
  if (request.query.size !== positionCount + Number(updates) || (position !== null && !cursor.safeParse(position).success)
    || (updates && !cursor.safeParse(afterChange).success) || (!updates && suffix !== 'collab/messages')) {
    throw new FamilyApiError(422, 'collab_chat_invalid', 'Refresh Chat to load messages.');
  }
  const messageId = position === null ? null : ids.uuid('collabMessage', position);
  if (updates) return {
    kind: 'read',
    rpc: client.rpc('get_family_trip_collab_chat_updates_v2', {
      p_trip_id: tripId, p_after_id: messageId, p_after_change: afterChange,
    }),
  } as const;
  return {
    kind: 'read',
    rpc: client.rpc('get_family_trip_collab_chat_v1', { p_trip_id: tripId, p_before_id: messageId }),
  } as const;
}

async function chatRequest(repo: FamilyFrontendRepository, tripId: string, suffix: string, request: FamilyRequest, ids: FamilyIdentityRegistry) {
  if (request.method === 'GET') return chatReadRequest(tripId, suffix, request, ids);
  if (request.method !== 'POST' || request.query.size)
    throw new FamilyApiError(405, 'collab_chat_unavailable', 'This chat action is unavailable.');
  const client = getSupabaseBrowserClient();
  const reactionId = /^collab\/messages\/(\d+)\/react$/.exec(suffix)?.[1];
  if (reactionId) {
    const parsed = reactionPayload.safeParse(request.body);
    if (!parsed.success) throw new FamilyApiError(422, 'collab_chat_invalid', 'Choose a reaction from the message menu.');
    return {
      kind: 'react',
      rpc: client.rpc('set_family_trip_collab_chat_reaction_v1', {
        p_trip_id: tripId, p_message_id: ids.uuid('collabMessage', reactionId),
        p_operation_id: parsed.data.operationId, p_emoji: parsed.data.emoji, p_present: parsed.data.present,
      }),
    } as const;
  }
  const move = /^collab\/messages\/(\d+)\/(trash|restore)$/.exec(suffix);
  if (move) {
    const parsed = movePayload.safeParse(request.body);
    if (!parsed.success) throw new FamilyApiError(422, 'collab_chat_invalid', 'Refresh Chat before moving this message.');
    return {
      kind: 'move',
      rpc: client.rpc('move_family_trip_collab_message_v1', {
        p_trip_id: tripId, p_message_id: ids.uuid('collabMessage', move[1]),
        p_operation_id: parsed.data.operationId, p_expected_revision: parsed.data.expectedRevision,
        p_move_to_trash: move[2] === 'trash',
      }),
    } as const;
  }
  if (suffix !== 'collab/messages')
    throw new FamilyApiError(405, 'collab_chat_unavailable', 'This chat action is unavailable.');
  const { draft, files } = readChatDraft(request.body);
  const replyTo = draft.replyTo === undefined ? null : ids.uuid('collabMessage', draft.replyTo);
  const images = await stageChatImages(repo, tripId, draft.operationId, files);
  return {
    kind: 'send', replying: replyTo !== null,
    rpc: client.rpc('send_family_trip_collab_chat_v3', {
      p_trip_id: tripId,
      p_operation_id: draft.operationId,
      p_text: draft.text,
      p_reply_to_message_id: replyTo,
      p_images: images,
    }),
  } as const;
}

function checkedChatError(code: string | undefined, action: Awaited<ReturnType<typeof chatRequest>>) {
  if (code === '42501') return new FamilyApiError(403, 'collab_chat_denied', 'Chat is unavailable for this trip or session.');
  if (action.kind === 'react' && (code === 'PT409' || code === '22023'))
    return new FamilyApiError(409, 'collab_chat_conflict', 'This message changed. Refresh Chat to see its current state.');
  if (code === 'PT409') return new FamilyApiError(409, 'collab_chat_conflict', action.kind === 'move'
    ? 'This message changed. Refresh Chat to see its current state.'
    : 'An earlier send used this draft. Refresh Chat to check what was sent.');
  if (action.kind === 'send' && code === '55000')
    return new FamilyApiError(503, 'collab_image_upload_unavailable', 'An image is unavailable. Retry the same draft.');
  if (code !== '22023') return null;
  if (action.kind !== 'send') return new FamilyApiError(422, 'collab_chat_invalid', 'Refresh Chat to load messages.');
  return new FamilyApiError(422, 'collab_chat_invalid', action.replying
    ? 'That message is unavailable. Choose another message to reply to.' : 'Enter between 1 and 5000 characters.');
}

export async function handlePreviewCollabChat(repo: FamilyFrontendRepository, tripId: string, suffix: string, request: FamilyRequest) {
  if (isEffectivelyOffline()) throw new FamilyApiError(503, 'collab_offline', 'Connect to use Chat.');
  const scope = repo.captureContext(tripId);
  const { ids } = await scope.perform(() => repo.views());
  const action = await scope.perform(() => chatRequest(repo, tripId, suffix, request, ids));
  const { data, error } = await scope.perform(async () => (request.signal ? action.rpc.abortSignal(request.signal) : action.rpc));
  const refusal = checkedChatError(error?.code, action);
  if (refusal) throw refusal;
  if (error) throw new FamilyApiError(503, 'collab_chat_unavailable', 'Chat is temporarily unavailable.');

  const view = (row: z.infer<typeof message>): ChatMessage => ({
    id: ids.register('collabMessage', row.id),
    trip_id: ids.register('trip', tripId),
    user_id: ids.register('person', row.author_person_id),
    username: row.author_name,
    text: row.text,
    created_at: new Date(row.created_at).toISOString(),
    viewer_owned: row.viewer_owned,
    reply_to: row.reply_to === null ? null : ids.register('collabMessage', row.reply_to),
    reply_text: row.reply_text,
    reply_username: row.reply_username,
    reply_revision: row.reply_revision,
    revision: row.revision,
    deleted: row.deleted,
    _deleted: row.deleted,
    avatar: null,
    avatar_url: null,
    attachments: row.attachments.map(file => ({
      id: file.id, url: '', privatePath: file.path, sizeBytes: file.size_bytes,
      original_name: file.name, mime_type: file.mime_type,
    })),
    reactions: row.reactions.map(({ emoji, users, selected }) => ({
      emoji, selected, count: users.length,
      users: users.map(user => ({ user_id: ids.register('person', user.id), username: user.name })),
    })),
  });
  if (action.kind === 'read') {
    const result = thread.safeParse(data);
    if (result.success && result.data.trip_id === tripId) return {
      can_send: result.data.can_send && !hasReadOnlyBuild(), has_more: result.data.has_more,
      messages: result.data.messages.map(view), changes: result.data.changes.map(view),
      change_cursor: result.data.change_cursor,
    };
  } else if (action.kind === 'trash') {
    const result = trashResult.safeParse(data);
    if (result.success && result.data.trip_id === tripId) return {
      messages: result.data.messages.map(row => ({ ...row, id: ids.register('collabMessage', row.id) })),
    };
  } else {
    const result = sendResult.safeParse(data);
    if (result.success && result.data.trip_id === tripId) return { message: view(result.data.message) };
  }
  throw new FamilyApiError(503, 'collab_chat_unavailable', 'Chat is temporarily unavailable.');
}
