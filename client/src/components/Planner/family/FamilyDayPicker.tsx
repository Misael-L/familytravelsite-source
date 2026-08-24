import React, { useEffect } from 'react'
import ReactDOM from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import { formatDate } from '../../../utils/formatters'
import type { FamilyTripDay } from '../../../data/supabase/tripDays'

type FamilyDayPickerProps = {
  open: boolean
  days: FamilyTripDay[]
  onClose: () => void
  onPick: (dayId: string) => void
  title?: string
}

/** Light day picker when Assign to day has no selected Plan day. */
export default function FamilyDayPicker({
  open,
  days,
  onClose,
  onPick,
  title,
}: FamilyDayPickerProps): React.ReactElement | null {
  const { t, locale } = useTranslation()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const sorted = [...days].sort((a, b) => a.dayIndex - b.dayIndex)

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4 trek-backdrop-enter bg-[rgba(15,23,42,0.5)]"
      style={{ paddingBottom: 'var(--bottom-nav-h)' }}
      onClick={onClose}
    >
      <div
        className="trek-modal-enter rounded-2xl shadow-2xl w-full max-w-sm bg-surface-card"
        style={{ display: 'flex', flexDirection: 'column', maxHeight: '70vh', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-edge-faint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
          <span className="text-content" style={{ fontWeight: 600, fontSize: 'calc(14px * var(--fs-scale-body, 1))' }}>
            {title || t('planner.addToDay')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="bg-surface-tertiary text-content"
            aria-label={t('common.close')}
            style={{ border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {sorted.length === 0 ? (
            <div className="text-content-faint" style={{ padding: 24, textAlign: 'center', fontSize: 13 }}>
              {t('dayplan.emptyDay')}
            </div>
          ) : sorted.map((day, index) => {
            const title = day.title || t('dayplan.dayN', { n: index + 1 })
            const formatted = formatDate(day.civilDay, locale)
            return (
              <button
                key={day.id}
                type="button"
                onClick={() => onPick(day.id)}
                className="text-content"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '12px', border: 'none', borderRadius: 10,
                  background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 'calc(13px * var(--fs-scale-body, 1))', textAlign: 'left',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--bg-hover)', color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                }}>
                  {index + 1}
                </span>
                <span style={{ fontWeight: 500 }}>{title}</span>
                {formatted && (
                  <span className="text-content-faint" style={{ marginLeft: 'auto', fontSize: 12 }}>{formatted}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
