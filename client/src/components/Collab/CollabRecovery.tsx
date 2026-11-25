import { Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from '../../i18n'
import { DialogButton, DialogFooter, DialogHeader, DialogShell, DialogTile, FooterSpacer, NEUTRAL_TINT } from '../shared/DialogShell'
export type RecoveryItem = { id: number; title: string; revision?: number }
export type CollabRecoveryView = 'trash' | RecoveryItem | null

interface RecoveryProps {
  board: 'notes' | 'links' | 'chat' | 'polls'
  items: RecoveryItem[]
  onClose: () => void
  onMove: (item: RecoveryItem, action: 'trash' | 'restore', operationId: string) => Promise<void>
  onRefresh: () => void
  listState?: 'loading' | 'failed' | 'ready'
  onRetryList?: () => void
}

export function CollabRecovery({ view, ...props }: RecoveryProps & { view: CollabRecoveryView }) {
  if (view === null) return null
  return <RecoveryDialog key={view === 'trash' ? view : view.id} view={view} {...props} />
}

function RecoveryDialog({ view, board, items, onClose, onMove, onRefresh, listState = 'ready', onRetryList }: RecoveryProps & { view: Exclude<CollabRecoveryView, null> }) {
  const { t } = useTranslation()
  const labelId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null)
  const operations = useRef(new Map<string, string>())
  const boardTitle = t({ notes: 'collab.notes.title', links: 'collab.tabs.links', chat: 'collab.tabs.chat', polls: 'collab.tabs.polls' }[board])
  const itemType = { notes: 'note', links: 'link', chat: 'message', polls: 'poll' }[board]
  const close = () => { if (!busy) onClose() }
  const refresh = () => { onClose(); onRefresh() }

  const submit = async (item: RecoveryItem, action: 'trash' | 'restore') => {
    if (busy) return
    const key = `${action}:${item.id}:${item.revision}`
    const operation = operations.current.get(key) ?? crypto.randomUUID()
    operations.current.set(key, operation)
    setBusy(true)
    setError(null)
    try {
      await onMove(item, action, operation)
      operations.current.delete(key)
      if (action === 'trash') onClose()
    } catch (cause) {
      const response = (cause as { response?: { status: number; data?: { error?: string } } })?.response
      setError({
        message: response?.data?.error ?? 'The move could not be confirmed. Try again.',
        conflict: response?.status === 409,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      onClose={close}
      labelledBy={labelId}
      blocked={busy}
      header={
        <DialogHeader
          tile={<DialogTile><Trash2 size={20} /></DialogTile>}
          tint={NEUTRAL_TINT}
          labelId={labelId}
          onClose={close}
          title={view === 'trash' ? `${boardTitle} · ${t('files.trash')}` : `Move ${itemType} to Trash?`}
        />
      }
      footer={
        <DialogFooter>
          <FooterSpacer />
          {error?.conflict && <DialogButton onClick={refresh} disabled={busy}>Refresh {boardTitle}</DialogButton>}
          <DialogButton onClick={close} disabled={busy}>{view === 'trash' ? t('common.close') : t('common.cancel')}</DialogButton>
          {view !== 'trash' && (
            <DialogButton variant="primary" onClick={() => void submit(view, 'trash')} disabled={busy}>
              Move to Trash
            </DialogButton>
          )}
        </DialogFooter>
      }
    >
      <div className="space-y-3 text-sm text-content" aria-busy={busy || listState === 'loading'}>
        {error && <p role="alert" className="text-danger">{error.message}</p>}
        {view === 'trash' ? (
          listState === 'loading' ? <p role="status">{t('common.loading')}</p> :
          listState === 'failed' ? (
            <div className="space-y-2">
              <p role="alert">{boardTitle} Trash could not be loaded.</p>
              <DialogButton onClick={onRetryList}>{t('trip.load.retry')}</DialogButton>
            </div>
          ) : items.length ? (
            <ul className="space-y-2">
              {items.map(item => (
                <li key={item.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-secondary p-2">
                  <span className="break-words font-medium [overflow-wrap:anywhere]" dir="auto">{item.title}</span>
                  <DialogButton onClick={() => void submit(item, 'restore')} disabled={busy}>{t('files.restore')}</DialogButton>
                </li>
              ))}
            </ul>
          ) : <p>{t('files.trashEmpty')}</p>
        ) : <p><bdi className="font-semibold">{view.title}</bdi> can be restored from {boardTitle} Trash.</p>}
      </div>
    </DialogShell>
  )
}
