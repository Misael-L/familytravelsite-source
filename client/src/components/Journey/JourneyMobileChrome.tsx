import { type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../../i18n'
import { listFocusable } from './mobileJourneyModel'

/**
 * Journey-only mobile primitives (safe-area, glass bar, accessible sheet).
 * Not a second app shell — BottomNav stays in App.tsx.
 */

export function JourneySafeArea({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`journey-safe ${className}`.trim()}>
      {children}
    </div>
  )
}

export function JourneyGlassBar({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`md:hidden sticky z-20 flex items-center gap-2 ${className}`}
      style={{
        top: 0,
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div
        className="flex w-full items-center gap-2 rounded-2xl border border-edge px-2 py-2"
        style={{
          background: 'color-mix(in srgb, var(--bg-elevated) 86%, transparent)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function JourneySheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const labelId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    const focusFirst = () => {
      const nodes = listFocusable(panelRef.current)
      if (nodes[0]) nodes[0].focus()
      else panelRef.current?.focus()
    }
    const frame = window.requestAnimationFrame(focusFirst)

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = listFocusable(panelRef.current)
      if (nodes.length === 0) {
        event.preventDefault()
        panelRef.current?.focus()
        return
      }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center md:items-center p-0 md:p-5">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0"
        style={{ background: 'var(--overlay)' }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
        className="journey-sheet-panel relative z-[1] w-full max-w-[640px] max-h-[90vh] flex flex-col overflow-hidden rounded-t-3xl md:rounded-2xl border border-edge bg-surface-card shadow-modal outline-none"
        style={{ paddingBottom: 'var(--bottom-nav-h, 0px)' }}
      >
        <div className="px-7 pt-6 pb-5 border-b border-edge">
          <h2 id={labelId} className="text-subtitle font-bold text-content">{title}</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-7 py-5">{children}</div>
        {footer}
      </div>
    </div>,
    document.body,
  )
}
