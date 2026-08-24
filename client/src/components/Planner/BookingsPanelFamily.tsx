/**
 * W6.2 Family Bookings tab — TREK ReservationsPanel language, UUID trip_reservations.
 * Nest ReservationsPanel stays on the nest plane.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import {
  Hotel, Utensils, Ticket, FileText, Users, BookMarked, Plus, Pencil, Trash2,
  ChevronDown, ChevronRight, Download, CheckCircle2, Circle, AlertCircle,
} from 'lucide-react'
import { useToast } from '../shared/Toast'
import { useTranslation } from '../../i18n'
import ConfirmDialog from '../shared/ConfirmDialog'
import type { FamilyTripDay } from '../../data/supabase/tripDays'
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces'
import type { FamilyScheduleItem } from '../../data/supabase/scheduleItems'
import {
  deleteTripReservation,
  listTripBookings,
  setTripReservationStatus,
  type BookingType,
  type FamilyBookingDraft,
  type FamilyExpensePrefill,
  type FamilyTripReservation,
} from '../../data/supabase/tripReservations'
import { listTripExpenses, type FamilyTripExpense } from '../../data/supabase/tripExpenses'
import { mapImportItemsToReview, type FamilyImportItem, type FamilyImportReviewItem } from '../../data/bookingImport'
import FamilyBookingEditor from './FamilyBookingEditor'
import FamilyTransportEditor from './FamilyTransportEditor'
import BookingImportModal from './BookingImportModal'

const TYPE_META: { value: BookingType; labelKey: string; Icon: typeof Hotel; color: string }[] = [
  { value: 'hotel', labelKey: 'reservations.type.hotel', Icon: Hotel, color: '#8b5cf6' },
  { value: 'restaurant', labelKey: 'reservations.type.restaurant', Icon: Utensils, color: '#ef4444' },
  { value: 'event', labelKey: 'reservations.type.event', Icon: Ticket, color: '#f59e0b' },
  { value: 'tour', labelKey: 'reservations.type.tour', Icon: Users, color: '#10b981' },
  { value: 'other', labelKey: 'reservations.type.other', Icon: FileText, color: '#6b7280' },
]

const fieldLabelClass = 'text-[10px] font-semibold uppercase tracking-[0.08em] text-content-faint mb-[5px]'
const fieldValueClass = 'text-[13px] font-medium text-content px-[10px] py-[8px] bg-surface-tertiary rounded-[10px]'

export type BookingsPanelFamilyProps = {
  tripId: string
  canMutate: boolean
  familyId: string
  mePersonId: string | null
  days: FamilyTripDay[]
  places: FamilyTripPlace[]
  scheduleItems: FamilyScheduleItem[]
  currencyCode: string
  onOpenCostsPrefill: (prefill: FamilyExpensePrefill) => void
  onStageDraft?: (draft: FamilyBookingDraft) => Promise<boolean>
  onStageDelete?: (id: string) => Promise<boolean>
  onStageStatus?: (id: string, status: 'pending' | 'confirmed') => Promise<boolean>
}

export default function BookingsPanelFamily({
  tripId,
  canMutate,
  familyId,
  mePersonId,
  days,
  places,
  scheduleItems,
  currencyCode,
  onOpenCostsPrefill,
  onStageDraft,
  onStageDelete,
  onStageStatus,
}: BookingsPanelFamilyProps): ReactElement {
  const { t, locale } = useTranslation()
  const toast = useToast()
  const [rows, setRows] = useState<FamilyTripReservation[]>([])
  const [expenses, setExpenses] = useState<FamilyTripExpense[]>([])
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [editorOpen, setEditorOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<FamilyTripReservation | null>(null)
  const [reviewQueue, setReviewQueue] = useState<FamilyImportReviewItem[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const reviewSavedRef = useRef(0)
  const [pendingDelete, setPendingDelete] = useState<FamilyTripReservation | null>(null)
  const storageKey = `family-booking-filters-${tripId}`
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
      const [bookings, exp] = await Promise.all([
        listTripBookings(tripId),
        listTripExpenses(tripId),
      ])
      setRows(bookings)
      setExpenses(exp)
      setPhase('ready')
    } catch {
      setPhase('error')
    }
  }, [tripId])

  useEffect(() => { void load() }, [load])

  const toastHof = () => toast.error(t('trip.explore.add.hofOnly'))

  const extractFamilyFiles = useCallback(async (files: File[]) => {
    const { extractBookingFiles } = await import('../../data/bookingImport')
    return extractBookingFiles(files)
  }, [])

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
    const sortKey = (r: FamilyTripReservation): string | null => {
      const civil = r.startsAt?.slice(0, 10)
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

  const openCreate = () => {
    if (!canMutate) { toastHof(); return }
    setReviewQueue([])
    setReviewIndex(0)
    setEditing(null)
    setEditorOpen(true)
  }

  const openImport = () => {
    if (!canMutate) { toastHof(); return }
    if (onStageDraft) {
      toast.info(t('trip.governance.nudgePublished'))
      return
    }
    setImportOpen(true)
  }

  const openEdit = (r: FamilyTripReservation) => {
    setReviewQueue([])
    setReviewIndex(0)
    setEditing(r)
    setEditorOpen(true)
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
        if (n > 0) toast.success(t('reservations.import.success', { count: n }))
      } else {
        setReviewIndex(next)
      }
      return
    }
    setEditorOpen(false)
    setEditing(null)
  }

  const handleEditorSaved = async () => {
    await load()
    if (reviewQueue.length > 0) reviewSavedRef.current += 1
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    if (!canMutate) { toastHof(); setPendingDelete(null); return }
    try {
      if (onStageDelete) {
        const ok = await onStageDelete(pendingDelete.id)
        if (ok) {
          toast.success(t('trip.governance.stagedRemove'))
          setPendingDelete(null)
        }
        return
      }
      await deleteTripReservation(pendingDelete.id)
      toast.success(t('reservations.toast.removed'))
      setPendingDelete(null)
      await load()
    } catch {
      toast.error(t('reservations.toast.deleteError'))
    } finally {
      if (onStageDelete) setPendingDelete(null)
    }
  }

  const handleToggleStatus = async (r: FamilyTripReservation) => {
    if (!canMutate) { toastHof(); return }
    try {
      const next = r.status === 'confirmed' ? 'pending' : 'confirmed'
      if (onStageStatus) {
        const ok = await onStageStatus(r.id, next)
        if (ok) toast.success(t('trip.governance.stagedUpdate'))
        return
      }
      await setTripReservationStatus(r.id, next)
      await load()
    } catch {
      toast.error(t('reservations.toast.updateError'))
    }
  }

  const linkedFor = (id: string) => expenses.find(e => e.reservationId === id) ?? null
  const review = reviewQueue[reviewIndex]
  const showBookingEditor = editorOpen && (review ? review.kind === 'booking' : true)
  const showTransportEditor = editorOpen && review?.kind === 'transport'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-system)' }}>
      <div style={{ padding: '24px 28px 0' }} className="max-md:!px-4 max-md:!pt-4">
        <div className="bg-surface-tertiary" style={{
          borderRadius: 18, padding: '14px 16px 14px 22px',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <h2 className="text-content" style={{ margin: 0, fontSize: 'calc(18px * var(--fs-scale-subtitle, 1))', fontWeight: 600, letterSpacing: '-0.01em', flexShrink: 0 }}>
            {t('reservations.title')}
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
              onClick={openCreate}
              className="bg-accent text-accent-text"
              style={{
                appearance: 'none', border: 'none', cursor: canMutate ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 10, fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500,
                opacity: canMutate ? 1 : 0.55,
              }}
            >
              <Plus size={14} strokeWidth={2.5} />
              <span className="hidden sm:inline">{t('reservations.addManual')}</span>
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
              <BookingSection title={t('reservations.pending')} count={pending.length} accent="amber" storageKey={`family:bookings-pending-open:${tripId}`}>
                {pending.map(r => (
                  <BookingCard
                    key={r.id}
                    r={r}
                    days={days}
                    locale={locale}
                    canMutate={canMutate}
                    onEdit={() => openEdit(r)}
                    onDelete={() => setPendingDelete(r)}
                    onToggleStatus={() => { void handleToggleStatus(r) }}
                  />
                ))}
              </BookingSection>
            )}
            {confirmed.length > 0 && (
              <BookingSection title={t('reservations.confirmed')} count={confirmed.length} accent="green" storageKey={`family:bookings-confirmed-open:${tripId}`}>
                {confirmed.map(r => (
                  <BookingCard
                    key={r.id}
                    r={r}
                    days={days}
                    locale={locale}
                    canMutate={canMutate}
                    onEdit={() => openEdit(r)}
                    onDelete={() => setPendingDelete(r)}
                    onToggleStatus={() => { void handleToggleStatus(r) }}
                  />
                ))}
              </BookingSection>
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

      <FamilyBookingEditor
        open={showBookingEditor}
        tripId={tripId}
        reservation={review ? null : editing}
        prefill={review?.kind === 'booking' ? review.draft : null}
        days={days}
        places={places}
        scheduleItems={scheduleItems}
        linkedExpense={editing ? linkedFor(editing.id) : null}
        currencyCode={currencyCode}
        locale={locale}
        canMutate={canMutate}
        onStageDraft={onStageDraft}
        familyId={familyId}
        mePersonId={mePersonId}
        onClose={closeEditor}
        onSaved={handleEditorSaved}
        onOpenCostsPrefill={onOpenCostsPrefill}
        onExpenseUnlinked={load}
      />

      <FamilyTransportEditor
        open={!!showTransportEditor}
        tripId={tripId}
        reservation={null}
        prefill={review?.kind === 'transport' ? review.draft : null}
        days={days}
        places={places}
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

      <ConfirmDialog
        isOpen={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => { void handleDelete() }}
        title={t('reservations.confirm.deleteTitle')}
        message={t('reservations.confirm.deleteBody', { name: pendingDelete?.title ?? '' })}
        danger
      />
    </div>
  )
}

function BookingSection({
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

function BookingCard({
  r, days, locale, canMutate, onEdit, onDelete, onToggleStatus,
}: {
  r: FamilyTripReservation
  days: FamilyTripDay[]
  locale: string
  canMutate: boolean
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
  const startCivil = r.startsAt?.slice(0, 10) || startDay?.civilDay
  const endCivil = r.endsAt?.slice(0, 10) || endDay?.civilDay
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
          <span className="text-content" style={{
            fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 600, marginRight: 6,
            maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{r.title}</span>
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
