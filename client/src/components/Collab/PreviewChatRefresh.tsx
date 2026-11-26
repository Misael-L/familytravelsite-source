import { RotateCw, Trash2 } from 'lucide-react'

export function PreviewChatRefresh({ failed, busy, onRefresh, onOpenTrash, board = 'Chat' }: {
  failed: boolean
  busy: boolean
  onRefresh: () => void
  onOpenTrash?: () => void
  board?: 'Chat' | 'Polls'
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 px-2 py-1">
      {failed && <p role="alert" className="me-auto text-sm text-content-muted">{board} could not be loaded.</p>}
      {onOpenTrash && (
        <button type="button" aria-label={`${board} Trash`} title={`${board} Trash`} onClick={onOpenTrash}
          className="grid size-8 place-items-center rounded-full bg-surface-secondary text-content-muted hover:text-content">
          <Trash2 size={14} aria-hidden="true" />
        </button>
      )}
      <button type="button" aria-label={`Refresh ${board}`} disabled={busy} onClick={onRefresh}
        className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-content-muted hover:text-content disabled:opacity-50">
        <RotateCw size={13} aria-hidden="true" /> {failed ? 'Try again' : 'Refresh'}
      </button>
    </div>
  )
}
