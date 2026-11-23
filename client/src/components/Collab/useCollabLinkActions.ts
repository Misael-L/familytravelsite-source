import { useRef, useState } from 'react'
import api from '../../api/client'
import { captureReadSession } from '../../sync/readSession'
import type { useToast } from '../shared/Toast'

export interface CollabLink {
  id: number
  title: string
  url: string
  pinned: boolean | number
  revision?: number
  created_at?: string
  trashed_at?: string | null
}

type LinkVersion = Pick<CollabLink, 'id' | 'revision'>
type LinkAction = 'pin' | 'unpin' | 'trash' | 'restore'

export function useCollabLinkActions({ tripId, canEdit, onSaved, onConflict, toast }: {
  tripId: number
  canEdit: boolean
  onSaved: (link: CollabLink) => void
  onConflict: () => void
  toast: ReturnType<typeof useToast>
}) {
  const activePin = useRef<number | null>(null)
  const operations = useRef(new Map<number, { revision: number | undefined; action: string; id: string }>())
  const [pinPending, setPinPending] = useState<number | null>(null)

  async function apply(link: LinkVersion, action: LinkAction, operationId: string) {
    const scope = captureReadSession()
    if (!canEdit || !link.revision) throw new Error('Open the link again before changing it.')
    const { data } = await api.post<{ link: CollabLink }>(
      `/trips/${tripId}/family/collab/links/${link.id}/${action}`,
      { operationId, expectedRevision: link.revision },
    )
    if (!scope.contextCurrent()) throw new Error('Original session ended')
    onSaved(data.link)
  }

  async function togglePin(link: CollabLink) {
    if (activePin.current !== null) return
    const scope = captureReadSession()
    const action = link.pinned ? 'unpin' : 'pin'
    const prior = operations.current.get(link.id)
    const operationId = prior?.revision === link.revision && prior?.action === action ? prior.id : crypto.randomUUID()
    operations.current.set(link.id, { id: operationId, revision: link.revision, action })
    activePin.current = link.id
    setPinPending(link.id)
    try {
      await apply(link, action, operationId)
      operations.current.delete(link.id)
    } catch (error) {
      if (!scope.contextCurrent()) return
      const response = (error as { response?: { status: number; data?: { error?: string } } })?.response
      toast.error(response?.data?.error ?? 'The pin change was not confirmed. Try again.')
      if (response?.status === 409) {
        operations.current.delete(link.id)
        onConflict()
      }
    } finally {
      activePin.current = null
      setPinPending(null)
    }
  }

  return { apply, togglePin, pinPending }
}
