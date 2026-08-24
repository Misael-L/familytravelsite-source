import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, RefreshCw, Calendar, Power } from 'lucide-react'
import { SubscribeLinks } from '../SubscribeLinks'
import {
  disableCalendarFeed,
  enableCalendarFeed,
  fetchCalendarFeedUrl,
  regenerateCalendarFeed,
  webcalUrlFromHttps,
} from '../../../data/supabase/calendarFeed'

type FamilyCalendarSubscribeModalProps = {
  familyId: string
  personId: string
  onClose: () => void
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return String(err)
}

/**
 * Family all-trips ICS subscribe dialog. Opening only GETs the current token.
 * Enable / regenerate / disable call manage-calendar-feed. Nest IcsSubscribeModal
 * stays on the nest plane.
 */
export function FamilyCalendarSubscribeModal({
  familyId,
  personId,
  onClose,
}: FamilyCalendarSubscribeModalProps) {
  const [feedUrl, setFeedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const httpsUrl = feedUrl ?? ''
  const webcalUrl = httpsUrl ? webcalUrlFromHttps(httpsUrl) : ''

  const load = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      setFeedUrl(await fetchCalendarFeedUrl(familyId, personId))
    } catch (err) {
      setErrorMessage(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [familyId, personId])

  useEffect(() => { void load() }, [load])

  const run = async (action: () => Promise<string | void>) => {
    setBusy(true)
    setErrorMessage(null)
    try {
      const next = await action()
      setFeedUrl(typeof next === 'string' ? next : null)
    } catch (err) {
      setErrorMessage(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-labelledby="family-calendar-subscribe-title"
        style={{
          background: 'var(--bg-card, white)',
          borderRadius: 14,
          padding: '22px 24px',
          width: '100%',
          maxWidth: 420,
          boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
          border: '1px solid var(--border-faint)',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} strokeWidth={2} style={{ color: 'var(--accent, #6366f1)' }} />
            <span id="family-calendar-subscribe-title" style={{ fontWeight: 600, fontSize: 14 }}>
              Subscribe to all trips
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              color: 'var(--text-muted)', borderRadius: 6, display: 'flex',
            }}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
          One calendar feed for all your active trips, kept in sync automatically. Excludes archived trips and trips that ended more than 90 days ago.
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 12 }}>
            Loading…
          </div>
        ) : !feedUrl ? (
          <>
            <button
              type="button"
              onClick={() => { void run(() => enableCalendarFeed(familyId, personId)) }}
              disabled={busy}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '9px 14px', borderRadius: 9, border: 'none',
                background: 'var(--accent, #6366f1)', color: 'var(--accent-text, #fff)',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
              }}
            >
              <Calendar size={14} strokeWidth={2} />
              Enable calendar subscription
            </button>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.4 }}>
              Creates a secret link anyone with it can read without logging in. You can turn it off anytime.
            </p>
          </>
        ) : (
          <>
            <SubscribeLinks httpsUrl={httpsUrl} webcalUrl={webcalUrl} />

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-faint)', display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => { void run(() => regenerateCalendarFeed(familyId, personId)) }}
                disabled={busy}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: '1px solid var(--border-primary)',
                  borderRadius: 7, padding: '5px 10px',
                  fontSize: 11, color: 'var(--text-muted)',
                  cursor: busy ? 'default' : 'pointer',
                  fontFamily: 'inherit', opacity: busy ? 0.6 : 1,
                }}
              >
                <RefreshCw size={11} strokeWidth={2} style={{ animation: busy ? 'spin 0.8s linear infinite' : 'none' }} />
                Regenerate
              </button>
              <button
                type="button"
                onClick={() => { void run(() => disableCalendarFeed(familyId, personId)) }}
                disabled={busy}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: '1px solid var(--border-primary)',
                  borderRadius: 7, padding: '5px 10px',
                  fontSize: 11, color: 'var(--danger, #dc2626)',
                  cursor: busy ? 'default' : 'pointer',
                  fontFamily: 'inherit', opacity: busy ? 0.6 : 1,
                }}
              >
                <Power size={11} strokeWidth={2} />
                Turn off
              </button>
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
              Regenerating creates a new link and invalidates the old one. Turning off disables the link entirely.
            </p>
          </>
        )}

        {errorMessage && (
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--danger, #dc2626)', marginTop: 10, lineHeight: 1.4 }}>
            {errorMessage}
          </p>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body,
  )
}
