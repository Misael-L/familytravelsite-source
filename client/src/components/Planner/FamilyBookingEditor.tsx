/**
 * W6.2 Family Bookings editor — TREK ReservationModal field language, UUID SoR.
 * Nest ReservationModal stays on the nest plane.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react'
import { Hotel, Utensils, Ticket, FileText, Users, Link2, Plus, Pencil, Trash2 } from 'lucide-react'
import FamilyBookingDialogFrame from './FamilyBookingDialogFrame'
import { useBookingRequestClose } from '../shared/bookingRequestClose'
import CustomSelect from '../shared/CustomSelect'
import { CustomDatePicker } from '../shared/CustomDateTimePicker'
import CustomTimePicker from '../shared/CustomTimePicker'
import { useToast } from '../shared/Toast'
import { useTranslation } from '../../i18n'
import { formatDate, formatMoney } from '../../utils/formatters'
import { catMeta } from '../Budget/costsCategories'
import type { FamilyTripDay } from '../../data/supabase/tripDays'
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces'
import { utcCivilDay, type FamilyScheduleItem } from '../../data/supabase/scheduleItems'
import {
  costCategoryForBookingType,
  upsertTripBooking,
  type BookingType,
  type FamilyBookingDraft,
  type FamilyExpensePrefill,
  type FamilyTripReservation,
  type ReservationStatus,
} from '../../data/supabase/tripReservations'
import { bookingDraftHasUnstagedFields } from '../../data/supabase/tripChangeRequests'
import {
  unlinkExpenseReservation,
  type FamilyTripExpense,
} from '../../data/supabase/tripExpenses'
import FamilyFileAttach from '../Files/FamilyFileAttach'

const TYPE_OPTIONS: { value: BookingType; labelKey: string; Icon: typeof Hotel }[] = [
  { value: 'hotel', labelKey: 'reservations.type.hotel', Icon: Hotel },
  { value: 'restaurant', labelKey: 'reservations.type.restaurant', Icon: Utensils },
  { value: 'event', labelKey: 'reservations.type.event', Icon: Ticket },
  { value: 'tour', labelKey: 'reservations.type.tour', Icon: Users },
  { value: 'other', labelKey: 'reservations.type.other', Icon: FileText },
]

const inputClass = 'w-full border border-edge rounded-[10px] px-[12px] py-[8px] text-[13px] font-[inherit] outline-none box-border text-content bg-surface-input'
const labelClass = 'block text-[11px] font-semibold text-content-faint mb-[5px] uppercase tracking-[0.03em]'

type BookingFormSnapshot = {
  type: BookingType
  status: ReservationStatus
  title: string
  confirmation: string
  url: string
  notes: string
  placeId: string
  scheduleItemId: string
  hotelStartDay: string
  hotelEndDay: string
  checkInTime: string
  checkOutTime: string
  checkInUntil: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  location: string
}

type BookingSource = {
  type: BookingType
  status: ReservationStatus
  title: string
  confirmationCode?: string | null
  url?: string | null
  notes?: string | null
  placeId?: string | null
  scheduleItemId?: string | null
  startsAt?: string | null
  endsAt?: string | null
  startTripDayId?: string | null
  endTripDayId?: string | null
  metadata?: Record<string, string> | null
}

function emptyBookingSnapshot(): BookingFormSnapshot {
  return {
    type: 'hotel',
    status: 'pending',
    title: '',
    confirmation: '',
    url: '',
    notes: '',
    placeId: '',
    scheduleItemId: '',
    hotelStartDay: '',
    hotelEndDay: '',
    checkInTime: '',
    checkOutTime: '',
    checkInUntil: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    location: '',
  }
}

function snapshotFromSource(src: BookingSource, days: FamilyTripDay[]): BookingFormSnapshot {
  return {
    type: src.type,
    status: src.status,
    title: src.title,
    confirmation: src.confirmationCode ?? '',
    url: src.url ?? '',
    notes: src.notes ?? '',
    placeId: src.placeId ?? '',
    scheduleItemId: src.scheduleItemId ?? '',
    hotelStartDay: src.startTripDayId || days.find(day => day.civilDay === civilFromIso(src.startsAt))?.id || '',
    hotelEndDay: src.endTripDayId || days.find(day => day.civilDay === civilFromIso(src.endsAt))?.id || '',
    checkInTime: timeFromIso(src.startsAt ?? null),
    checkOutTime: timeFromIso(src.endsAt ?? null),
    checkInUntil: src.metadata?.check_in_until ?? '',
    startDate: civilFromIso(src.startsAt) || days.find(day => day.id === src.startTripDayId)?.civilDay || '',
    startTime: timeFromIso(src.startsAt ?? null),
    endDate: civilFromIso(src.endsAt) || '',
    endTime: timeFromIso(src.endsAt ?? null),
    location: src.metadata?.location ?? '',
  }
}

function sameSnapshot(a: BookingFormSnapshot, b: BookingFormSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function openingKey(
  open: boolean,
  reservation: FamilyTripReservation | null,
  prefill: FamilyBookingDraft | null,
): string | null {
  if (!open) return null
  if (reservation) return `reservation:${reservation.id}`
  if (prefill) {
    return `prefill:${prefill.id ?? ''}|${prefill.type}|${prefill.title}|${prefill.startsAt ?? ''}|${prefill.endsAt ?? ''}`
  }
  return 'new'
}

function civilFromIso(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function timeFromIso(iso: string | null | undefined): string {
  if (!iso || !iso.includes('T')) return ''
  const t = iso.slice(11, 16)
  return /^\d{2}:\d{2}$/.test(t) && t !== '00:00' ? t : ''
}

function combineIso(civil: string, time: string): string | null {
  if (!civil) return null
  return time ? `${civil}T${time}:00.000Z` : `${civil}T00:00:00.000Z`
}

export type FamilyBookingEditorProps = {
  open: boolean
  tripId: string
  reservation: FamilyTripReservation | null
  prefill?: FamilyBookingDraft | null
  days: FamilyTripDay[]
  places: FamilyTripPlace[]
  scheduleItems: FamilyScheduleItem[]
  linkedExpense: FamilyTripExpense | null
  currencyCode: string
  locale: string
  canMutate: boolean
  onStageDraft?: (draft: FamilyBookingDraft) => Promise<boolean>
  familyId: string
  mePersonId: string | null
  onClose: () => void
  onSaved: () => Promise<void>
  onOpenCostsPrefill: (prefill: FamilyExpensePrefill) => void
  onExpenseUnlinked: () => Promise<void>
}

export default function FamilyBookingEditor({
  open,
  tripId,
  reservation,
  prefill = null,
  days,
  places,
  scheduleItems,
  linkedExpense,
  currencyCode,
  locale,
  canMutate,
  onStageDraft,
  familyId,
  mePersonId,
  onClose,
  onSaved,
  onOpenCostsPrefill,
  onExpenseUnlinked,
}: FamilyBookingEditorProps): ReactElement | null {
  const { t } = useTranslation()
  const toast = useToast()
  const [type, setType] = useState<BookingType>('hotel')
  const [status, setStatus] = useState<ReservationStatus>('pending')
  const [title, setTitle] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [placeId, setPlaceId] = useState('')
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [scheduleItemId, setScheduleItemId] = useState('')
  const [hotelStartDay, setHotelStartDay] = useState('')
  const [hotelEndDay, setHotelEndDay] = useState('')
  const [checkInTime, setCheckInTime] = useState('')
  const [checkOutTime, setCheckOutTime] = useState('')
  const [checkInUntil, setCheckInUntil] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [baseline, setBaseline] = useState<BookingFormSnapshot | null>(null)
  const savingRef = useRef(false)
  const handoffRef = useRef(false)
  const appliedKey = useRef<string | null>(null)
  const baselineHold = useRef<BookingFormSnapshot | null>(null)
  const titleFieldId = useId()
  const confirmationFieldId = useId()
  const urlFieldId = useId()
  const notesFieldId = useId()
  const locationFieldId = useId()
  const key = openingKey(open, reservation, prefill)
  if (!open) appliedKey.current = null
  else if (appliedKey.current !== key) handoffRef.current = false

  const snapshot = useMemo<BookingFormSnapshot>(() => ({
    type,
    status,
    title,
    confirmation,
    url,
    notes,
    placeId,
    scheduleItemId,
    hotelStartDay,
    hotelEndDay,
    checkInTime,
    checkOutTime,
    checkInUntil,
    startDate,
    startTime,
    endDate,
    endTime,
    location,
  }), [
    type, status, title, confirmation, url, notes, placeId, scheduleItemId,
    hotelStartDay, hotelEndDay, checkInTime, checkOutTime, checkInUntil,
    startDate, startTime, endDate, endTime, location,
  ])
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  const applySnapshot = (next: BookingFormSnapshot, nextHotelId: string | null) => {
    setType(next.type)
    setStatus(next.status)
    setTitle(next.title)
    setConfirmation(next.confirmation)
    setUrl(next.url)
    setNotes(next.notes)
    setPlaceId(next.placeId)
    setScheduleItemId(next.scheduleItemId)
    setHotelStartDay(next.hotelStartDay)
    setHotelEndDay(next.hotelEndDay)
    setCheckInTime(next.checkInTime)
    setCheckOutTime(next.checkOutTime)
    setCheckInUntil(next.checkInUntil)
    setStartDate(next.startDate)
    setStartTime(next.startTime)
    setEndDate(next.endDate)
    setEndTime(next.endTime)
    setLocation(next.location)
    setHotelId(nextHotelId)
  }

  useEffect(() => {
    if (!open || !key) return
    const source = reservation ?? prefill
    const hotel = source?.hotelId ?? null
    const displayed = source ? snapshotFromSource(source, days) : emptyBookingSnapshot()
    if (appliedKey.current !== key) {
      applySnapshot(displayed, hotel)
      baselineHold.current = displayed
      setBaseline(displayed)
      appliedKey.current = key
      return
    }
    if (baselineHold.current && sameSnapshot(snapshotRef.current, baselineHold.current) && source) {
      if (!sameSnapshot(displayed, baselineHold.current)) {
        applySnapshot(displayed, hotel)
        baselineHold.current = displayed
        setBaseline(displayed)
      }
    }
  }, [open, key, reservation, prefill, days])

  const assignmentOptions = useMemo(() => {
    const opts: { value: string; label: string; isHeader?: boolean }[] = [
      { value: '', label: t('reservations.noAssignment') },
    ]
    const sortedDays = [...days].sort((a, b) => a.dayIndex - b.dayIndex)
    for (const day of sortedDays) {
      const rows = scheduleItems.filter(item => utcCivilDay(item.startsAt) === day.civilDay)
      if (rows.length === 0) continue
      const dayLabel = day.title?.trim() || t('dayplan.dayN', { n: day.dayIndex + 1 })
      opts.push({ value: `_h_${day.id}`, label: dayLabel, isHeader: true })
      for (const row of rows) {
        opts.push({ value: row.id, label: row.activity })
      }
    }
    return opts
  }, [days, scheduleItems, t])

  const hotelDayOptions = useMemo(
    () => [...days].sort((a, b) => a.dayIndex - b.dayIndex).map(d => {
      const dateBadge = formatDate(d.civilDay, locale) ?? undefined
      const dayBadge = d.title ? t('dayplan.dayN', { n: d.dayIndex + 1 }) : undefined
      return {
        value: d.id,
        label: d.title?.trim() || t('dayplan.dayN', { n: d.dayIndex + 1 }),
        badge: dateBadge ?? dayBadge,
      }
    }),
    [days, locale, t],
  )

  const isHotel = type === 'hotel'
  const endBeforeStart = !isHotel && !!startDate && !!endDate && (
    (endTime ? `${endDate}T${endTime}` : endDate) <= (startTime ? `${startDate}T${startTime}` : startDate)
  )

  const buildDraft = (): FamilyBookingDraft => {
    const metadata: Record<string, string> = {}
    if (isHotel && checkInUntil.trim()) metadata.check_in_until = checkInUntil.trim()
    if (location.trim()) metadata.location = location.trim()

    let startTripDayId: string | null = null
    let endTripDayId: string | null = null
    let startsAt: string | null = null
    let endsAt: string | null = null

    if (isHotel) {
      const fromDay = days.find(d => d.id === hotelStartDay)
      const toDay = days.find(d => d.id === hotelEndDay)
      startTripDayId = hotelStartDay || null
      endTripDayId = hotelEndDay || null
      startsAt = fromDay ? combineIso(fromDay.civilDay, checkInTime) : null
      endsAt = toDay ? combineIso(toDay.civilDay, checkOutTime) : null
    } else {
      startsAt = combineIso(startDate, startTime)
      endsAt = combineIso(endDate, endTime)
      startTripDayId = days.find(d => d.civilDay === startDate)?.id ?? null
      endTripDayId = days.find(d => d.civilDay === (endDate || startDate))?.id ?? null
    }

    return {
      id: reservation?.id ?? null,
      type,
      status,
      title,
      startTripDayId,
      endTripDayId,
      startsAt,
      endsAt,
      confirmationCode: confirmation,
      notes,
      url,
      placeId: placeId || null,
      hotelId: isHotel ? hotelId : null,
      scheduleItemId: isHotel ? null : (scheduleItemId || null),
      metadata,
    }
  }

  const save = async (): Promise<string | null> => {
    if (savingRef.current) return null
    if (!canMutate) {
      toast.error(t('trip.explore.add.hofOnly'))
      return null
    }
    if (!title.trim()) return null
    if (endBeforeStart) {
      toast.error(t('reservations.validation.endBeforeStart'))
      return null
    }
    savingRef.current = true
    setSaving(true)
    try {
      const draft = buildDraft()
      if (onStageDraft) {
        if (bookingDraftHasUnstagedFields(draft)) {
          toast.info(t('trip.governance.bookingUnstaged'))
        }
        const ok = await onStageDraft(draft)
        if (!ok) return null
        await onSaved()
        toast.success(t('trip.governance.staged'))
        return reservation?.id ?? 'draft'
      }
      const id = await upsertTripBooking(tripId, draft)
      await onSaved()
      if (!(prefill && !reservation)) toast.success(t('reservations.toast.updated'))
      return id
    } catch {
      toast.error(t('reservations.toast.saveError'))
      return null
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const handleSubmit = async (intent: 'create' | 'edit' | null = null) => {
    if (savingRef.current) return
    const id = await save()
    if (!id) return
    if (intent === 'create') {
      if (onStageDraft) {
        toast.info(t('trip.governance.expenseUnstaged'))
        onClose()
        return
      }
      handoffRef.current = true
      onClose()
      onOpenCostsPrefill({
        name: title.trim(),
        category: costCategoryForBookingType(type),
        reservationId: id,
      })
    } else if (intent === 'edit' && linkedExpense) {
      handoffRef.current = true
      onClose()
      onOpenCostsPrefill({
        name: linkedExpense.name,
        category: linkedExpense.category,
        reservationId: id,
        expenseId: linkedExpense.id,
      })
    } else {
      onClose()
    }
  }

  const handleUnlink = async () => {
    if (!linkedExpense) return
    if (!canMutate) {
      toast.error(t('trip.explore.add.hofOnly'))
      return
    }
    try {
      await unlinkExpenseReservation(linkedExpense.id)
      await onExpenseUnlinked()
    } catch {
      toast.error(t('common.unknownError'))
    }
  }

  if (!open) return null

  return (
    <FamilyBookingDialogFrame
      title={reservation ? t('reservations.editTitle') : t('reservations.newTitle')}
      snapshot={snapshot}
      baseline={baseline}
      busy={saving}
      handoffRef={handoffRef}
      onClose={onClose}
      footer={
        <BookingEditorFooter
          saving={saving}
          disabled={saving || !title.trim() || endBeforeStart || !canMutate}
          label={reservation ? t('common.update') : t('common.add')}
          onSubmit={() => { void handleSubmit() }}
        />
      }
    >
      <form
        onSubmit={e => { e.preventDefault(); void handleSubmit() }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div>
          <label className={labelClass}>{t('reservations.bookingType')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {TYPE_OPTIONS.map(({ value, labelKey, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={type === value ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'bg-surface-card text-content-muted'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', borderRadius: 99, border: '1px solid',
                  fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                  borderColor: type === value ? 'var(--text-primary)' : 'var(--border-primary)',
                }}
              >
                <Icon size={11} /> {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor={titleFieldId}>{t('reservations.titleLabel')} *</label>
          <input
            id={titleFieldId}
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            placeholder={t('reservations.titlePlaceholder')}
            className={inputClass}
          />
        </div>

        {!isHotel && (
          <>
            {assignmentOptions.length > 1 && (
              <div>
                <label className={labelClass}>
                  <Link2 size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />
                  {t('reservations.linkAssignment')}
                </label>
                <CustomSelect
                  value={scheduleItemId}
                  onChange={v => setScheduleItemId(String(v))}
                  placeholder={t('reservations.pickAssignment')}
                  options={assignmentOptions}
                  searchable
                  size="sm"
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label className={labelClass}>{t('reservations.date')}</label>
                <CustomDatePicker value={startDate} onChange={d => setStartDate(d || '')} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label className={labelClass}>{t('reservations.startTime')}</label>
                <CustomTimePicker value={startTime} onChange={v => setStartTime(v)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label className={labelClass}>{t('reservations.endDate')}</label>
                <CustomDatePicker value={endDate} onChange={d => setEndDate(d || '')} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label className={labelClass}>{t('reservations.endTime')}</label>
                <CustomTimePicker value={endTime} onChange={v => setEndTime(v)} />
              </div>
            </div>
            {endBeforeStart && (
              <div className="text-[#ef4444]" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', marginTop: -6 }}>
                {t('reservations.validation.endBeforeStart')}
              </div>
            )}
            <div>
              <label className={labelClass}>{t('reservations.meta.linkPlace')}</label>
              <CustomSelect
                value={placeId}
                onChange={v => {
                  const id = String(v)
                  const p = places.find(pl => pl.id === id)
                  setPlaceId(id)
                  if (id && p && !title.trim()) setTitle(p.name)
                }}
                placeholder={t('reservations.meta.pickPlace')}
                options={[
                  { value: '', label: '—' },
                  ...places.map(p => ({ value: p.id, label: p.name })),
                ]}
                searchable
                size="sm"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={locationFieldId}>{t('reservations.locationAddress')}</label>
              <input
                id={locationFieldId}
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder={t('reservations.locationPlaceholder')}
                className={inputClass}
              />
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor={confirmationFieldId}>{t('reservations.confirmationCode')}</label>
            <input
              id={confirmationFieldId}
              type="text"
              value={confirmation}
              onChange={e => setConfirmation(e.target.value)}
              placeholder={t('reservations.confirmationPlaceholder')}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t('reservations.status')}</label>
            <CustomSelect
              value={status}
              onChange={v => setStatus(String(v) === 'confirmed' ? 'confirmed' : 'pending')}
              options={[
                { value: 'pending', label: t('reservations.pending') },
                { value: 'confirmed', label: t('reservations.confirmed') },
              ]}
              size="sm"
            />
          </div>
        </div>

        {isHotel && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>{t('reservations.meta.hotelPlace')}</label>
                <CustomSelect
                  value={placeId}
                  onChange={v => {
                    const id = String(v)
                    const p = places.find(pl => pl.id === id)
                    setPlaceId(id)
                    if (id && p && !title.trim()) setTitle(p.name)
                  }}
                  placeholder={t('reservations.meta.pickHotel')}
                  options={[
                    { value: '', label: '—' },
                    ...places.map(p => ({ value: p.id, label: p.name })),
                  ]}
                  searchable
                  size="sm"
                />
              </div>
              <div>
                <label className={labelClass}>{t('reservations.meta.fromDay')}</label>
                <CustomSelect
                  value={hotelStartDay}
                  onChange={v => {
                    const id = String(v)
                    setHotelStartDay(id)
                    setHotelEndDay(prevEnd => {
                      const startIdx = days.findIndex(d => d.id === id)
                      const endIdx = days.findIndex(d => d.id === prevEnd)
                      return startIdx > endIdx ? id : prevEnd
                    })
                  }}
                  placeholder={t('reservations.meta.selectDay')}
                  options={hotelDayOptions}
                  size="sm"
                />
              </div>
              <div>
                <label className={labelClass}>{t('reservations.meta.toDay')}</label>
                <CustomSelect
                  value={hotelEndDay}
                  onChange={v => {
                    const id = String(v)
                    setHotelEndDay(id)
                    setHotelStartDay(prevStart => {
                      const endIdx = days.findIndex(d => d.id === id)
                      const startIdx = days.findIndex(d => d.id === prevStart)
                      return endIdx < startIdx ? id : prevStart
                    })
                  }}
                  placeholder={t('reservations.meta.selectDay')}
                  options={hotelDayOptions}
                  size="sm"
                />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor={locationFieldId}>{t('reservations.locationAddress')}</label>
              <input
                id={locationFieldId}
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder={t('reservations.locationPlaceholder')}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>{t('reservations.meta.checkIn')}</label>
                <CustomTimePicker value={checkInTime} onChange={v => setCheckInTime(v)} />
              </div>
              <div>
                <label className={labelClass}>{t('reservations.meta.checkInUntil')}</label>
                <CustomTimePicker value={checkInUntil} onChange={v => setCheckInUntil(v)} />
              </div>
              <div>
                <label className={labelClass}>{t('reservations.meta.checkOut')}</label>
                <CustomTimePicker value={checkOutTime} onChange={v => setCheckOutTime(v)} />
              </div>
            </div>
          </>
        )}

        <div>
          <label className={labelClass} htmlFor={urlFieldId}>{t('reservations.urlLabel')}</label>
          <div className="relative">
            <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
            <input
              id={urlFieldId}
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder={t('reservations.urlPlaceholder')}
              className={inputClass}
              style={{ paddingLeft: 34 }}
            />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor={notesFieldId}>{t('reservations.notes')}</label>
          <textarea
            id={notesFieldId}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t('reservations.notesPlaceholder')}
            rows={2}
            className={inputClass}
            style={{ resize: 'none', lineHeight: 1.5 }}
          />
        </div>

        {reservation?.id ? (
          <FamilyFileAttach
            tripId={tripId}
            familyId={familyId}
            canMutate={canMutate}
            mePersonId={mePersonId}
            reservationId={reservation.id}
          />
        ) : (
          <div>
            <label className={labelClass}>{t('files.title')}</label>
            <p className="text-content-faint" style={{ fontSize: 12, margin: 0 }}>{t('files.empty')}</p>
          </div>
        )}

        <LinkedExpenseBlock
          linked={linkedExpense}
          currencyCode={currencyCode}
          locale={locale}
          canMutate={canMutate}
          onCreate={() => { void handleSubmit('create') }}
          onEdit={() => { void handleSubmit('edit') }}
          onUnlink={() => { void handleUnlink() }}
        />
      </form>
    </FamilyBookingDialogFrame>
  )
}

function BookingEditorFooter({
  saving,
  disabled,
  label,
  onSubmit,
}: {
  saving: boolean
  disabled: boolean
  label: string
  onSubmit: () => void
}): ReactElement {
  const { t } = useTranslation()
  const requestClose = useBookingRequestClose()
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <button
        type="button"
        onClick={requestClose}
        className="text-content-muted"
        style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border-primary)', background: 'none', fontSize: 'calc(12px * var(--fs-scale-body, 1))', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        {t('common.cancel')}
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="bg-[var(--text-primary)] text-[var(--bg-primary)]"
        style={{
          padding: '8px 20px', borderRadius: 10, border: 'none',
          fontSize: 'calc(12px * var(--fs-scale-body, 1))', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {saving ? t('common.saving') : label}
      </button>
    </div>
  )
}

function LinkedExpenseBlock({
  linked,
  currencyCode,
  locale,
  canMutate,
  onCreate,
  onEdit,
  onUnlink,
}: {
  linked: FamilyTripExpense | null
  currencyCode: string
  locale: string
  canMutate: boolean
  onCreate: () => void
  onEdit: () => void
  onUnlink: () => void
}): ReactElement {
  const { t } = useTranslation()
  if (linked) {
    const meta = catMeta(linked.category)
    const Icon = meta.Icon
    return (
      <div>
        <label className={labelClass}>{t('reservations.linkedExpense')}</label>
        <div className="bg-surface-secondary border border-edge" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10 }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', background: meta.color + '22', color: meta.color, flexShrink: 0 }}>
            <Icon size={14} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="text-content" style={{ fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {linked.name}
            </div>
            <div className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))' }}>{t(meta.labelKey)}</div>
          </div>
          <span className="text-content" style={{ fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 700, flexShrink: 0 }}>
            {formatMoney(linked.totalAmount, linked.currencyCode || currencyCode, locale)}
          </span>
          {canMutate && (
            <>
              <button type="button" onClick={onEdit} title={t('common.edit')} className="text-content-muted border border-edge bg-surface-card" style={{ display: 'inline-flex', padding: 7, borderRadius: 8, cursor: 'pointer' }}>
                <Pencil size={13} />
              </button>
              <button type="button" onClick={onUnlink} title={t('reservations.removeExpense')} className="text-content-muted border border-edge bg-surface-card" style={{ display: 'inline-flex', padding: 7, borderRadius: 8, cursor: 'pointer' }}>
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>
    )
  }
  return (
    <div>
      <label className={labelClass}>{t('reservations.costsLabel')}</label>
      <button
        type="button"
        onClick={onCreate}
        disabled={!canMutate}
        className="bg-surface-secondary border border-edge text-content"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '11px 13px', borderRadius: 10, fontSize: 'calc(13.5px * var(--fs-scale-body, 1))',
          fontWeight: 600, cursor: canMutate ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
          opacity: canMutate ? 1 : 0.5,
        }}
      >
        <Plus size={15} /> {t('reservations.createExpense')}
      </button>
      <div className="text-content-faint" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', marginTop: 6 }}>
        {t('reservations.createExpenseHint')}
      </div>
    </div>
  )
}
