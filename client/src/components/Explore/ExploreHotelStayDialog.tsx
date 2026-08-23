import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { FamilyTripDay } from '../../data/supabase/tripDays'

type ExploreHotelStayDialogProps = {
  open: boolean
  hotelName: string
  days: FamilyTripDay[]
  onClose: () => void
  onSave: (checkIn: string, checkOut: string) => void
  busy?: boolean
}

function defaultDates(days: FamilyTripDay[]): { checkIn: string; checkOut: string } {
  const sorted = [...days].sort((a, b) => a.dayIndex - b.dayIndex)
  if (sorted.length >= 2) {
    return { checkIn: sorted[0].civilDay, checkOut: sorted[sorted.length - 1].civilDay }
  }
  if (sorted.length === 1) {
    const d = new Date(`${sorted[0].civilDay}T00:00:00.000Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    return { checkIn: sorted[0].civilDay, checkOut: d.toISOString().slice(0, 10) }
  }
  return { checkIn: '', checkOut: '' }
}

/** Thin check-in / check-out dialog for Explore hotel Add to trip. Not Nest ReservationModal. */
export default function ExploreHotelStayDialog({
  open,
  hotelName,
  days,
  onClose,
  onSave,
  busy = false,
}: ExploreHotelStayDialogProps): React.ReactElement | null {
  const { t } = useTranslation()
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const next = defaultDates(days)
    setCheckIn(next.checkIn)
    setCheckOut(next.checkOut)
    setLocalError(null)
  }, [open, days])

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

  const submit = () => {
    if (!checkIn || !checkOut) {
      setLocalError(tr('trip.explore.add.hotel.required', 'Check-in and check-out are required'))
      return
    }
    if (checkOut <= checkIn) {
      setLocalError(tr('trip.explore.add.hotel.invalidDates', 'Check-out must be after check-in'))
      return
    }
    onSave(checkIn, checkOut)
  }

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4 trek-backdrop-enter bg-[rgba(15,23,42,0.5)]"
      style={{ paddingBottom: 'var(--bottom-nav-h)' }}
      onClick={onClose}
    >
      <div
        className="trek-modal-enter rounded-2xl shadow-2xl w-full max-w-sm bg-surface-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="explore-hotel-stay-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-edge-faint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
          <span id="explore-hotel-stay-title" className="text-content" style={{ fontWeight: 600, fontSize: 'calc(14px * var(--fs-scale-body, 1))' }}>
            {tr('trip.explore.add.hotel.title', 'Hotel stay')}
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
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="text-content-secondary" style={{ margin: 0, fontSize: 13 }}>
            {hotelName}
          </p>
          <label className="text-content" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
            {tr('trip.explore.add.hotel.checkIn', 'Check-in')}
            <input
              type="date"
              required
              value={checkIn}
              onChange={e => { setCheckIn(e.target.value); setLocalError(null) }}
              className="text-content bg-surface-card"
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--edge-faint, #e2e8f0)',
                fontFamily: 'inherit',
                fontSize: 14,
              }}
            />
          </label>
          <label className="text-content" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
            {tr('trip.explore.add.hotel.checkOut', 'Check-out')}
            <input
              type="date"
              required
              value={checkOut}
              min={checkIn || undefined}
              onChange={e => { setCheckOut(e.target.value); setLocalError(null) }}
              className="text-content bg-surface-card"
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--edge-faint, #e2e8f0)',
                fontFamily: 'inherit',
                fontSize: 14,
              }}
            />
          </label>
          {localError && (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--danger, #dc2626)' }}>
              {localError}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            style={{
              marginTop: 4,
              width: '100%',
              padding: '11px 14px',
              borderRadius: 999,
              border: 'none',
              cursor: busy ? 'wait' : 'pointer',
              fontSize: 14,
              fontWeight: 650,
              fontFamily: 'inherit',
              background: '#111827',
              color: '#fff',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {tr('trip.explore.add.hotel.save', 'Add stay')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
