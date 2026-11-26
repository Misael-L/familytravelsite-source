import { useEffect, useState } from 'react'
import api from '../../api/client'
import { captureReadSession } from '../../sync/readSession'
import type { CollabRecoveryView, RecoveryItem } from './CollabRecovery'
import type { ChatMessage } from './collabModel'

export function usePreviewChatRecovery({ tripId, enabled, onChange, refresh }: {
  tripId: number | string
  enabled: boolean
  onChange: (message: ChatMessage) => void
  refresh: () => void
}) {
  const [view, setView] = useState<CollabRecoveryView>(null)
  const [items, setItems] = useState<RecoveryItem[]>([])
  const [listState, setListState] = useState<'loading' | 'failed' | 'ready'>('loading')
  const [attempt, setAttempt] = useState(0)
  const showingTrash = enabled && view === 'trash'
  const path = `/trips/${tripId}/family/collab/messages`

  useEffect(() => {
    if (!showingTrash) return
    const session = captureReadSession()
    const controller = new AbortController()
    const current = () => !controller.signal.aborted && session.contextCurrent()
    api.get<{ messages: RecoveryItem[] }>(`${path}/trash`, { signal: controller.signal }).then(({ data }) => {
      if (!current()) return
      setItems(data.messages)
      setListState('ready')
    }).catch(() => {
      if (current()) setListState('failed')
    })
    return () => controller.abort()
  }, [attempt, path, showingTrash])

  function openTrash() {
    setItems([])
    setListState('loading')
    setView('trash')
  }
  function requestTrash(message: ChatMessage) {
    if (enabled && message.viewer_owned && message.revision && !message._deleted)
      setView({ id: message.id, title: Array.from(message.text || message.attachments?.[0]?.original_name || 'Image').slice(0, 80).join(''), revision: message.revision })
  }
  function onRetryList() {
    setListState('loading')
    setAttempt(count => count + 1)
  }
  async function onMove(item: RecoveryItem, action: 'trash' | 'restore', operationId: string) {
    if (!enabled || !item.revision) throw new Error('Open Chat before moving this message.')
    const session = captureReadSession()
    const { data } = await api.post<{ message: ChatMessage }>(`${path}/${item.id}/${action}`, {
      operationId, expectedRevision: item.revision,
    })
    if (!session.contextCurrent()) throw new Error('Original session ended')
    const message = data.message
    onChange(message)
    if (action === 'restore') setItems(previous => message._deleted
      ? previous.map(row => row.id === message.id ? { ...row, revision: message.revision } : row)
      : previous.filter(row => row.id !== message.id))
  }

  return {
    openTrash, requestTrash, enabled,
    dialog: {
      view: enabled ? view : null, items, listState, onMove, onRetryList,
      onClose: () => setView(null), onRefresh: refresh,
    },
  }
}
