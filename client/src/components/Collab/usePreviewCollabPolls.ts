import type { CollabPollCreateRequest } from '@trek/shared'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import api from '../../api/client'
import { captureReadSession } from '../../sync/readSession'
import type { CollabRecoveryView, RecoveryItem } from './CollabRecovery'
import type { CollabPollData } from './collabModel'

type Board = {
  polls: CollabPollData[]
  trash: RecoveryItem[]
  canEdit: boolean
}

type PendingAction = { operationId: string; expectedRevision: number }

function errorResponse(error: unknown) {
  return (error as { response?: { status: number; data?: { error?: string } } })?.response
}

function updatePoll(board: Board, poll: CollabPollData): Board {
  const previous = board.polls.find(row => row.id === poll.id)
  if ((previous?.revision ?? 0) > (poll.revision ?? 0)) return board
  const others = board.polls.filter(row => row.id !== poll.id)
  const trash = board.trash.filter(row => row.id !== poll.id)
  if (poll.trashed) {
    return { ...board, polls: others, trash: [{ id: poll.id, title: poll.question.slice(0, 80), revision: poll.revision }, ...trash] }
  }
  const polls = previous ? board.polls.map(row => row.id === poll.id ? poll : row)
    : [poll, ...others].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
  return { ...board, polls, trash }
}

function usePollBoard(path: string, enabled: boolean, sequence: RefObject<number>,
  writing: RefObject<boolean>, onAccessLost: () => void) {
  const [board, setBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const refresh = useCallback(() => setAttempt(value => value + 1), [])

  useEffect(() => {
    if (!enabled) return
    const lease = captureReadSession()
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let request: AbortController | null = null
    const current = () => !disposed && lease.contextCurrent()
    const foreground = () => document.visibilityState !== 'hidden'
    const clear = () => {
      setBoard(null)
      setLoading(false)
      setFailed(true)
      onAccessLost()
    }

    async function read() {
      if (!current()) {
        if (!disposed) clear()
        return
      }
      if (!foreground()) return
      if (writing.current) {
        timer = setTimeout(() => void read(), 500)
        return
      }
      if (request) return
      const observed = sequence.current
      const controller = new AbortController()
      request = controller
      const fresh = () => current() && !controller.signal.aborted && sequence.current === observed
      try {
        const { data } = await api.get<Board>(path, { signal: controller.signal })
        if (fresh()) {
          setBoard(data)
          setFailed(false)
          setLoading(false)
        }
      } catch (error) {
        if (fresh()) {
          const status = errorResponse(error)?.status
          if (status === 401 || status === 403) clear()
          else {
            setFailed(true)
            setLoading(false)
          }
        }
      } finally {
        request = null
        if (current() && foreground()) timer = setTimeout(() => void read(), 5000)
      }
    }

    function visible() {
      clearTimeout(timer)
      if (!foreground()) request?.abort()
      else void read()
    }
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('online', visible)
    visible()
    return () => {
      disposed = true
      clearTimeout(timer)
      request?.abort()
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('online', visible)
    }
  }, [attempt, enabled, onAccessLost, path, sequence, writing])
  return { board, setBoard, failed, loading, refresh }
}

export function usePreviewCollabPolls(tripId: number | string, enabled: boolean, reportError: (message: string) => void) {
  const path = `/trips/${tripId}/family/collab/polls`
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<CollabRecoveryView>(null)
  const sequence = useRef(0)
  const writing = useRef(false)
  const creation = useRef<string | null>(null)
  const actions = useRef(new Map<string, PendingAction>())

  const onAccessLost = useCallback(() => {
    setView(null)
    creation.current = null
    actions.current.clear()
  }, [])
  const { board, setBoard, failed, loading, refresh } = usePollBoard(path, enabled, sequence, writing, onAccessLost)

  async function send(suffix: string, data: unknown) {
    if (!enabled || !board?.canEdit || writing.current) throw new Error('Poll action is unavailable.')
    const lease = captureReadSession()
    writing.current = true
    sequence.current++
    setBusy(true)
    try {
      const result = await api.post<{ poll: CollabPollData }>(path + suffix, data)
      if (!lease.contextCurrent()) throw new Error('The original session ended.')
      sequence.current++
      setBoard(current => current ? updatePoll(current, result.data.poll) : current)
    } finally {
      writing.current = false
      setBusy(false)
    }
  }

  function report(error: unknown, fallback: string) {
    const response = errorResponse(error)
    reportError(response?.data?.error ?? fallback)
    if (response && [401, 403, 409].includes(response.status)) refresh()
    return response !== undefined && response.status < 500
  }

  async function createPoll(draft: CollabPollCreateRequest) {
    const operationId = creation.current ?? crypto.randomUUID()
    creation.current = operationId
    try {
      await send('', { ...draft, operationId })
      creation.current = null
    } catch (error) {
      if (report(error, 'The poll save could not be confirmed. Retry the same draft.')) creation.current = null
      throw error
    }
  }

  async function manage(pollId: number, action: 'vote' | 'close', optionIndex?: number) {
    if (writing.current) return
    const revision = board?.polls.find(poll => poll.id === pollId)?.revision
    if (!revision) return
    const key = `${pollId}:${action}:${optionIndex ?? ''}`
    const pending = actions.current.get(key) ?? { operationId: crypto.randomUUID(), expectedRevision: revision }
    actions.current.set(key, pending)
    try {
      await send(`/${pollId}/${action}`, { ...pending, optionIndex })
      actions.current.delete(key)
    } catch (error) {
      if (report(error, 'The poll action could not be confirmed. Select the same action to retry.')) actions.current.delete(key)
    }
  }

  async function onMove(item: RecoveryItem, action: 'trash' | 'restore', operationId: string) {
    await send(`/${item.id}/${action}`, { operationId, expectedRevision: item.revision })
  }

  const canEdit = board?.canEdit === true
  return {
    polls: board?.polls ?? [], loading, failed, busy, canEdit, refresh, createPoll,
    votePoll: (pollId: number, optionIndex: number) => manage(pollId, 'vote', optionIndex),
    closePoll: (pollId: number) => manage(pollId, 'close'),
    deletePoll: async (pollId: number) => {
      const poll = board?.polls.find(row => row.id === pollId)
      if (canEdit && poll) setView({ id: poll.id, title: poll.question.slice(0, 80), revision: poll.revision })
    },
    openTrash: () => setView('trash'),
    recovery: { view: canEdit ? view : null, items: board?.trash ?? [], onMove, onClose: () => setView(null), onRefresh: refresh },
  }
}
