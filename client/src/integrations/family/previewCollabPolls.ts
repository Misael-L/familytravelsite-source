import { z } from 'zod'
import type { CollabPollData } from '../../components/Collab/collabModel'
import { hasReadOnlyBuild } from '../../db/readOnlySession'
import { isEffectivelyOffline } from '../../sync/networkMode'
import type { FamilyIdentityRegistry } from './identity'
import { getSupabaseBrowserClient } from './legacy/data/supabase/client'
import { FamilyApiError, type FamilyFrontendRepository } from './repository'
import type { FamilyRequest } from './transport'

const revision = z.number().int().positive()
const poll = z.object({
  id: z.uuid(), author_id: z.uuid(), question: z.string(), revision,
  multiple_choice: z.boolean(), is_closed: z.boolean(), trashed: z.boolean(),
  deadline: z.iso.datetime({ offset: true }).nullable(), created_at: z.iso.datetime({ offset: true }),
  total_votes: z.number().int().nonnegative(),
  options: z.array(z.object({
    text: z.string(), selected: z.boolean(), voters: z.array(z.object({ id: z.uuid(), name: z.string() })),
  })).min(2).max(20),
})
const board = z.object({
  trip_id: z.uuid(), can_edit: z.boolean(), polls: z.array(poll),
  trash: z.array(z.object({ id: z.uuid(), title: z.string(), revision })),
})
const actionResult = z.object({ trip_id: z.uuid(), poll })
const draft = z.strictObject({
  operationId: z.uuidv4(), question: z.string().trim().min(1).max(5000),
  options: z.array(z.string().trim().min(1).max(1000)).min(2).max(20),
  multiple: z.boolean().optional(), multiple_choice: z.boolean().optional(),
  deadline: z.iso.datetime({ offset: true }).optional(),
})
const action = z.strictObject({
  operationId: z.uuidv4(), expectedRevision: revision,
  optionIndex: z.number().int().min(0).max(19).optional(),
})

function pollRpc(tripId: string, suffix: string, request: FamilyRequest, ids: FamilyIdentityRegistry) {
  const storage = getSupabaseBrowserClient()
  if (suffix === 'family/collab/polls' && request.method === 'GET') return {
    read: true, rpc: storage.rpc('get_family_trip_collab_polls_v1', { p_trip_id: tripId }),
  }
  if (request.method !== 'POST') throw new FamilyApiError(405, 'poll_action_unavailable', 'This poll action is unavailable.')
  if (suffix === 'family/collab/polls') {
    const valid = draft.safeParse(request.body)
    if (!valid.success || new Set(valid.data.options).size !== valid.data.options.length) {
      throw new FamilyApiError(422, 'poll_draft_invalid', 'Enter a question and between two and twenty distinct choices.')
    }
    const input = valid.data
    return {
      read: false, rpc: storage.rpc('create_family_trip_collab_poll_v1', {
        p_trip_id: tripId, p_operation_id: input.operationId, p_question: input.question, p_choices: input.options,
        p_multiple: input.multiple_choice ?? input.multiple ?? false, p_deadline: input.deadline ?? null,
      }),
    }
  }
  const route = /^family\/collab\/polls\/(\d+)\/(vote|close|trash|restore)$/.exec(suffix)
  const checked = action.safeParse(request.body)
  if (!route || !checked.success || (route[2] === 'vote') !== (checked.data.optionIndex !== undefined)) {
    throw new FamilyApiError(422, 'poll_action_invalid', 'Refresh the poll before trying again.')
  }
  return {
    read: false, rpc: storage.rpc('manage_family_trip_collab_poll_v1', {
      p_trip_id: tripId, p_poll_id: ids.uuid('collabPoll', route[1]), p_operation_id: checked.data.operationId,
      p_expected_revision: checked.data.expectedRevision, p_action: route[2], p_option_index: checked.data.optionIndex ?? null,
    }),
  }
}

function pollView(row: z.infer<typeof poll>, tripId: string, ids: FamilyIdentityRegistry): CollabPollData {
  const { author_id, id, options, deadline, ...fields } = row
  return {
    ...fields, id: ids.register('collabPoll', id), trip_id: ids.register('trip', tripId),
    deadline: deadline ?? null, user_id: ids.register('person', author_id), username: '', avatar: null, avatar_url: null,
    options: options.map(option => ({
      text: option.text, label: option.text, selected: option.selected,
      voters: option.voters.map(voter => {
        const key = ids.register('person', voter.id)
        return { id: key, user_id: key, username: voter.name, avatar: null, avatar_url: null }
      }),
    })),
  }
}

export async function handlePreviewCollabPolls(repo: FamilyFrontendRepository, tripId: string, suffix: string, request: FamilyRequest) {
  if (isEffectivelyOffline()) throw new FamilyApiError(503, 'polls_offline', 'Connect to use Polls.')
  if (request.query.size) throw new FamilyApiError(422, 'poll_request_invalid', 'This poll request is invalid.')
  const scope = repo.captureContext(tripId)
  const { ids } = await scope.perform(() => repo.views())
  const { read, rpc } = pollRpc(tripId, suffix, request, ids)
  const { data, error } = await scope.perform(async () => request.signal ? rpc.abortSignal(request.signal) : rpc)
  if (error?.code === '42501') throw new FamilyApiError(403, 'polls_denied', 'Polls are unavailable for this trip or session.')
  if (error?.code === '22023') throw new FamilyApiError(422, 'poll_rejected', error.message)
  if (error?.code === 'PT409') throw new FamilyApiError(409, 'poll_changed', error.message)
  if (!error && read) {
    const result = board.safeParse(data)
    if (result.success && result.data.trip_id === tripId) {
      const canEdit = result.data.can_edit && !hasReadOnlyBuild()
      return {
        canEdit,
        polls: result.data.polls.map(row => pollView(row, tripId, ids)),
        trash: canEdit ? result.data.trash.map(row => ({ ...row, id: ids.register('collabPoll', row.id) })) : [],
      }
    }
  }
  if (!error && !read) {
    const result = actionResult.safeParse(data)
    if (result.success && result.data.trip_id === tripId) return { poll: pollView(result.data.poll, tripId, ids) }
  }
  throw new FamilyApiError(503, 'polls_unavailable', 'Polls are temporarily unavailable.')
}
