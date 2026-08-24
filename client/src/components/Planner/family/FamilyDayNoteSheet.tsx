import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import { formatDate } from '../../../utils/formatters'
import type { FamilyTripDay } from '../../../data/supabase/tripDays'
import type { FamilyDayNote } from '../../../data/supabase/dayNotes'

type FamilyDayNoteSheetProps = {
  open: boolean
  day: FamilyTripDay | null
  dayIndexLabel: number
  existing: FamilyDayNote | null
  canMutate: boolean
  onClose: () => void
  onSave: (body: string) => Promise<void> | void
  onDelete: () => Promise<void> | void
}

export default function FamilyDayNoteSheet({
  open,
  day,
  dayIndexLabel,
  existing,
  canMutate,
  onClose,
  onSave,
  onDelete,
}: FamilyDayNoteSheetProps): React.ReactElement | null {
  const { t, locale } = useTranslation()
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setBody(existing?.body ?? '')
    setSaving(false)
  }, [open, existing?.id, existing?.body])

  if (!open || !day) return null

  const title = day.title || t('dayplan.dayN', { n: dayIndexLabel })
  const formatted = formatDate(day.civilDay, locale)
  const trimmed = body.trim()
  const canSave = canMutate && trimmed.length > 0 && !saving

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4 trek-backdrop-enter bg-[rgba(15,23,42,0.5)]"
      style={{ paddingBottom: 'var(--bottom-nav-h)' }}
      onClick={onClose}
    >
      <div
        className="trek-modal-enter rounded-2xl shadow-2xl w-full max-w-md bg-surface-card"
        style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-edge-faint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
          <div style={{ minWidth: 0 }}>
            <div className="text-content" style={{ fontWeight: 600, fontSize: 'calc(14px * var(--fs-scale-body, 1))' }}>
              {existing ? t('dayplan.editNote') : t('dayplan.addNote')}
            </div>
            <div className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-caption, 1))', marginTop: 2 }}>
              {title}{formatted ? ` · ${formatted}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-surface-tertiary text-content"
            aria-label={t('common.close')}
            style={{ border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '16px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            readOnly={!canMutate}
            placeholder={t('dayplan.addNote')}
            className="bg-surface-tertiary text-content"
            style={{
              width: '100%', minHeight: 160, resize: 'vertical',
              border: 'none', borderRadius: 12, padding: 12,
              fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box',
              opacity: canMutate ? 1 : 0.85,
            }}
            autoFocus={canMutate}
          />
        </div>

        <div className="border-t border-edge-faint" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', justifyContent: 'flex-end' }}>
          {canMutate && existing && (
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                try { await onDelete() } finally { setSaving(false) }
              }}
              className="text-content-faint"
              style={{
                marginRight: 'auto', border: 'none', background: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 'calc(13px * var(--fs-scale-body, 1))',
              }}
            >
              {t('common.delete')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="bg-surface-tertiary text-content"
            style={{
              border: 'none', borderRadius: 10, padding: '8px 14px', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500,
            }}
          >
            {t('common.close')}
          </button>
          {canMutate && (
            <button
              type="button"
              disabled={!canSave}
              onClick={async () => {
                setSaving(true)
                try { await onSave(trimmed) } finally { setSaving(false) }
              }}
              className="bg-accent text-accent-text"
              style={{
                border: 'none', borderRadius: 10, padding: '8px 14px',
                cursor: canSave ? 'pointer' : 'default', opacity: canSave ? 1 : 0.5,
                fontFamily: 'inherit', fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500,
              }}
            >
              {t('common.save')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
