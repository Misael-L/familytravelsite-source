import { useEffect, useRef } from 'react'
import api from '../../api/client'
import { captureReadSession } from '../../sync/readSession'
import type { ChatMessage } from './collabModel'

const UPDATE_INTERVAL = 5_000
const CATCH_UP_INTERVAL = 250
const MAX_RETRY_INTERVAL = 30_000

export interface ChatUpdatePage {
  messages: ChatMessage[]
  has_more: boolean
  can_send: boolean
  changes: ChatMessage[]
  change_cursor: string
}
export type ChatReadHead = { id: number | null; change: string }

function newest(current: ChatMessage | undefined, incoming: ChatMessage) {
  if (!current) return incoming
  const incomingIsOlder = (incoming.revision ?? 0) < (current.revision ?? 0)
  const latest = incomingIsOlder ? current : incoming
  const other = incomingIsOlder ? incoming : current
  // Reactions can change the message before a separate change to its quoted parent arrives.
  if (latest._deleted || other._deleted || (latest.reply_revision ?? 0) >= (other.reply_revision ?? 0)) return latest
  return { ...latest, reply_text: other.reply_text, reply_username: other.reply_username, reply_revision: other.reply_revision }
}

export function reconcileChatChanges(previous: ChatMessage[], changes: ChatMessage[]) {
  const updated = new Map<number, ChatMessage>()
  for (const row of changes) updated.set(row.id, newest(updated.get(row.id), row))
  const visible = previous.map(row => {
    const change = updated.get(row.id)
    const latest = change ? newest(row, change) : row
    updated.set(row.id, latest)
    return latest
  })
  return visible.map(row => {
    const parent = row.reply_to === null ? undefined : updated.get(row.reply_to)
    if (!parent?.revision || row._deleted || parent.revision <= (row.reply_revision ?? 0)) return row
    return {
      ...row,
      reply_text: parent._deleted ? null : Array.from(parent.text || parent.attachments?.[0]?.original_name || '').slice(0, 80).join(''),
      reply_username: parent._deleted ? null : parent.username,
      reply_revision: parent.revision,
    }
  })
}

/** The confirmed cursor can lag this view when the composer has already shown a sent message. */
export function mergeChatUpdates(previous: ChatMessage[], after: number | null, incoming: ChatMessage[]) {
  const boundary = after === null ? 0 : previous.findIndex(message => message.id === after) + 1
  const received = new Set(incoming.map(message => message.id))
  const current = new Map(previous.map(row => [row.id, row]))
  return [
    ...previous.slice(0, boundary),
    ...incoming.map(row => newest(current.get(row.id), row)),
    ...previous.slice(boundary).filter(message => !received.has(message.id)),
  ]
}

export function usePreviewChatUpdates({ tripId, enabled, head, onPage, onAccessLost, onExpiredCursor }: {
  tripId: number | string
  enabled: boolean
  head: ChatReadHead | null
  onPage: (after: number | null, page: ChatUpdatePage) => void
  onAccessLost: () => void
  onExpiredCursor: () => void
}) {
  const cursor = useRef<(ChatReadHead & { head: ChatReadHead }) | null>(null)

  useEffect(() => {
    if (!enabled || !head) return
    if (cursor.current?.head !== head) cursor.current = { ...head, head }
    const position = cursor.current
    const session = captureReadSession()
    let disposed = false
    let request: AbortController | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let retryDelay = UPDATE_INTERVAL

    const current = () => {
      if (disposed) return false
      if (session.contextCurrent()) return true
      disposed = true
      onAccessLost()
      return false
    }
    const eligible = () => current() && document.visibilityState !== 'hidden' && navigator.onLine !== false

    async function check() {
      if (!eligible() || request) return
      const controller = new AbortController()
      request = controller
      let delay = UPDATE_INTERVAL
      const after = position.id
      try {
        const { data } = await api.get<ChatUpdatePage>(`/trips/${tripId}/family/collab/messages/updates`, {
          params: after === null ? { change: position.change } : { after, change: position.change },
          signal: controller.signal,
        })
        if (!eligible() || controller.signal.aborted) return
        onPage(after, data)
        position.id = data.messages[data.messages.length - 1]?.id ?? after
        position.change = data.change_cursor
        retryDelay = UPDATE_INTERVAL
        if (data.has_more) delay = CATCH_UP_INTERVAL
      } catch (error) {
        if (!eligible() || controller.signal.aborted) return
        const status = (error as { response?: { status: number } })?.response?.status
        if (status === 401 || status === 403) {
          disposed = true
          onAccessLost()
        } else if (status === 422) {
          disposed = true
          onExpiredCursor()
        } else {
          retryDelay = Math.min(retryDelay * 2, MAX_RETRY_INTERVAL)
          delay = retryDelay
        }
      } finally {
        request = null
        if (eligible()) timer = setTimeout(() => void check(), controller.signal.aborted ? 0 : delay)
      }
    }

    function visibilityChanged() {
      clearTimeout(timer)
      if (eligible()) void check()
      else request?.abort()
    }

    document.addEventListener('visibilitychange', visibilityChanged)
    window.addEventListener('online', visibilityChanged)
    window.addEventListener('offline', visibilityChanged)
    visibilityChanged()
    return () => {
      disposed = true
      clearTimeout(timer)
      request?.abort()
      document.removeEventListener('visibilitychange', visibilityChanged)
      window.removeEventListener('online', visibilityChanged)
      window.removeEventListener('offline', visibilityChanged)
    }
  }, [tripId, enabled, head, onPage, onAccessLost, onExpiredCursor])
}
