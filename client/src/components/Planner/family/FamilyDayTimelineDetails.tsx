import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import ConfirmDialog from '../../shared/ConfirmDialog'
import { useToast } from '../../shared/Toast'
import { useTranslation } from '../../../i18n'
import { listTripExpenses, type FamilyTripExpense } from '../../../data/supabase/tripExpenses'
import { listTripFiles, signedTripFileUrl, type FamilyTripFile } from '../../../data/supabase/tripFiles'
import { openFile } from '../../../utils/fileDownload'
import {
  deleteTripReservation,
  type FamilyBookingDraft,
  type FamilyExpensePrefill,
  type FamilyTransportReservation,
  type FamilyTripReservation,
  type ReservationStatus,
} from '../../../data/supabase/tripReservations'
import type { FamilyScheduleItem } from '../../../data/supabase/scheduleItems'
import type { FamilyTripDay } from '../../../data/supabase/tripDays'
import type { FamilyTripPlace } from '../../../data/supabase/tripPlaces'
import FamilyBookingDetailDialog from '../FamilyBookingDetailDialog'
import FamilyBookingEditor from '../FamilyBookingEditor'
import FamilyTransportDetailDialog from '../FamilyTransportDetailDialog'
import FamilyTransportEditor from '../FamilyTransportEditor'
import { projectFamilyBookingDetail } from '../familyBookingDetail'
import { projectFamilyTransportDetail } from '../familyTransportDetail'
import type { ModalFocusScope } from '../../shared/Modal'

export type FamilyDayTimelineDetailsHandle = {
  openTarget: (kind: 'booking' | 'transport', id: string, trigger: HTMLElement) => void
}

export type FamilyDayTimelineDetailsProps = {
  tripId: string
  familyId: string
  mePersonId: string | null
  locale: string
  currencyCode: string
  days: FamilyTripDay[]
  places: FamilyTripPlace[]
  scheduleItems: FamilyScheduleItem[]
  bookings: FamilyTripReservation[]
  transports: FamilyTransportReservation[]
  reservationsMode: 'direct' | 'draft' | 'nudge' | 'deny'
  canEditPublished: boolean
  onStageBookingDraft?: (draft: FamilyBookingDraft) => Promise<boolean>
  onStageBookingDelete?: (id: string) => Promise<boolean>
  onStageBookingStatus?: (id: string, status: ReservationStatus) => Promise<boolean>
  onReservationsChanged: () => Promise<void>
  onOpenCostsPrefill: (prefill: FamilyExpensePrefill) => void
}

type OpenKind = 'booking' | 'transport'

