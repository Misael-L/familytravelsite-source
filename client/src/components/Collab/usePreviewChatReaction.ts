import { useCallback, useRef } from 'react'
import api from '../../api/client'
import { captureReadSession, type ReadSession } from '../../sync/readSession'
import type { ChatMessage } from './collabModel'

type PendingReaction = {
  session: ReadSession
  operationId: string
  present: boolean
  inFlight: boolean
}

export function usePreviewChatReaction(tripId: number | string) {
  const pending = useRef(new Map<string, PendingReaction>())
  return useCallback(async (message: ChatMessage, emoji: string, reportFailure: (detail: string) => void) => {
    const key = `${tripId}:${message.id}:${emoji}`
    let operation = pending.current.get(key)
    if (!operation?.session.contextCurrent()) {
      operation = {
        session: captureReadSession(), operationId: crypto.randomUUID(),
        present: !message.reactions.some(row => row.emoji === emoji && row.selected), inFlight: false,
      }
      pending.current.set(key, operation)
    }
    if (operation.inFlight) return
    operation.inFlight = true
    try {
      const { data } = await api.post<{ message: ChatMessage }>(`/trips/${tripId}/family/collab/messages/${message.id}/react`, {
        operationId: operation.operationId, emoji, present: operation.present,
      })
      if (pending.current.get(key) === operation) pending.current.delete(key)
      if (operation.session.contextCurrent()) return data.message
    } catch (cause) {
      if (pending.current.get(key) !== operation) return
      const response = (cause as { response?: { status: number; data?: { error?: string } } })?.response
      if (response && response.status < 500) pending.current.delete(key)
      if (operation.session.contextCurrent()) {
        reportFailure(response && response.status < 500
          ? response.data?.error ?? 'The reaction could not be saved.'
          : 'The reaction could not be confirmed. Choose the same emoji to retry.')
      }
    } finally {
      operation.inFlight = false
    }
  }, [tripId])
}
