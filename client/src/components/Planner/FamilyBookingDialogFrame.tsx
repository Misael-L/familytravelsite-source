import type { HeaderTitleInput } from '../shared/DialogShell'
import { BookingDialogHeader, StatusPill, TypePill } from './bookings/BookingDialogShell'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, type ReactElement, type ReactNode, type RefObject } from 'react'
import ReactDOM from 'react-dom'
import { X } from 'lucide-react'
import { containTab, focusDialog } from '../shared/dialogFocus'
import {
  OwnedPickerLayerProvider,
  createOwnedPickerApi,
  dismissTopOwnedPicker,
  type OwnedPickerLayer,
} from '../shared/ownedPickerLayer'
import { useDiscardGuard } from '../shared/useDiscardGuard'
import { useTranslation } from '../../i18n'
import { BookingRequestCloseContext } from '../shared/bookingRequestClose'

export type FamilyBookingDialogFrameProps = {
  title: string
  titleInput?: HeaderTitleInput
  bookingType?: string
  bookingTitle?: string
  bookingStatus?: string
  snapshot: unknown
  baseline: unknown | null
  busy: boolean
  handoffRef: RefObject<boolean>
  onClose: () => void
  footer: ReactNode
  children: ReactNode
}

function rememberField(): HTMLElement | null {
  const active = document.activeElement
  return active instanceof HTMLElement ? active : null
}

