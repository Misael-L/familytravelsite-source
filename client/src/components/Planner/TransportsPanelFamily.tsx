/**
 * W6.1 Family Transport tab — TREK ReservationsPanel transports language, UUID trip_reservations.
 * Nest ReservationsPanel stays on the nest plane.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import {
  AlertCircle, Bike, BookMarked, Bus, Car, CarTaxiFront, CheckCircle2, ChevronDown, ChevronRight, Circle,
  Download, FolderOpen, Pencil, Plane, Plus, Route, Sailboat, Ship, Train, Trash2, TramFront,
} from 'lucide-react'
import { useToast } from '../shared/Toast'
import { useTranslation } from '../../i18n'
import ConfirmDialog from '../shared/ConfirmDialog'
import type { FamilyTripDay } from '../../data/supabase/tripDays'
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces'
import type { FamilyScheduleItem } from '../../data/supabase/scheduleItems'
import {
  deleteTripReservation,
  listTripTransports,
  setTripReservationStatus,
  transportLegMeta,
  transportRouteLabel,
  type FamilyExpensePrefill,
  type FamilyTransportReservation,
  type TransportType,
} from '../../data/supabase/tripReservations'
import { listTripExpenses, type FamilyTripExpense } from '../../data/supabase/tripExpenses'
import { listTripFiles, signedTripFileUrl, type FamilyTripFile } from '../../data/supabase/tripFiles'
import { openFile } from '../../utils/fileDownload'
import { mapImportItemsToReview, type FamilyImportItem, type FamilyImportReviewItem } from '../../data/bookingImport'
import FamilyBookingEditor from './FamilyBookingEditor'
import FamilyTransportEditor from './FamilyTransportEditor'
import FamilyTransportDetailDialog from './FamilyTransportDetailDialog'
import { projectFamilyTransportDetail, type FamilyTransportDetailFile } from './familyTransportDetail'
import BookingImportModal from './BookingImportModal'

const TYPE_META: { value: TransportType; labelKey: string; Icon: typeof Plane; color: string }[] = [
  { value: 'flight', labelKey: 'reservations.type.flight', Icon: Plane, color: '#3b82f6' },
  { value: 'train', labelKey: 'reservations.type.train', Icon: Train, color: '#06b6d4' },
  { value: 'bus', labelKey: 'reservations.type.bus', Icon: Bus, color: '#059669' },
  { value: 'car', labelKey: 'reservations.type.car', Icon: Car, color: '#6b7280' },
  { value: 'taxi', labelKey: 'reservations.type.taxi', Icon: CarTaxiFront, color: '#ca8a04' },
  { value: 'bicycle', labelKey: 'reservations.type.bicycle', Icon: Bike, color: '#84cc16' },
  { value: 'cruise', labelKey: 'reservations.type.cruise', Icon: Ship, color: '#0ea5e9' },
  { value: 'ferry', labelKey: 'reservations.type.ferry', Icon: Sailboat, color: '#0d9488' },
  { value: 'transit', labelKey: 'reservations.type.transit', Icon: TramFront, color: '#7c3aed' },
  { value: 'transport_other', labelKey: 'reservations.type.transport_other', Icon: Route, color: '#6b7280' },
]

const fieldLabelClass = 'text-[10px] font-semibold uppercase tracking-[0.08em] text-content-faint mb-[5px]'
const fieldValueClass = 'text-[13px] font-medium text-content px-[10px] py-[8px] bg-surface-tertiary rounded-[10px]'

export type TransportCreateRequest = {
  dayId: string | null
  automated: boolean
}

export type TransportsPanelFamilyProps = {
  tripId: string
  canMutate: boolean
  familyId: string
  mePersonId: string | null
  days: FamilyTripDay[]
  places: FamilyTripPlace[]
  scheduleItems: FamilyScheduleItem[]
  currencyCode: string
  onOpenCostsPrefill: (prefill: FamilyExpensePrefill) => void
  createRequest?: TransportCreateRequest | null
  onCreateRequestConsumed?: () => void
}

export default function TransportsPanelFamily({
  tripId,
  canMutate,
  familyId,
  mePersonId,
  days,
  places,
  scheduleItems,
  currencyCode,
  onOpenCostsPrefill,
  createRequest = null,
  onCreateRequestConsumed,
}: TransportsPanelFamilyProps): ReactElement {
  const { t, locale } = useTranslation()
  const toast = useToast()
  const [rows, setRows] = useState<FamilyTransportReservation[]>([])
  const [expenses, setExpenses] = useState<FamilyTripExpense[]>([])
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [editorOpen, setEditorOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<FamilyTransportReservation | null>(null)
  const [seedDayId, setSeedDayId] = useState<string | null>(null)
  const [initialAutomated, setInitialAutomated] = useState(false)
  const [reviewQueue, setReviewQueue] = useState<FamilyImportReviewItem[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const reviewSavedRef = useRef(0)
  const [pendingDelete, setPendingDelete] = useState<FamilyTransportReservation | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailFiles, setDetailFiles] = useState<FamilyTripFile[]>([])
  const [filePhase, setFilePhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [fileRetry, setFileRetry] = useState(0)
  const [detailEditScope, setDetailEditScope] = useState(false)
  const detailTriggerRef = useRef<HTMLElement | null>(null)
  const detailHandoffRef = useRef(false)
  const deleteRestoreRef = useRef<HTMLElement | null>(null)
  const suppressRestoreRef = useRef(false)
  const fileRequestRef = useRef(0)
  const storageKey = `family-transport-filters-${tripId}`
  const [typeFilters, setTypeFilters] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set()
    } catch {
      return new Set()
    }
  })

  const load = useCallback(async () => {
    try {
      const [transports, exp] = await Promise.all([
        listTripTransports(tripId),
        listTripExpenses(tripId),
      ])
      setRows(transports)
      setExpenses(exp)
      setPhase('ready')
    } catch {
      setPhase('error')
    }
  }, [tripId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!detailId) {
      fileRequestRef.current += 1
      return
    }
    const token = ++fileRequestRef.current
    setFilePhase('loading')
    setDetailFiles([])
    listTripFiles(tripId).then(files => {
      if (fileRequestRef.current !== token) return
      setDetailFiles(files)
      setFilePhase('ready')
    }).catch(() => {
      if (fileRequestRef.current !== token) return
      setFilePhase('error')
      setDetailFiles([])
    })
    return () => { fileRequestRef.current += 1 }
  }, [detailId, tripId, fileRetry])

  const toastHof = () => toast.error(t('trip.explore.add.hofOnly'))

  const extractFamilyFiles = useCallback(async (files: File[]) => {
    const { extractBookingFiles } = await import('../../data/bookingImport')
    return extractBookingFiles(files)
  }, [])

  const openCreate = (opts?: { dayId?: string | null; automated?: boolean }) => {
    if (!canMutate) { toastHof(); return }
    setReviewQueue([])
    setReviewIndex(0)
    setEditing(null)
    setSeedDayId(opts?.dayId ?? null)
    setInitialAutomated(opts?.automated === true)
    setDetailEditScope(false)
    suppressRestoreRef.current = false
    setEditorOpen(true)
  }

  useEffect(() => {
    if (!createRequest) return
    openCreate({ dayId: createRequest.dayId, automated: createRequest.automated })
    onCreateRequestConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRequest])

  const toggleTypeFilter = (type: string) => {
    setTypeFilters(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      sessionStorage.setItem(storageKey, JSON.stringify([...next]))
      return next
    })
  }

  const filtered = useMemo(
    () => (typeFilters.size === 0 ? rows : rows.filter(r => typeFilters.has(r.type))),
    [rows, typeFilters],
  )

  const sorted = useMemo(() => {
    const dayDates = new Map(days.map(d => [d.id, d.civilDay]))
    const sortKey = (r: FamilyTransportReservation): string | null => {
      const civil = r.startsAt?.slice(0, 10)
        ?? r.endpoints[0]?.localDate
        ?? (r.startTripDayId ? dayDates.get(r.startTripDayId) ?? null : null)
      return civil
    }
    return filtered.slice().sort((a, b) => {
      const ka = sortKey(a)
      const kb = sortKey(b)
      if (ka !== kb) {
        if (ka == null) return 1
        if (kb == null) return -1
        return ka.localeCompare(kb)
      }
      return a.createdAt.localeCompare(b.createdAt)
    })
  }, [filtered, days])

  const pending = sorted.filter(r => r.status !== 'confirmed')
  const confirmed = sorted.filter(r => r.status === 'confirmed')
  const usedTypes = useMemo(() => new Set(rows.map(r => r.type)), [rows])
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of rows) counts[r.type] = (counts[r.type] || 0) + 1
    return counts
  }, [rows])

  const openImport = () => {
    if (!canMutate) { toastHof(); return }
    setImportOpen(true)
  }

  const openEdit = (r: FamilyTransportReservation, fromDetails = false) => {
    setReviewQueue([])
    setReviewIndex(0)
    setEditing(r)
    setSeedDayId(null)
    setInitialAutomated(false)
    setDetailEditScope(fromDetails)
    if (!fromDetails) suppressRestoreRef.current = false
    setEditorOpen(true)
  }

  const openDetails = (r: FamilyTransportReservation, trigger: HTMLElement) => {
    detailHandoffRef.current = false
    detailTriggerRef.current = trigger
    setDetailId(r.id)
  }

  const closeDetails = () => {
    detailHandoffRef.current = false
    setDetailId(null)
  }

  const editFromDetails = () => {
    const reservation = rows.find(row => row.id === detailId)
    const trigger = detailTriggerRef.current
    detailHandoffRef.current = true
    if (trigger?.isConnected) trigger.focus()
    suppressRestoreRef.current = false
    setDetailId(null)
    if (reservation) openEdit(reservation, true)
  }

  const openDetailFile = async (file: FamilyTransportDetailFile) => {
    try {
      const url = await signedTripFileUrl(file.storagePath, 120)
      await openFile(url, file.originalName)
    } catch {
      toast.error(t('files.openError'))
    }
  }

  const confirmImportPreview = (items: FamilyImportItem[]) => {
    const drafts = mapImportItemsToReview(items, places, days)
    setImportOpen(false)
    if (drafts.length === 0) {
      toast.error(t('reservations.import.previewEmpty'))
      return
    }
    reviewSavedRef.current = 0
    setEditing(null)
    setSeedDayId(null)
    setInitialAutomated(false)
    setDetailEditScope(false)
    suppressRestoreRef.current = false
    setReviewQueue(drafts)
    setReviewIndex(0)
    setEditorOpen(true)
  }

  const closeEditor = () => {
    if (reviewQueue.length > 0) {
      const next = reviewIndex + 1
      if (next >= reviewQueue.length) {
        const n = reviewSavedRef.current
        setReviewQueue([])
        setReviewIndex(0)
        setEditorOpen(false)
        setEditing(null)
        setDetailEditScope(false)
        if (n > 0) toast.success(t('reservations.import.success', { count: n }))
      } else {
        setReviewIndex(next)
      }
      return
    }
    setEditorOpen(false)
    setEditing(null)
    setInitialAutomated(false)
    setDetailEditScope(false)
  }

  const handleEditorSaved = async () => {
    await load()
    if (reviewQueue.length > 0) reviewSavedRef.current += 1
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    if (!canMutate) { toastHof(); setPendingDelete(null); return }
    try {
      await deleteTripReservation(pendingDelete.id)
      toast.success(t('reservations.toast.removed'))
      setPendingDelete(null)
      await load()
    } catch {
      toast.error(t('reservations.toast.deleteError'))
    }
  }

  const handleToggleStatus = async (r: FamilyTransportReservation) => {
    if (!canMutate) { toastHof(); return }
    try {
      await setTripReservationStatus(r.id, r.status === 'confirmed' ? 'pending' : 'confirmed')
      await load()
    } catch {
      toast.error(t('reservations.toast.updateError'))
    }
  }

  const linkedFor = (id: string) => expenses.find(e => e.reservationId === id) ?? null
  const detailReservation = rows.find(row => row.id === detailId) ?? null
  const detail = detailReservation
    ? projectFamilyTransportDetail({
      reservation: detailReservation,
      days,
      expenses,
      currencyCode,
      files: detailFiles,
    })
    : null
  const review = reviewQueue[reviewIndex]
  const showTransportEditor = editorOpen && (review ? review.kind === 'transport' : true)
  const showBookingEditor = editorOpen && review?.kind === 'booking'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-system)' }}>
      <div style={{ padding: '24px 28px 0' }} className="max-md:!px-4 max-md:!pt-4">
        <div className="bg-surface-tertiary" style={{
          borderRadius: 18, padding: '14px 16px 14px 22px',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <h2 className="text-content" style={{ margin: 0, fontSize: 'calc(18px * var(--fs-scale-subtitle, 1))', fontWeight: 600, letterSpacing: '-0.01em', flexShrink: 0 }}>
            {t('transport.title')}
          </h2>

          {rows.length > 0 && (
            <>
              <div className="hidden md:block" style={{ width: 1, height: 22, background: 'var(--border-faint)', flexShrink: 0 }} />
              <div className="hidden md:inline-flex" style={{ gap: 4, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => { setTypeFilters(new Set()); sessionStorage.removeItem(storageKey) }}
                  className={typeFilters.size === 0 ? 'bg-surface-card text-content' : 'bg-transparent text-content-muted'}
                  style={{
                    appearance: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 99, fontSize: 'calc(13px * var(--fs-scale-body, 1))',
                    fontWeight: typeFilters.size === 0 ? 500 : 400,
                    boxShadow: typeFilters.size === 0 ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  {t('common.all')}
                  <span className={`text-content-faint ${typeFilters.size === 0 ? 'bg-surface-tertiary' : 'bg-[rgba(0,0,0,0.06)]'}`} style={{
                    fontSize: 'calc(10px * var(--fs-scale-caption, 1))', fontWeight: 600,
                    padding: '1px 6px', borderRadius: 99, minWidth: 16, textAlign: 'center',
                  }}>{rows.length}</span>
                </button>
                {TYPE_META.filter(opt => usedTypes.has(opt.value)).map(opt => {
                  const active = typeFilters.has(opt.value)
                  const Icon = opt.Icon
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleTypeFilter(opt.value)}
                      className={active ? 'bg-surface-card text-content' : 'bg-transparent text-content-muted'}
                      style={{
                        appearance: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 99, fontSize: 'calc(13px * var(--fs-scale-body, 1))',
                        fontWeight: active ? 500 : 400,
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                      }}
                    >
                      <Icon size={13} style={{ color: active ? opt.color : 'var(--text-faint)' }} />
                      {t(opt.labelKey)}
                      <span className={`text-content-faint ${active ? 'bg-surface-tertiary' : 'bg-[rgba(0,0,0,0.06)]'}`} style={{
                        fontSize: 'calc(10px * var(--fs-scale-caption, 1))', fontWeight: 600,
                        padding: '1px 6px', borderRadius: 99, minWidth: 16, textAlign: 'center',
                      }}>{typeCounts[opt.value] || 0}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
            <button
              type="button"
              onClick={openImport}
              className="bg-surface-card text-content"
              style={{
                appearance: 'none', border: '1px solid var(--border-primary)', cursor: canMutate ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 13px', borderRadius: 10, fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500,
                opacity: canMutate ? 1 : 0.55,
              }}
              title={t('reservations.import.title')}
            >
              <Download size={14} strokeWidth={2} />
              <span className="hidden sm:inline">{t('reservations.import.cta')}</span>
            </button>
            <button
              type="button"
              onClick={() => toast.error(t('reservations.import.unavailable'))}
              className="bg-surface-card text-content"
              style={{
                appearance: 'none', border: '1px solid var(--border-primary)', cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 13px', borderRadius: 10, fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500,
              }}
              title={t('files.title')}
            >
              <FolderOpen size={14} strokeWidth={2} />
              <span className="hidden sm:inline">{t('files.title')}</span>
            </button>
            <button
              type="button"
              onClick={() => openCreate()}
              className="bg-accent text-accent-text"
              style={{
                appearance: 'none', border: 'none', cursor: canMutate ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 10, fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500,
                opacity: canMutate ? 1 : 0.55,
              }}
            >
              <Plus size={14} strokeWidth={2.5} />
              <span className="hidden sm:inline">{t('transport.addManual')}</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 80px' }} className="max-md:!px-4 max-md:!pt-4">
        {phase === 'loading' && (
          <p className="text-content-faint" style={{ textAlign: 'center', padding: '60px 20px' }}>{t('common.loading')}</p>
        )}
        {phase === 'error' && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <AlertCircle size={28} className="text-content-faint" style={{ display: 'block', margin: '0 auto 12px' }} />
            <p className="text-content-secondary" style={{ margin: '0 0 12px' }}>{t('common.unknownError')}</p>
            <button type="button" onClick={() => { setPhase('loading'); void load() }} className="text-content border border-edge" style={{ padding: '8px 14px', borderRadius: 10, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              {t('trip.explore.retry')}
            </button>
          </div>
        )}
        {phase === 'ready' && rows.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <BookMarked size={36} className="text-content-faint" style={{ display: 'block', margin: '0 auto 12px' }} />
            <p className="text-content-secondary" style={{ fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 600, margin: '0 0 4px' }}>{t('reservations.empty')}</p>
            <p className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', margin: 0 }}>{t('reservations.emptyHint')}</p>
          </div>
        )}
        {phase === 'ready' && rows.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <p className="text-content-faint" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))' }}>{t('places.noneFound')}</p>
          </div>
        )}
        {phase === 'ready' && filtered.length > 0 && (
          <>
            {pending.length > 0 && (
              <TransportSection title={t('reservations.pending')} count={pending.length} accent="amber" storageKey={`family:transports-pending-open:${tripId}`}>
                {pending.map(r => (
                  <TransportCard
                    key={r.id}
                    r={r}
                    days={days}
                    locale={locale}
                    canMutate={canMutate}
                    onOpenDetail={trigger => openDetails(r, trigger)}
                    onEdit={() => openEdit(r)}
                    onDelete={() => {
                      deleteRestoreRef.current = null
                      setPendingDelete(r)
                    }}
                    onToggleStatus={() => { void handleToggleStatus(r) }}
                  />
                ))}
              </TransportSection>
            )}
            {confirmed.length > 0 && (
              <TransportSection title={t('reservations.confirmed')} count={confirmed.length} accent="green" storageKey={`family:transports-confirmed-open:${tripId}`}>
                {confirmed.map(r => (
                  <TransportCard
                    key={r.id}
                    r={r}
                    days={days}
                    locale={locale}
                    canMutate={canMutate}
                    onOpenDetail={trigger => openDetails(r, trigger)}
                    onEdit={() => openEdit(r)}
                    onDelete={() => {
                      deleteRestoreRef.current = null
                      setPendingDelete(r)
                    }}
                    onToggleStatus={() => { void handleToggleStatus(r) }}
                  />
                ))}
              </TransportSection>
            )}
          </>
        )}
      </div>

      <BookingImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        tripId={tripId}
        onExtract={extractFamilyFiles}
        onConfirmPreview={confirmImportPreview}
      />

      <FamilyTransportEditor
        open={showTransportEditor}
        tripId={tripId}
        reservation={review ? null : editing}
        prefill={review?.kind === 'transport' ? review.draft : null}
        seedDayId={seedDayId}
        initialAutomated={initialAutomated}
        days={days}
        places={places}
        linkedExpense={editing ? linkedFor(editing.id) : null}
        currencyCode={currencyCode}
        locale={locale}
        canMutate={canMutate}
        familyId={familyId}
        mePersonId={mePersonId}
        onClose={closeEditor}
        onSaved={handleEditorSaved}
        onOpenCostsPrefill={onOpenCostsPrefill}
        onExpenseUnlinked={load}
        focusScope={detailEditScope ? {
          restoreTo: detailTriggerRef.current,
          suppressRestoreRef,
        } : undefined}
      />

      <FamilyBookingEditor
        open={!!showBookingEditor}
        tripId={tripId}
        reservation={null}
        prefill={review?.kind === 'booking' ? review.draft : null}
        days={days}
        places={places}
        scheduleItems={scheduleItems}
        linkedExpense={null}
        currencyCode={currencyCode}
        locale={locale}
        canMutate={canMutate}
        familyId={familyId}
        mePersonId={mePersonId}
        onClose={closeEditor}
        onSaved={handleEditorSaved}
        onOpenCostsPrefill={onOpenCostsPrefill}
        onExpenseUnlinked={load}
      />

      {detail && (
        <FamilyTransportDetailDialog
          detail={detail}
          locale={locale}
          canMutate={canMutate}
          filesPhase={filePhase === 'error' ? 'error' : filePhase === 'ready' ? 'ready' : 'loading'}
          trigger={detailTriggerRef.current}
          handoffRef={detailHandoffRef}
          onClose={closeDetails}
          onRetryFiles={() => setFileRetry(n => n + 1)}
          onOpenFile={openDetailFile}
          onEdit={canMutate ? editFromDetails : undefined}
          onDelete={canMutate ? () => {
            if (!detailReservation) return
            deleteRestoreRef.current = detailTriggerRef.current
            detailHandoffRef.current = true
            const reservation = detailReservation
            setDetailId(null)
            setPendingDelete(reservation)
          } : undefined}
        />
      )}

      <ConfirmDialog
        isOpen={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => { void handleDelete() }}
        title={t('reservations.confirm.deleteTitle')}
        message={t('reservations.confirm.deleteBody', { name: pendingDelete?.title ?? '' })}
        danger
        initialFocus={deleteRestoreRef.current ? 'cancel' : undefined}
        restoreFocusTo={deleteRestoreRef.current}
      />
    </div>
  )
}

function TransportSection({
  title, count, children, accent, storageKey,
}: {
  title: string
  count: number
  children: ReactNode
  accent: 'green' | 'amber'
  storageKey: string
}): ReactElement {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = window.localStorage.getItem(storageKey)
    if (stored === null) return true
    return stored === '1'
  })
  useEffect(() => {
    window.localStorage.setItem(storageKey, open ? '1' : '0')
  }, [open, storageKey])
  return (
    <div style={{ marginBottom: 28 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 12, fontFamily: 'inherit',
        }}
      >
        {open ? <ChevronDown size={14} style={{ color: 'var(--text-faint)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-faint)' }} />}
        <span className="text-content-muted" style={{ fontWeight: 600, fontSize: 'calc(12px * var(--fs-scale-body, 1))', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
        <span className="bg-surface-tertiary text-content-faint" style={{
          fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 600, padding: '2px 7px', borderRadius: 99,
          minWidth: 20, textAlign: 'center',
          color: accent === 'green' ? '#16a34a' : '#d97706',
        }}>{count}</span>
      </button>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(max(33.33% - 14px, 340px), 1fr))', gap: 14, alignItems: 'stretch' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function TransportCard({
  r, days, locale, canMutate, onOpenDetail, onEdit, onDelete, onToggleStatus,
}: {
  r: FamilyTransportReservation
  days: FamilyTripDay[]
  locale: string
  canMutate: boolean
  onOpenDetail: (trigger: HTMLElement) => void
  onEdit: () => void
  onDelete: () => void
  onToggleStatus: () => void
}): ReactElement {
  const { t } = useTranslation()
  const typeInfo = TYPE_META.find(x => x.value === r.type) ?? TYPE_META[TYPE_META.length - 1]
  const TypeIcon = typeInfo.Icon
  const confirmed = r.status === 'confirmed'
  const startDay = days.find(d => d.id === r.startTripDayId)
  const endDay = days.find(d => d.id === r.endTripDayId)
  const startCivil = r.startsAt?.slice(0, 10) || r.endpoints[0]?.localDate || startDay?.civilDay
  const endCivil = r.endsAt?.slice(0, 10) || r.endpoints[r.endpoints.length - 1]?.localDate || endDay?.civilDay
  const route = transportRouteLabel(r)
  const legMeta = transportLegMeta(r)
  const fmtDate = (date: string) =>
    new Date(date + 'T00:00:00Z').toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

  const DayLabel = ({ day }: { day: FamilyTripDay | undefined }) => {
    if (!day) return null
    const name = day.title?.trim() || t('dayplan.dayN', { n: day.dayIndex + 1 })
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span>{name}</span>
        <span className="text-content-faint bg-surface-secondary" style={{
          fontSize: 'calc(10px * var(--fs-scale-caption, 1))', fontWeight: 600,
          padding: '1px 6px', borderRadius: 999,
        }}>{fmtDate(day.civilDay)}</span>
      </span>
    )
  }

  return (
    <div
      className="bg-surface-card"
      style={{
        borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        border: `1px solid ${confirmed ? 'rgba(22,163,74,0.25)' : 'rgba(217,119,6,0.25)'}`,
      }}
    >
      <div className={confirmed ? 'bg-[rgba(22,163,74,0.06)]' : 'bg-[rgba(217,119,6,0.06)]'} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        padding: '12px 14px',
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onToggleStatus}
            className={confirmed ? 'text-[#16a34a]' : 'text-[#d97706]'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
              fontSize: 'calc(12px * var(--fs-scale-body, 1))', fontWeight: 600, cursor: canMutate ? 'pointer' : 'default',
              fontFamily: 'inherit', padding: 0,
            }}
            title={confirmed ? t('reservations.pending') : t('reservations.confirmed')}
          >
            {confirmed ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            {confirmed ? t('reservations.confirmed') : t('reservations.pending')}
          </button>
          <span className="text-content-muted bg-surface-secondary" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 'calc(12px * var(--fs-scale-body, 1))',
            padding: '3px 8px', borderRadius: 6,
          }}>
            <TypeIcon size={12} style={{ color: typeInfo.color }} />
            {t(typeInfo.labelKey)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            onClick={event => onOpenDetail(event.currentTarget)}
            className="text-content bg-transparent"
            style={{
              appearance: 'none', border: 'none', fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 600, marginRight: 6,
              maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
            }}
          >{r.title}</button>
          <button type="button" onClick={onEdit} title={t('common.edit')} className="bg-transparent text-content-faint" style={{
            appearance: 'none', border: 'none', width: 26, height: 26, borderRadius: 6, display: 'grid', placeItems: 'center', cursor: 'pointer',
          }}>
            <Pencil size={13} />
          </button>
          {canMutate && (
            <button type="button" onClick={onDelete} title={t('common.delete')} className="bg-transparent text-content-faint" style={{
              appearance: 'none', border: 'none', width: 26, height: 26, borderRadius: 6, display: 'grid', placeItems: 'center', cursor: 'pointer',
            }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {route && (
          <div className="bg-surface-tertiary text-content" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 10,
            fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', flexWrap: 'wrap',
          }}>
            {r.endpoints.map((ep, i) => (
              <span key={ep.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {i > 0 && <TypeIcon size={14} style={{ color: typeInfo.color, flexShrink: 0 }} />}
                <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.code || ep.name}</span>
              </span>
            ))}
          </div>
        )}
        {legMeta && (
          <div>
            <div className={fieldLabelClass}>{t('reservations.meta.airline')}</div>
            <div className={`${fieldValueClass} text-center`}>{legMeta}</div>
          </div>
        )}
        {(startDay || startCivil) && (
          <div>
            <div className={fieldLabelClass}>{t('reservations.date')}</div>
            <div className={fieldValueClass} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
              {startDay ? <DayLabel day={startDay} /> : startCivil ? fmtDate(startCivil) : null}
              {endDay && endDay.id !== startDay?.id && (
                <><span className="text-content-faint">–</span><DayLabel day={endDay} /></>
              )}
              {!endDay && endCivil && endCivil !== startCivil && (
                <><span className="text-content-faint">–</span>{fmtDate(endCivil)}</>
              )}
            </div>
          </div>
        )}
        {r.confirmationCode && (
          <div>
            <div className={fieldLabelClass}>{t('reservations.confirmationCode')}</div>
            <div className={`${fieldValueClass} text-center`}>{r.confirmationCode}</div>
          </div>
        )}
      </div>
    </div>
  )
}