export const FamilyDayTimelineDetails = forwardRef<FamilyDayTimelineDetailsHandle, FamilyDayTimelineDetailsProps>(function FamilyDayTimelineDetails({
  tripId,
  familyId,
  mePersonId,
  locale,
  currencyCode,
  days,
  places,
  scheduleItems,
  bookings,
  transports,
  reservationsMode,
  canEditPublished,
  onStageBookingDraft,
  onStageBookingDelete,
  onReservationsChanged,
  onOpenCostsPrefill,
}, ref) {
  const { t } = useTranslation()
  const toast = useToast()
  const [kind, setKind] = useState<OpenKind | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [surface, setSurface] = useState<'detail' | 'editor' | 'confirm' | null>(null)
  const [files, setFiles] = useState<FamilyTripFile[]>([])
  const [filePhase, setFilePhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [fileRetry, setFileRetry] = useState(0)
  const [expenses, setExpenses] = useState<FamilyTripExpense[]>([])
  const [expensePhase, setExpensePhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [expenseRetry, setExpenseRetry] = useState(0)
  const triggerRef = useRef<HTMLElement | null>(null)
  const detailHandoffRef = useRef(false)
  const suppressRestoreRef = useRef(false)
  const fileRequestRef = useRef(0)
  const expenseRequestRef = useRef(0)
  const bookingEditorSourceRef = useRef<FamilyTripReservation | null>(null)
  const transportEditorSourceRef = useRef<FamilyTransportReservation | null>(null)

  useImperativeHandle(ref, () => ({
    openTarget(nextKind, id, trigger) {
      detailHandoffRef.current = false
      suppressRestoreRef.current = false
      triggerRef.current = trigger
      setKind(nextKind)
      setOpenId(id)
      setSurface('detail')
    },
  }), [])

  useEffect(() => {
    if (!openId) {
      fileRequestRef.current += 1
      return
    }
    const token = ++fileRequestRef.current
    setFilePhase('loading')
    setFiles([])
    listTripFiles(tripId).then(next => {
      if (fileRequestRef.current !== token) return
      setFiles(next)
      setFilePhase('ready')
    }).catch(() => {
      if (fileRequestRef.current !== token) return
      setFilePhase('error')
      setFiles([])
    })
    return () => { fileRequestRef.current += 1 }
  }, [openId, tripId, fileRetry])

  useEffect(() => {
    if (!openId) {
      expenseRequestRef.current += 1
      return
    }
    const token = ++expenseRequestRef.current
    setExpensePhase('loading')
    setExpenses([])
    listTripExpenses(tripId).then(next => {
      if (expenseRequestRef.current !== token) return
      setExpenses(next)
      setExpensePhase('ready')
    }).catch(() => {
      if (expenseRequestRef.current !== token) return
      setExpensePhase('error')
      setExpenses([])
    })
    return () => { expenseRequestRef.current += 1 }
  }, [openId, tripId, expenseRetry])

  const refreshExpenses = useCallback(() => {
    if (!openId) return Promise.resolve()
    const token = ++expenseRequestRef.current
    setExpensePhase('loading')
    return listTripExpenses(tripId).then(next => {
      if (expenseRequestRef.current !== token) return
      setExpenses(next)
      setExpensePhase('ready')
    }).catch(() => {
      if (expenseRequestRef.current !== token) return
      setExpensePhase('error')
    })
  }, [openId, tripId])

  const booking = bookings.find(row => row.id === openId) ?? null
  const transport = transports.find(row => row.id === openId) ?? null
  const bookingCanMutate = reservationsMode === 'direct' || reservationsMode === 'draft'
  const transportCanMutate = canEditPublished
  const linkedExpense = expenses.find(expense => expense.reservationId === openId) ?? null

  const closeDetails = () => {
    detailHandoffRef.current = false
    setSurface(null)
    setOpenId(null)
    setKind(null)
  }

  const beginEdit = (next: OpenKind) => {
    const trigger = triggerRef.current
    detailHandoffRef.current = true
    if (trigger?.isConnected) trigger.focus()
    if (next === 'booking') bookingEditorSourceRef.current = bookings.find(row => row.id === openId) ?? null
    else transportEditorSourceRef.current = transports.find(row => row.id === openId) ?? null
    setKind(next)
    setSurface('editor')
  }

  const beginDelete = () => {
    detailHandoffRef.current = true
    setSurface('confirm')
  }

  const confirmDelete = async () => {
    const id = openId
    if (!id) {
      setSurface(null)
      return
    }
    try {
      if (kind === 'booking' && reservationsMode === 'draft') {
        await onStageBookingDelete?.(id)
      } else if (kind === 'booking' && reservationsMode === 'direct') {
        await deleteTripReservation(id)
        await onReservationsChanged()
      } else if (kind === 'transport' && canEditPublished) {
        await deleteTripReservation(id)
        await onReservationsChanged()
      }
    } catch {
      toast.error(t('reservations.toast.deleteError'))
    } finally {
      setSurface(null)
      setOpenId(null)
      setKind(null)
    }
  }

  const focusScope: ModalFocusScope | undefined = surface === 'editor' && kind === 'transport'
    ? { restoreTo: triggerRef.current, suppressRestoreRef }
    : undefined

  const bookingDetail = kind === 'booking' && booking && surface === 'detail' ? projectFamilyBookingDetail({
    reservation: booking,
    days,
    expenses: expensePhase === 'ready' ? expenses : [],
    currencyCode,
    files,
  }) : null
  const transportDetail = kind === 'transport' && transport && surface === 'detail' ? projectFamilyTransportDetail({
    reservation: transport,
    days,
    expenses: expensePhase === 'ready' ? expenses : [],
    currencyCode,
    files,
  }) : null

  return (
    <>
      {bookingDetail && (
        <FamilyBookingDetailDialog
          detail={bookingDetail}
          locale={locale}
          canMutate={bookingCanMutate}
          filesPhase={filePhase === 'error' ? 'error' : filePhase === 'ready' ? 'ready' : 'loading'}
          expensesPhase={expensePhase}
          onRetryExpenses={() => setExpenseRetry(n => n + 1)}
          trigger={triggerRef.current}
          handoffRef={detailHandoffRef}
          onClose={closeDetails}
          onRetryFiles={() => setFileRetry(n => n + 1)}
          onOpenFile={async file => {
            try {
              const url = await signedTripFileUrl(file.storagePath, 120)
              await openFile(url, file.originalName)
            } catch {
              toast.error(t('files.openError'))
            }
          }}
          onEdit={bookingCanMutate ? () => beginEdit('booking') : undefined}
          onDelete={bookingCanMutate ? beginDelete : undefined}
        />
      )}
      {transportDetail && (
        <FamilyTransportDetailDialog
          detail={transportDetail}
          locale={locale}
          canMutate={transportCanMutate}
          filesPhase={filePhase === 'error' ? 'error' : filePhase === 'ready' ? 'ready' : 'loading'}
          expensesPhase={expensePhase}
          onRetryExpenses={() => setExpenseRetry(n => n + 1)}
          trigger={triggerRef.current}
          handoffRef={detailHandoffRef}
          onClose={closeDetails}
          onRetryFiles={() => setFileRetry(n => n + 1)}
          onOpenFile={async file => {
            try {
              const url = await signedTripFileUrl(file.storagePath, 120)
              await openFile(url, file.originalName)
            } catch {
              toast.error(t('files.openError'))
            }
          }}
          onEdit={transportCanMutate ? () => beginEdit('transport') : undefined}
          onDelete={transportCanMutate ? beginDelete : undefined}
        />
      )}
      <FamilyBookingEditor
        open={surface === 'editor' && kind === 'booking'}
        tripId={tripId}
        reservation={surface === 'editor' && kind === 'booking' ? bookingEditorSourceRef.current : booking}
        days={days}
        places={places}
        scheduleItems={scheduleItems}
        linkedExpense={linkedExpense}
        currencyCode={currencyCode}
        locale={locale}
        canMutate={bookingCanMutate}
        onStageDraft={reservationsMode === 'draft' ? onStageBookingDraft : undefined}
        familyId={familyId}
        mePersonId={mePersonId}
        onClose={() => { setSurface(null); setOpenId(null); setKind(null) }}
        onSaved={onReservationsChanged}
        onOpenCostsPrefill={onOpenCostsPrefill}
        onExpenseUnlinked={() => {
          void onReservationsChanged()
          return refreshExpenses()
        }}
      />
      <FamilyTransportEditor
        open={surface === 'editor' && kind === 'transport'}
        tripId={tripId}
        reservation={surface === 'editor' && kind === 'transport' ? transportEditorSourceRef.current : transport}
        days={days}
        places={places}
        linkedExpense={linkedExpense}
        currencyCode={currencyCode}
        locale={locale}
        canMutate={transportCanMutate}
        familyId={familyId}
        mePersonId={mePersonId}
        focusScope={focusScope}
        onClose={() => { setSurface(null); setOpenId(null); setKind(null) }}
        onSaved={onReservationsChanged}
        onOpenCostsPrefill={onOpenCostsPrefill}
        onExpenseUnlinked={() => {
          void onReservationsChanged()
          return refreshExpenses()
        }}
      />
      <ConfirmDialog
        isOpen={surface === 'confirm'}
        onClose={() => { setSurface(null); setOpenId(null); setKind(null) }}
        onConfirm={() => { void confirmDelete() }}
        title={t('reservations.confirm.deleteTitle')}
        message={t('reservations.confirm.deleteBody', { name: booking?.title ?? transport?.title ?? '' })}
        danger
        initialFocus="cancel"
        restoreFocusTo={triggerRef.current}
      />
    </>
  )
})
