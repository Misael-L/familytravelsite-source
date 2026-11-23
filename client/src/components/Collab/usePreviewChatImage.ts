import { useEffect, useRef, useState } from 'react'
import { getSupabaseBrowserClient } from '../../integrations/family/legacy/data/supabase/client'
import { captureReadSession } from '../../sync/readSession'
import type { ChatAttachment } from './collabModel'

export function usePreviewChatImage(attachment: Omit<ChatAttachment, 'id'>) {
  const placeholder = useRef<HTMLSpanElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ path: string; attempt: number; src: string | null }>()
  const { privatePath, sizeBytes, mime_type } = attachment

  useEffect(() => {
    if (!privatePath || !placeholder.current) return
    const session = captureReadSession()
    const controller = new AbortController()
    let url: string | undefined
    const current = () => !controller.signal.aborted && session.contextCurrent()
    const load = async () => {
      try {
        const { data, error } = await getSupabaseBrowserClient().storage.from('trip-files')
          .download(privatePath, {}, { signal: controller.signal, cache: 'no-store' })
        if (error || !data || data.size !== sizeBytes || data.type.split(';')[0] !== mime_type) throw new Error('Unavailable image')
        if (current()) {
          url = URL.createObjectURL(data)
          setResult({ path: privatePath, attempt, src: url })
        }
      } catch {
        if (current()) setResult({ path: privatePath, attempt, src: null })
      }
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer?.disconnect()
        void load()
      }
    }, { root: placeholder.current.closest('[data-chat-scroll]'), rootMargin: '160px' })
    if (observer) observer.observe(placeholder.current)
    else void load()
    return () => {
      observer?.disconnect()
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [attempt, mime_type, privatePath, sizeBytes])

  const confirmed = result?.path === privatePath && result?.attempt === attempt ? result : undefined
  return { placeholder, src: privatePath ? confirmed?.src ?? '' : attachment.url,
    failed: confirmed?.src === null, retry: () => setAttempt(count => count + 1) }
}
