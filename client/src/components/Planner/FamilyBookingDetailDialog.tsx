import { useEffect, useId, useLayoutEffect, useRef, type ReactElement, type RefObject } from 'react'
import ReactDOM from 'react-dom'
import { BookingDialogHeader, StatusPill, TypePill } from './bookings/BookingDialogShell'
import { DialogFooter, DialogButton, DeleteButton, FooterSpacer, DialogSection } from '../shared/DialogShell'
import { Field, BOX } from './bookings/bookingPresentation'
import { containTab, focusDialog } from '../shared/dialogFocus'
import { useToast } from '../shared/Toast'
import { useTranslation } from '../../i18n'
import { formatDate, formatMoney } from '../../utils/formatters'
import type { FamilyBookingDetail, FamilyBookingDetailFile } from './familyBookingDetail'

export type FamilyBookingDetailDialogProps = {
  detail: FamilyBookingDetail
  locale: string
  canMutate: boolean
  filesPhase: 'loading' | 'ready' | 'error'
  trigger: HTMLElement | null
  handoffRef: RefObject<boolean>
  onClose: () => void
  onRetryFiles: () => void
  onOpenFile: (file: FamilyBookingDetailFile) => Promise<void>
  onEdit?: () => void
  onDelete?: () => void
  expensesPhase?: 'loading' | 'ready' | 'error'
  onRetryExpenses?: () => void
}

export default function FamilyBookingDetailDialog({
  detail,
  locale,
  canMutate,
  filesPhase,
  trigger,
  handoffRef,
  onClose,
  onRetryFiles,
  onOpenFile,
  onEdit,
  onDelete,
  expensesPhase = 'ready',
  onRetryExpenses,
}: FamilyBookingDetailDialogProps): ReactElement {
  const { t } = useTranslation()
  const toast = useToast()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const pressedOn = useRef<EventTarget | null>(null)
  const triggerRef = useRef(trigger)
  triggerRef.current = trigger
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (panel) focusDialog(panel)
    return () => {
      if (handoffRef.current) return
      const opener = triggerRef.current
      if (opener?.isConnected) opener.focus()
    }
  }, [handoffRef])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && panelRef.current) {
        containTab(event, panelRef.current)
        return
      }
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  const copyCode = async () => {
    if (!detail.confirmationCode) return
    try {
      await navigator.clipboard.writeText(detail.confirmationCode)
      toast.success(t('common.copied'))
    } catch {
      toast.error(t('common.unknownError'))
    }
  }

  const start = formatDate(detail.startCivil, locale)
  const end = formatDate(detail.endCivil, locale)

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
        if (event.target === event.currentTarget && pressedOn.current === event.currentTarget) onClose()
        pressedOn.current = null
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="trek-modal-enter rounded-2xl overflow-hidden shadow-2xl w-full max-w-[600px] flex flex-col max-h-[calc(100dvh-var(--bottom-nav-h)-90px)] bg-surface-card outline-none"
        onClick={event => event.stopPropagation()}
      >
        <BookingDialogHeader
          labelId={titleId} title={detail.title} type={detail.type}
          tone={detail.status === 'confirmed' ? 'confirmed' : 'pending'} onClose={onClose}
          pills={<><TypePill type={detail.type} /><StatusPill status={detail.status === 'confirmed' ? 'confirmed' : 'pending'} /></>}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6 pt-5">
          {(start || end) && (
            <Field label={t('reservations.date')}>{start}{end && end !== start ? ` – ${end}` : ''}</Field>
          )}
          {detail.timeLabel && <Field label={t('reservations.time')} tabular>{detail.timeLabel}</Field>}
          {detail.notes && <DialogSection label={t('reservations.notes')}>
            <div className={`${BOX} whitespace-pre-wrap break-words px-3 py-2 text-content`}>{detail.notes}</div>
          </DialogSection>}
          {detail.confirmationCode && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.03em] text-content-faint">{t('reservations.confirmationCode')}</div>
                <div className={`${BOX} px-3 py-2 font-semibold text-content`}>{detail.confirmationCode}</div>
              </div>
              <button type="button" onClick={() => { void copyCode() }} className="text-content border border-edge bg-surface-card rounded-[10px] px-3 py-2">
                {t('common.copy')}
              </button>
            </div>
          )}
          <DialogSection label={t('reservations.costsLabel')}>
            {expensesPhase === 'loading' && <p className="text-content-muted m-0">{t('common.loading')}</p>}
            {expensesPhase === 'error' && (
              <div className="flex items-center gap-3">
                <p className="text-content-muted m-0">{t('common.error')}</p>
                {onRetryExpenses && (
                  <button type="button" onClick={onRetryExpenses} className="text-content border border-edge bg-surface-card rounded-[10px] px-3 py-2">
                    {t('trip.load.retry')}
                  </button>
                )}
              </div>
            )}
            {expensesPhase === 'ready' && detail.expenses.length === 0 ? (
              <p className="text-content-muted m-0">{t('common.none')}</p>
            ) : expensesPhase === 'ready' ? (
              <ul className="m-0 p-0 list-none flex flex-col gap-2">
                {detail.expenses.map(expense => (
                  <li key={expense.id} className="flex items-center justify-between gap-3 text-content">
                    <span>{expense.name}</span>
                    <span>{formatMoney(expense.amount, expense.currencyCode, locale)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </DialogSection>
          <DialogSection label={t('files.title')}>
            {filesPhase === 'loading' && <p className="text-content-muted m-0">{t('common.loading')}</p>}
            {filesPhase === 'error' && (
              <div className="flex items-center gap-3">
                <p className="text-content-muted m-0">{t('common.error')}</p>
                <button type="button" onClick={onRetryFiles} className="text-content border border-edge bg-surface-card rounded-[10px] px-3 py-2">
                  {t('trip.load.retry')}
                </button>
              </div>
            )}
            {filesPhase === 'ready' && detail.files.length === 0 && (
              <p className="text-content-muted m-0">{t('files.empty')}</p>
            )}
            {filesPhase === 'ready' && detail.files.length > 0 && (
              <ul className="m-0 p-0 list-none flex flex-col gap-2">
                {detail.files.map(file => (
                  <li key={file.id}>
                    <button
                      type="button"
                      onClick={() => { void onOpenFile(file) }}
                      className="text-content border border-edge bg-surface-card rounded-[10px] px-3 py-2 w-full text-left"
                    >
                      {file.originalName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DialogSection>
        </div>
        {canMutate && (onEdit || onDelete) && (
          <DialogFooter>
            {onDelete && <DeleteButton onClick={onDelete} />}
            <FooterSpacer />
            {onEdit && <DialogButton variant="primary" onClick={onEdit}>{t('common.edit')}</DialogButton>}
          </DialogFooter>
        )}
      </div>
    </div>,
    document.body,
  )
}