export default function FamilyBookingDialogFrame({
  title,
  bookingType = 'other', bookingTitle, bookingStatus, titleInput,
  snapshot,
  baseline,
  busy,
  handoffRef,
  onClose,
  footer,
  children,
}: FamilyBookingDialogFrameProps): ReactElement {
  const { t } = useTranslation()
  const titleId = useId()
  const questionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const questionRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const pressedOn = useRef<EventTarget | null>(null)
  const suppressBackdropClick = useRef(false)
  const layers = useRef<OwnedPickerLayer[]>([])
  const api = useMemo(() => createOwnedPickerApi(layers), [])
  const busyRef = useRef(busy)
  busyRef.current = busy
  const { asking, requestClose, ask, keepEditing, discard, reset } = useDiscardGuard(snapshot, onClose)
  const askingRef = useRef(asking)
  askingRef.current = asking
  const requestCloseRef = useRef(requestClose)
  requestCloseRef.current = requestClose
  const askRef = useRef(ask)
  askRef.current = ask
  const keepEditingRef = useRef(keepEditing)
  keepEditingRef.current = keepEditing

  const baselineKey = baseline == null ? null : JSON.stringify(baseline)
  useEffect(() => {
    if (baselineKey == null) return
    reset(baseline)
  }, [baseline, baselineKey, reset])

  const guardedClose = () => {
    if (busyRef.current || askingRef.current) return
    const top = api.top()
    if (top?.portal && top.dismissOnBackdrop !== false) return
    returnFocus.current = rememberField()
    if (api.retainsDraft()) {
      askRef.current()
      return
    }
    requestCloseRef.current()
  }

  const openerRef = useRef<HTMLElement | null>(null)
  const focusGeneration = useRef(0)

  useLayoutEffect(() => {
    const panel = panelRef.current
    const generation = ++focusGeneration.current
    const current = document.activeElement
    if (
      openerRef.current == null &&
      current instanceof HTMLElement &&
      panel &&
      current !== panel &&
      !panel.contains(current)
    ) {
      openerRef.current = current
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (panel) focusDialog(panel)
    return () => {
      document.body.style.overflow = previousOverflow
      const restoreOpener = openerRef.current
      queueMicrotask(() => {
        if (focusGeneration.current !== generation) return
        if (handoffRef.current) return
        if (!(restoreOpener instanceof HTMLElement) || !restoreOpener.isConnected) return
        const active = document.activeElement
        if (active instanceof HTMLElement && active.isConnected && active !== document.body) {
          if (active.closest('[role="dialog"],[role="alertdialog"]')) return
          if (active !== restoreOpener) return
        }
        restoreOpener.focus()
      })
    }
  }, [handoffRef])

  useEffect(() => {
    if (!asking) return
    cancelRef.current?.focus()
  }, [asking])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const surface = askingRef.current
          ? questionRef.current
          : (api.top()?.portal ?? panelRef.current)
        if (!surface) return
        containTab(event, surface)
        return
      }
      if (event.key !== 'Escape') return
      if (askingRef.current) {
        event.preventDefault()
        event.stopPropagation()
        keepEditingRef.current()
        const field = returnFocus.current
        const panel = panelRef.current
        queueMicrotask(() => {
          if (field?.isConnected && panel?.contains(field)) field.focus()
          else panel?.focus()
        })
        return
      }
      if (dismissTopOwnedPicker(api)) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (busyRef.current) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      guardedClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [api])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const top = api.top()
      if (!top?.portal || top.dismissOnBackdrop === false) return
      const node = event.target as Node | null
      const backdrop = backdropRef.current
      const panel = panelRef.current
      if (!node || !backdrop || !panel) return
      if (top.portal.contains(node) || top.trigger?.contains(node) || panel.contains(node)) return
      if (!backdrop.contains(node)) return
      dismissTopOwnedPicker(api)
      suppressBackdropClick.current = true
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [api])

  const finishKeepEditing = () => {
    const field = returnFocus.current
    const panel = panelRef.current
    keepEditing()
    queueMicrotask(() => {
      if (field?.isConnected && panel?.contains(field)) field.focus()
      else panel?.focus()
    })
  }

  return ReactDOM.createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[10000] flex items-start sm:items-center justify-center px-4 trek-modal-backdrop trek-backdrop-enter"
      style={{
        paddingTop: 70,
        paddingBottom: 'calc(20px + var(--bottom-nav-h))',
        overflow: 'hidden',
        background: 'color-mix(in srgb, var(--text-primary) 45%, transparent)',
      }}
      onMouseDown={event => { pressedOn.current = event.target }}
      onClick={event => {
        if (suppressBackdropClick.current) {
          suppressBackdropClick.current = false
          pressedOn.current = null
          return
        }
        if (busyRef.current || askingRef.current) {
          pressedOn.current = null
          return
        }
        const top = api.top()
        if (top?.portal && top.dismissOnBackdrop !== false) {
          pressedOn.current = null
          return
        }
        if (event.target === event.currentTarget && pressedOn.current === event.currentTarget) guardedClose()
        pressedOn.current = null
      }}
    >
      <OwnedPickerLayerProvider api={api}>
        <BookingRequestCloseContext.Provider value={guardedClose}>
          <div
            ref={panelRef}
            role="dialog"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="trek-modal-enter rounded-2xl overflow-hidden shadow-2xl w-full max-w-[720px] flex flex-col max-h-[calc(100dvh-var(--bottom-nav-h)-90px)] sm:max-h-[calc(100dvh-90px)] bg-surface-card outline-none relative"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex-none" inert={asking ? true : undefined} aria-hidden={asking ? true : undefined}>
              <BookingDialogHeader labelId={titleId} type={bookingType}
                tone={bookingStatus === 'confirmed' ? 'confirmed' : 'pending'}
                eyebrow={title} title={bookingTitle || title} titleInput={titleInput} onClose={guardedClose}
                pills={<><TypePill type={bookingType}/><StatusPill status={bookingStatus === 'confirmed' ? 'confirmed' : 'pending'}/></>} />
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6 pt-5" inert={asking ? true : undefined} aria-hidden={asking ? true : undefined}>
              {children}
            </div>
            {footer && (
              <div className="flex-none border-t border-edge-faint px-6 py-3.5" inert={asking ? true : undefined} aria-hidden={asking ? true : undefined}>
                {footer}
              </div>
            )}
            {asking && (
              <div
                className="trek-backdrop-enter absolute inset-0 z-10 grid place-items-center p-6"
                style={{ background: 'color-mix(in srgb, var(--bg-card) 72%, transparent)' }}
              >
                <div
                  ref={questionRef}
                  role="alertdialog"
                  aria-labelledby={questionId}
                  className="trek-modal-enter w-full max-w-[340px] rounded-[18px] border border-edge bg-surface-card p-5 shadow-xl"
                >
                  <div id={questionId} className="font-semibold text-content">{t('common.discardChanges')}</div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      ref={cancelRef}
                      type="button"
                      onClick={finishKeepEditing}
                      className="bg-[var(--text-primary)] text-[var(--bg-primary)]"
                      style={{ padding: '8px 16px', borderRadius: 10, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={discard}
                      className="text-content border border-edge bg-surface-card"
                      style={{ padding: '8px 16px', borderRadius: 10, fontFamily: 'inherit', cursor: 'pointer' }}
                    >
                      {t('common.discard')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </BookingRequestCloseContext.Provider>
      </OwnedPickerLayerProvider>
    </div>,
    document.body,
  )
}
