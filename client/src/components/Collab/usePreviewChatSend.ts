import { useCallback, useRef } from 'react'
import api, { postMultipart } from '../../api/client'
import { captureReadSession } from '../../sync/readSession'
import type { ChatMessage } from './collabModel'

export function usePreviewChatSend(tripId: number | string) {
  const operation = useRef<string | null>(null)
  const clearSendOperation = useCallback(() => { operation.current = null }, [])
  const sendPreviewDraft = useCallback(async (text: string, replyTo: number | undefined, files: File[]) => {
    const scope = captureReadSession()
    operation.current ??= crypto.randomUUID()
    const payload = { operationId: operation.current, text, replyTo }
    const multipart = files.length ? new FormData() : undefined
    if (multipart) {
      multipart.set('operationId', payload.operationId)
      multipart.set('text', text)
      if (replyTo !== undefined) multipart.set('replyTo', String(replyTo))
      for (const file of files) multipart.append('file', file)
    }
    const path = `/trips/${tripId}/family/collab/messages`
    const data = multipart ? await postMultipart<{ message: ChatMessage }>(path, multipart)
      : (await api.post<{ message: ChatMessage }>(path, payload)).data
    if (!scope.contextCurrent()) throw new Error('Original session ended')
    if (operation.current === payload.operationId) clearSendOperation()
    return data
  }, [clearSendOperation, tripId])

  return { sendPreviewDraft, clearSendOperation }
}
