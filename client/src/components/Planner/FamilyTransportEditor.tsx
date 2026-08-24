/**
 * W6.1 Family Transport editor — TREK TransportModal field language, UUID SoR.
 * Nest TransportModal / TransitSearchPanel stay on the nest plane.
 */
import { useEffect, useId, useMemo, useState, type ReactElement } from 'react'
import {
  Bike, Bus, Car, CarTaxiFront, Pencil, Plane, Plus, Route, Sailboat, Ship, Train, Trash2, TramFront,
} from 'lucide-react'
import Modal from '../shared/Modal'
import CustomSelect from '../shared/CustomSelect'
import CustomTimePicker from '../shared/CustomTimePicker'
import { useToast } from '../shared/Toast'
import { useTranslation } from '../../i18n'
import { formatDate, formatMoney } from '../../utils/formatters'
import { catMeta } from '../Budget/costsCategories'
import type { FamilyTripDay } from '../../data/supabase/tripDays'
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces'
import { lookupAirportByIata } from '../../data/supabase/airports'
import {
  costCategoryForTransportType,
  isTransportManualType,
  upsertTripTransport,
  type FamilyExpensePrefill,
  type FamilyTransportDraft,
  type FamilyTransportEndpointDraft,
  type FamilyTransportReservation,
  type ReservationStatus,
  type TransportManualType,
} from '../../data/supabase/tripReservations'
import {
  unlinkExpenseReservation,
  type FamilyTripExpense,
} from '../../data/supabase/tripExpenses'
import FamilyAirportSelect, { type FamilyAirportPick } from './FamilyAirportSelect'
import FamilyFileAttach from '../Files/FamilyFileAttach'

const TYPE_OPTIONS: { value: TransportManualType; labelKey: string; Icon: typeof Plane }[] = [
  { value: 'flight', labelKey: 'reservations.type.flight', Icon: Plane },
  { value: 'train', labelKey: 'reservations.type.train', Icon: Train },
  { value: 'bus', labelKey: 'reservations.type.bus', Icon: Bus },
  { value: 'car', labelKey: 'reservations.type.car', Icon: Car },
  { value: 'taxi', labelKey: 'reservations.type.taxi', Icon: CarTaxiFront },
  { value: 'bicycle', labelKey: 'reservations.type.bicycle', Icon: Bike },
  { value: 'cruise', labelKey: 'reservations.type.cruise', Icon: Ship },
  { value: 'ferry', labelKey: 'reservations.type.ferry', Icon: Sailboat },
  { value: 'transport_other', labelKey: 'reservations.type.transport_other', Icon: Route },
]

const inputClass = 'w-full border border-edge rounded-[10px] px-[12px] py-[8px] text-[13px] font-[inherit] outline-none box-border text-content bg-surface-input'
const labelClass = 'block text-[11px] font-semibold text-content-faint mb-[5px] uppercase tracking-[0.03em]'

type FlightWaypoint = {
  airport: FamilyAirportPick | null
  arrDayId: string
  arrTime: string
  depDayId: string
  depTime: string
  airline: string
  flightNumber: string
  seat: string
}

type StationWaypoint = {
  name: string
  placeId: string | null
  latitude: number | null
  longitude: number | null
  arrDayId: string
  arrTime: string
  depDayId: string
  depTime: string
  trainNumber: string
  platform: string
  seat: string
}

function emptyFlight(dayId = ''): FlightWaypoint {
  return { airport: null, arrDayId: dayId, arrTime: '', depDayId: dayId, depTime: '', airline: '', flightNumber: '', seat: '' }
}

function emptyStation(dayId = ''): StationWaypoint {
  return { name: '', placeId: null, latitude: null, longitude: null, arrDayId: dayId, arrTime: '', depDayId: dayId, depTime: '', trainNumber: '', platform: '', seat: '' }
}

function pickFromEndpoint(ep: FamilyTransportEndpointDraft | undefined): FamilyAirportPick | null {
  if (!ep) return null
  if (!ep.airportId && !ep.code && !ep.name) return null
  return {
    id: ep.airportId ?? null,
    name: ep.name || ep.code || 'Airport',
    iataCode: (ep.code || '').toUpperCase(),
    latitude: ep.latitude ?? null,
    longitude: ep.longitude ?? null,
  }
}

function dayIdForCivil(civil: string | null | undefined, days: FamilyTripDay[]): string {
  if (!civil) return ''
  return days.find(d => d.civilDay === civil)?.id ?? ''
}

function asDayId(v: string | number): string {
  return String(v)
}

const EMPTY_ENDPOINT: FamilyTransportEndpointDraft = { name: '' }

export type FamilyTransportEditorProps = {
  open: boolean
  tripId: string
  reservation: FamilyTransportReservation | null
  prefill?: FamilyTransportDraft | null
  seedDayId?: string | null
  initialAutomated?: boolean
  days: FamilyTripDay[]
  places: FamilyTripPlace[]
  linkedExpense: FamilyTripExpense | null
  currencyCode: string
  locale: string
  canMutate: boolean
  familyId: string
  mePersonId: string | null
  onClose: () => void
  onSaved: () => Promise<void>
  onOpenCostsPrefill: (prefill: FamilyExpensePrefill) => void
  onExpenseUnlinked: () => Promise<void>
}

export default function FamilyTransportEditor({
  open,
  tripId,
  reservation,
  prefill = null,
  seedDayId = null,
  initialAutomated = false,
  days,
  places,
  linkedExpense,
  currencyCode,
  locale,
  canMutate,
  familyId,
  mePersonId,
  onClose,
  onSaved,
  onOpenCostsPrefill,
  onExpenseUnlinked,
}: FamilyTransportEditorProps): ReactElement | null {
  const { t } = useTranslation()
  const toast = useToast()
  const placeListId = useId()
  const [automated, setAutomated] = useState(false)
  const [type, setType] = useState<TransportManualType>('flight')
  const [status, setStatus] = useState<ReservationStatus>('pending')
  const [title, setTitle] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [notes, setNotes] = useState('')
  const [url, setUrl] = useState('')
  const [waypoints, setWaypoints] = useState<FlightWaypoint[]>([emptyFlight(), emptyFlight()])
  const [trainWaypoints, setTrainWaypoints] = useState<StationWaypoint[]>([emptyStation(), emptyStation()])
  const [fromName, setFromName] = useState('')
  const [toName, setToName] = useState('')
  const [startDayId, setStartDayId] = useState('')
  const [endDayId, setEndDayId] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  const [arrivalTime, setArrivalTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [expenseIntent, setExpenseIntent] = useState<'create' | 'edit' | null>(null)

  const tripHasDates = days.length > 0
  const isCreate = !reservation

  const applyEndpoints = (src: FamilyTransportDraft, daySeed: string) => {
    const eps = src.endpoints ?? []
    const legs = src.legs ?? []
    const manualType: TransportManualType = isTransportManualType(src.type) ? src.type : 'flight'
    setType(manualType)
    if (manualType === 'flight') {
      const wps = (eps.length >= 2 ? eps : [eps[0] ?? EMPTY_ENDPOINT, EMPTY_ENDPOINT]).map((ep, i, all) => {
        const isFirst = i === 0
        const isLast = i === all.length - 1
        const leg = legs[i]
        return {
          airport: pickFromEndpoint(ep),
          arrDayId: isFirst ? '' : (dayIdForCivil(ep.localDate, days) || src.endTripDayId || daySeed),
          arrTime: isFirst ? '' : (ep.localTime ?? ''),
          depDayId: isLast ? '' : (dayIdForCivil(ep.localDate, days) || src.startTripDayId || daySeed),
          depTime: isLast ? '' : (ep.localTime ?? ''),
          airline: leg?.carrierName ?? '',
          flightNumber: leg?.serviceNumber ?? '',
          seat: leg?.seat ?? '',
        }
      })
      setWaypoints(wps.length >= 2 ? wps : [emptyFlight(daySeed), emptyFlight(daySeed)])
    } else if (manualType === 'train') {
      const wps = (eps.length >= 2 ? eps : [eps[0] ?? EMPTY_ENDPOINT, EMPTY_ENDPOINT]).map((ep, i, all) => {
        const isFirst = i === 0
        const isLast = i === all.length - 1
        const leg = legs[i]
        return {
          name: ep.name || '',
          placeId: ep.placeId ?? null,
          latitude: ep.latitude ?? null,
          longitude: ep.longitude ?? null,
          arrDayId: isFirst ? '' : (dayIdForCivil(ep.localDate, days) || src.endTripDayId || daySeed),
          arrTime: isFirst ? '' : (ep.localTime ?? ''),
          depDayId: isLast ? '' : (dayIdForCivil(ep.localDate, days) || src.startTripDayId || daySeed),
          depTime: isLast ? '' : (ep.localTime ?? ''),
          trainNumber: leg?.serviceNumber ?? '',
          platform: leg?.platform ?? '',
          seat: leg?.seat ?? '',
        }
      })
      setTrainWaypoints(wps.length >= 2 ? wps : [emptyStation(daySeed), emptyStation(daySeed)])
    } else {
      setFromName(eps[0]?.name || '')
      setToName(eps[eps.length - 1]?.name || '')
      setDepartureTime(eps[0]?.localTime || '')
      setArrivalTime(eps[eps.length - 1]?.localTime || '')
    }
  }

  useEffect(() => {
    if (!open) return
    const daySeed = seedDayId || days[0]?.id || ''
    setExpenseIntent(null)
    if (reservation) {
      setAutomated(false)
      setStatus(reservation.status)
      setTitle(reservation.title)
      setConfirmation(reservation.confirmationCode ?? '')
      setNotes(reservation.notes ?? '')
      setUrl(reservation.url ?? '')
      setStartDayId(reservation.startTripDayId || daySeed)
      setEndDayId(reservation.endTripDayId || reservation.startTripDayId || daySeed)
      applyEndpoints({
        type: isTransportManualType(reservation.type) ? reservation.type : 'flight',
        status: reservation.status,
        title: reservation.title,
        startTripDayId: reservation.startTripDayId,
        endTripDayId: reservation.endTripDayId,
        confirmationCode: reservation.confirmationCode,
        notes: reservation.notes,
        url: reservation.url,
        endpoints: reservation.endpoints,
        legs: reservation.legs.map(l => ({
          carrierName: l.carrierName ?? '',
          serviceNumber: l.serviceNumber ?? '',
          platform: l.platform ?? '',
          seat: l.seat ?? '',
        })),
      }, daySeed)
      return
    }
    setAutomated(initialAutomated)
    if (initialAutomated) toast.error(t('reservations.import.unavailable'))
    if (prefill) {
      setStatus(prefill.status)
      setTitle(prefill.title)
      setConfirmation(prefill.confirmationCode ?? '')
      setNotes(prefill.notes ?? '')
      setUrl(prefill.url ?? '')
      setStartDayId(prefill.startTripDayId || daySeed)
      setEndDayId(prefill.endTripDayId || prefill.startTripDayId || daySeed)
      applyEndpoints(prefill, daySeed)
      const codes = prefill.endpoints ?? []
      if (codes.some(ep => ep.code)) {
        void Promise.all(codes.map(ep =>
          ep.code ? lookupAirportByIata(ep.code).catch(() => null) : Promise.resolve(null),
        )).then(hits => {
          setWaypoints(prev => prev.map((wp, i) => {
            const hit = hits[i]
            if (!hit || wp.airport?.id) return wp
            return {
              ...wp,
              airport: {
                id: hit.id,
                name: hit.name,
                iataCode: hit.iataCode,
                latitude: hit.latitude,
                longitude: hit.longitude,
              },
            }
          }))
        })
      }
      return
    }
    setStatus('pending')
    setTitle('')
    setConfirmation('')
    setNotes('')
    setUrl('')
    setType('flight')
    setStartDayId(daySeed)
    setEndDayId(daySeed)
    setFromName('')
    setToName('')
    setDepartureTime('')
    setArrivalTime('')
    setWaypoints([emptyFlight(daySeed), emptyFlight(daySeed)])
    setTrainWaypoints([emptyStation(daySeed), emptyStation(daySeed)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reservation, prefill, seedDayId, initialAutomated])

  const dayOptions = useMemo(() => [
    { value: '', label: '—' },
    ...days.map(d => ({
      value: d.id,
      label: d.title?.trim() || t('dayplan.dayN', { n: d.dayIndex + 1 }),
      badge: formatDate(d.civilDay, locale) ?? undefined,
    })),
  ], [days, locale, t])

  const startIdx = days.find(d => d.id === startDayId)?.dayIndex
  const endIdx = days.find(d => d.id === endDayId)?.dayIndex
  const endBeforeStart = startIdx != null && endIdx != null && endIdx < startIdx

  const matchPlace = (name: string): FamilyTripPlace | undefined =>
    places.find(p => p.name.trim().toLowerCase() === name.trim().toLowerCase())

  const buildDraft = (): FamilyTransportDraft => {
    if (type === 'flight') {
      const named = waypoints.filter(w => w.airport)
      const first = named[0]
      const last = named[named.length - 1]
      return {
        id: reservation?.id ?? null,
        type,
        status,
        title,
        startTripDayId: first?.depDayId || startDayId || null,
        endTripDayId: last?.arrDayId || first?.depDayId || endDayId || null,
        confirmationCode: confirmation,
        notes,
        url,
        endpoints: named.map((w, i, all) => {
          const isLast = i === all.length - 1
          const dayId = isLast ? w.arrDayId : w.depDayId
          return {
            name: w.airport!.name,
            code: w.airport!.iataCode || null,
            airportId: w.airport!.id,
            latitude: w.airport!.latitude,
            longitude: w.airport!.longitude,
            localDate: days.find(d => d.id === dayId)?.civilDay ?? null,
            localTime: isLast ? w.arrTime : w.depTime,
          }
        }),
        legs: named.slice(0, -1).map(w => ({
          carrierName: w.airline,
          serviceNumber: w.flightNumber,
          seat: w.seat,
        })),
      }
    }
    if (type === 'train') {
      const named = trainWaypoints.filter(w => w.name.trim())
      const first = trainWaypoints[0]
      const last = trainWaypoints[trainWaypoints.length - 1]
      return {
        id: reservation?.id ?? null,
        type,
        status,
        title,
        startTripDayId: first?.depDayId || startDayId || null,
        endTripDayId: last?.arrDayId || first?.depDayId || endDayId || null,
        confirmationCode: confirmation,
        notes,
        url,
        endpoints: named.map((w, i, all) => {
          const isLast = i === all.length - 1
          const dayId = isLast ? w.arrDayId : w.depDayId
          return {
            name: w.name.trim(),
            placeId: w.placeId,
            latitude: w.latitude,
            longitude: w.longitude,
            localDate: days.find(d => d.id === dayId)?.civilDay ?? null,
            localTime: isLast ? w.arrTime : w.depTime,
          }
        }),
        legs: named.slice(0, -1).map(w => ({
          serviceNumber: w.trainNumber,
          platform: w.platform,
          seat: w.seat,
        })),
      }
    }
    return {
      id: reservation?.id ?? null,
      type,
      status,
      title,
      startTripDayId: startDayId || null,
      endTripDayId: endDayId || startDayId || null,
      confirmationCode: confirmation,
      notes,
      url,
      endpoints: [
        {
          name: fromName.trim(),
          localDate: days.find(d => d.id === startDayId)?.civilDay ?? null,
          localTime: departureTime,
        },
        {
          name: toName.trim(),
          localDate: days.find(d => d.id === (endDayId || startDayId))?.civilDay ?? null,
          localTime: arrivalTime,
        },
      ],
      legs: [],
    }
  }

  const save = async (): Promise<string | null> => {
    if (!canMutate) {
      toast.error(t('trip.explore.add.hofOnly'))
      return null
    }
    if (!title.trim()) return null
    const draft = buildDraft()
    const startI = days.find(d => d.id === draft.startTripDayId)?.dayIndex
    const endI = days.find(d => d.id === draft.endTripDayId)?.dayIndex
    if ((endBeforeStart) || (startI != null && endI != null && endI < startI)) {
      toast.error(t('reservations.validation.endBeforeStart'))
      return null
    }
    setSaving(true)
    try {
      const id = await upsertTripTransport(tripId, draft)
      await onSaved()
      if (!(prefill && !reservation)) toast.success(t('reservations.toast.updated'))
      return id
    } catch {
      toast.error(t('reservations.toast.saveError'))
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (automated) return
    const id = await save()
    if (!id) return
    const intent = expenseIntent
    setExpenseIntent(null)
    if (intent === 'create') {
      onClose()
      onOpenCostsPrefill({
        name: title.trim(),
        category: costCategoryForTransportType(type),
        reservationId: id,
      })
    } else if (intent === 'edit' && linkedExpense) {
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
    <Modal
      isOpen={open}
      onClose={onClose}
      title={automated ? t('transit.title') : reservation ? t('transport.modalTitle.edit') : t('transport.modalTitle.create')}
      size="2xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} className="text-content-muted" style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border-primary)', background: 'none', fontSize: 'calc(12px * var(--fs-scale-body, 1))', cursor: 'pointer', fontFamily: 'inherit' }}>
            {t('common.cancel')}
          </button>
          {!automated && (
            <button
              type="button"
              onClick={() => { void handleSubmit() }}
              disabled={saving || !title.trim() || endBeforeStart || !canMutate}
              className="bg-[var(--text-primary)] text-[var(--bg-primary)]"
              style={{
                padding: '8px 20px', borderRadius: 10, border: 'none',
                fontSize: 'calc(12px * var(--fs-scale-body, 1))', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                opacity: saving || !title.trim() || endBeforeStart || !canMutate ? 0.5 : 1,
              }}
            >
              {saving ? t('common.saving') : reservation ? t('common.update') : t('common.add')}
            </button>
          )}
        </div>
      }
    >
      {isCreate && tripHasDates && (
        <div className="bg-surface-secondary" style={{ display: 'flex', borderRadius: 11, padding: 3, gap: 2, marginBottom: 14 }}>
          {([['manual', t('transport.modeManual')], ['automated', t('transport.modeAutomated')]] as const).map(([m, label]) => {
            const active = (m === 'automated') === automated
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  const next = m === 'automated'
                  setAutomated(next)
                  if (next) toast.error(t('reservations.import.unavailable'))
                }}
                className={active ? 'bg-surface-card text-content' : 'text-content-muted'}
                style={{ flex: 1, padding: '8px 6px', fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', fontWeight: 500, borderRadius: 8, border: 0, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', background: active ? undefined : 'transparent', boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {automated ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="bg-surface-tertiary" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 42, height: 42, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: '#7c3aed18' }}>
              <TramFront size={20} strokeWidth={1.8} color="#7c3aed" />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div className="text-content" style={{ fontSize: 'calc(14px * var(--fs-scale-body, 1))', fontWeight: 700, letterSpacing: '-0.01em' }}>{t('transit.title')}</div>
              <div className="text-content-faint" style={{ fontSize: 'calc(11.5px * var(--fs-scale-caption, 1))', marginTop: 1 }}>{t('transit.searchHint')}</div>
            </div>
            <div style={{ width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : 210, flexShrink: 0 }}>
              <CustomSelect value={startDayId} onChange={v => setStartDayId(asDayId(v))} placeholder={t('dayplan.dayN', { n: '?' })} options={dayOptions} size="sm" />
            </div>
          </div>
        </div>
      ) : (
        <TransportManualForm
          type={type}
          setType={setType}
          title={title}
          setTitle={setTitle}
          waypoints={waypoints}
          setWaypoints={setWaypoints}
          trainWaypoints={trainWaypoints}
          setTrainWaypoints={setTrainWaypoints}
          fromName={fromName}
          setFromName={setFromName}
          toName={toName}
          setToName={setToName}
          startDayId={startDayId}
          setStartDayId={setStartDayId}
          endDayId={endDayId}
          setEndDayId={setEndDayId}
          departureTime={departureTime}
          setDepartureTime={setDepartureTime}
          arrivalTime={arrivalTime}
          setArrivalTime={setArrivalTime}
          confirmation={confirmation}
          setConfirmation={setConfirmation}
          status={status}
          setStatus={setStatus}
          notes={notes}
          setNotes={setNotes}
          dayOptions={dayOptions}
          placeListId={placeListId}
          places={places}
          matchPlace={matchPlace}
          linkedExpense={linkedExpense}
          currencyCode={currencyCode}
          locale={locale}
          canMutate={canMutate}
          onSubmit={() => { void handleSubmit() }}
          onCreateExpense={() => { setExpenseIntent('create'); void handleSubmit() }}
          onEditExpense={() => { setExpenseIntent('edit'); void handleSubmit() }}
          onUnlink={() => { void handleUnlink() }}
          filesSlot={reservation?.id ? (
            <FamilyFileAttach
              tripId={tripId}
              familyId={familyId}
              canMutate={canMutate}
              mePersonId={mePersonId}
              reservationId={reservation.id}
            />
          ) : undefined}
        />
      )}
    </Modal>
  )
}

function TransportManualForm({
  type, setType, title, setTitle, waypoints, setWaypoints, trainWaypoints, setTrainWaypoints,
  fromName, setFromName, toName, setToName, startDayId, setStartDayId, endDayId, setEndDayId,
  departureTime, setDepartureTime, arrivalTime, setArrivalTime, confirmation, setConfirmation,
  status, setStatus, notes, setNotes, dayOptions, placeListId, places, matchPlace,
  linkedExpense, currencyCode, locale, canMutate, onSubmit, onCreateExpense, onEditExpense, onUnlink, filesSlot,
}: {
  type: TransportManualType
  setType: (v: TransportManualType) => void
  title: string
  setTitle: (v: string) => void
  waypoints: FlightWaypoint[]
  setWaypoints: (fn: (prev: FlightWaypoint[]) => FlightWaypoint[]) => void
  trainWaypoints: StationWaypoint[]
  setTrainWaypoints: (fn: (prev: StationWaypoint[]) => StationWaypoint[]) => void
  fromName: string
  setFromName: (v: string) => void
  toName: string
  setToName: (v: string) => void
  startDayId: string
  setStartDayId: (v: string) => void
  endDayId: string
  setEndDayId: (v: string) => void
  departureTime: string
  setDepartureTime: (v: string) => void
  arrivalTime: string
  setArrivalTime: (v: string) => void
  confirmation: string
  setConfirmation: (v: string) => void
  status: ReservationStatus
  setStatus: (v: ReservationStatus) => void
  notes: string
  setNotes: (v: string) => void
  dayOptions: { value: string; label: string; badge?: string }[]
  placeListId: string
  places: FamilyTripPlace[]
  matchPlace: (name: string) => FamilyTripPlace | undefined
  linkedExpense: FamilyTripExpense | null
  currencyCode: string
  locale: string
  canMutate: boolean
  onSubmit: () => void
  onCreateExpense: () => void
  onEditExpense: () => void
  onUnlink: () => void
  filesSlot?: ReactElement
}): ReactElement {
  const { t } = useTranslation()
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit() }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                borderColor: type === value ? 'var(--text-primary)' : 'var(--border-primary)',
              }}
            >
              <Icon size={11} /> {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelClass}>{t('reservations.titleLabel')} *</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} required placeholder={t('reservations.titlePlaceholder')} className={inputClass} />
      </div>

      {type === 'flight' ? (
        <FlightRoute waypoints={waypoints} setWaypoints={setWaypoints} dayOptions={dayOptions} />
      ) : type === 'train' ? (
        <TrainRoute trainWaypoints={trainWaypoints} setTrainWaypoints={setTrainWaypoints} dayOptions={dayOptions} placeListId={placeListId} places={places} matchPlace={matchPlace} />
      ) : (
        <OtherRoute
          fromName={fromName} setFromName={setFromName} toName={toName} setToName={setToName}
          startDayId={startDayId} setStartDayId={setStartDayId} endDayId={endDayId} setEndDayId={setEndDayId}
          departureTime={departureTime} setDepartureTime={setDepartureTime} arrivalTime={arrivalTime} setArrivalTime={setArrivalTime}
          type={type} dayOptions={dayOptions} placeListId={placeListId} places={places}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{t('reservations.confirmationCode')}</label>
          <input type="text" value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder={t('reservations.confirmationPlaceholder')} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t('reservations.status')}</label>
          <CustomSelect
            value={status}
            onChange={value => setStatus(value as ReservationStatus)}
            options={[
              { value: 'pending', label: t('reservations.pending') },
              { value: 'confirmed', label: t('reservations.confirmed') },
            ]}
            size="sm"
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>{t('reservations.notes')}</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder={t('reservations.notesPlaceholder')} className={inputClass} style={{ resize: 'none', lineHeight: 1.5 }} />
      </div>

      {filesSlot ?? (
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
        onCreate={onCreateExpense}
        onEdit={onEditExpense}
        onUnlink={onUnlink}
      />
    </form>
  )
}

function FlightRoute({
  waypoints, setWaypoints, dayOptions,
}: {
  waypoints: FlightWaypoint[]
  setWaypoints: (fn: (prev: FlightWaypoint[]) => FlightWaypoint[]) => void
  dayOptions: { value: string; label: string; badge?: string }[]
}): ReactElement {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className={labelClass}>{t('reservations.layover.route')}</label>
      {waypoints.map((wp, i) => {
        const isFirst = i === 0
        const isLast = i === waypoints.length - 1
        const updateWp = (patch: Partial<FlightWaypoint>) => setWaypoints(prev => prev.map((w, j) => (j === i ? { ...w, ...patch } : w)))
        const roleLabel = isFirst ? t('reservations.meta.from') : isLast ? t('reservations.meta.to') : t('reservations.layover.stop')
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="bg-surface-card" style={{ border: '1px solid var(--border-primary)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="text-content-faint" style={{ fontSize: 'calc(10px * var(--fs-scale-caption, 1))', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>{roleLabel}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <FamilyAirportSelect value={wp.airport} onChange={a => updateWp({ airport: a })} />
                </div>
                {!isFirst && !isLast && (
                  <button type="button" onClick={() => setWaypoints(prev => prev.filter((_, j) => j !== i))} aria-label={t('common.delete')} className="text-content-faint" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {!isFirst && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label className={labelClass}>{t('reservations.arrivalDate')}</label>
                    <CustomSelect value={wp.arrDayId} onChange={v => updateWp({ arrDayId: asDayId(v) })} placeholder={t('dayplan.dayN', { n: '?' })} options={dayOptions} size="sm" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label className={labelClass}>{t('reservations.arrivalTime')}</label>
                    <CustomTimePicker value={wp.arrTime} onChange={v => updateWp({ arrTime: v })} />
                  </div>
                </div>
              )}
              {!isLast && (
                <>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label className={labelClass}>{t('reservations.departureDate')}</label>
                      <CustomSelect value={wp.depDayId} onChange={v => updateWp({ depDayId: asDayId(v) })} placeholder={t('dayplan.dayN', { n: '?' })} options={dayOptions} size="sm" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label className={labelClass}>{t('reservations.departureTime')}</label>
                      <CustomTimePicker value={wp.depTime} onChange={v => updateWp({ depTime: v })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelClass}>{t('reservations.meta.airline')}</label>
                      <input type="text" value={wp.airline} onChange={e => updateWp({ airline: e.target.value })} placeholder="Lufthansa" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>{t('reservations.meta.flightNumber')}</label>
                      <input type="text" value={wp.flightNumber} onChange={e => updateWp({ flightNumber: e.target.value })} placeholder="LH 123" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>{t('reservations.meta.seat')}</label>
                      <input type="text" value={wp.seat} onChange={e => updateWp({ seat: e.target.value })} placeholder="12A" className={inputClass} />
                    </div>
                  </div>
                </>
              )}
            </div>
            {!isLast && (
              <button type="button" onClick={() => setWaypoints(prev => [...prev.slice(0, i + 1), emptyFlight(prev[i]?.depDayId || ''), ...prev.slice(i + 1)])} className="text-content-faint hover:text-content-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 10px', border: '1px dashed var(--border-primary)', borderRadius: 8, background: 'none', fontSize: 'calc(11px * var(--fs-scale-caption, 1))', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Plus size={12} /> {t('reservations.layover.addStop')}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TrainRoute({
  trainWaypoints, setTrainWaypoints, dayOptions, placeListId, places, matchPlace,
}: {
  trainWaypoints: StationWaypoint[]
  setTrainWaypoints: (fn: (prev: StationWaypoint[]) => StationWaypoint[]) => void
  dayOptions: { value: string; label: string; badge?: string }[]
  placeListId: string
  places: FamilyTripPlace[]
  matchPlace: (name: string) => FamilyTripPlace | undefined
}): ReactElement {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className={labelClass}>{t('reservations.layover.route')}</label>
      <datalist id={placeListId}>
        {places.map(p => <option key={p.id} value={p.name} />)}
      </datalist>
      {trainWaypoints.map((wp, i) => {
        const isFirst = i === 0
        const isLast = i === trainWaypoints.length - 1
        const updateWp = (patch: Partial<StationWaypoint>) => setTrainWaypoints(prev => prev.map((w, j) => (j === i ? { ...w, ...patch } : w)))
        const roleLabel = isFirst ? t('reservations.meta.from') : isLast ? t('reservations.meta.to') : t('reservations.layover.stop')
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="bg-surface-card" style={{ border: '1px solid var(--border-primary)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="text-content-faint" style={{ fontSize: 'calc(10px * var(--fs-scale-caption, 1))', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>{roleLabel}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    type="text"
                    list={placeListId}
                    value={wp.name}
                    onChange={e => {
                      const name = e.target.value
                      const place = matchPlace(name)
                      updateWp({
                        name,
                        placeId: place?.id ?? null,
                        latitude: place?.lat ?? null,
                        longitude: place?.lng ?? null,
                      })
                    }}
                    placeholder={t('reservations.meta.from')}
                    className={inputClass}
                  />
                </div>
                {!isFirst && !isLast && (
                  <button type="button" onClick={() => setTrainWaypoints(prev => prev.filter((_, j) => j !== i))} aria-label={t('common.delete')} className="text-content-faint" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {!isFirst && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label className={labelClass}>{t('reservations.arrivalDate')}</label>
                    <CustomSelect value={wp.arrDayId} onChange={v => updateWp({ arrDayId: asDayId(v) })} placeholder={t('dayplan.dayN', { n: '?' })} options={dayOptions} size="sm" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label className={labelClass}>{t('reservations.arrivalTime')}</label>
                    <CustomTimePicker value={wp.arrTime} onChange={v => updateWp({ arrTime: v })} />
                  </div>
                </div>
              )}
              {!isLast && (
                <>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label className={labelClass}>{t('reservations.departureDate')}</label>
                      <CustomSelect value={wp.depDayId} onChange={v => updateWp({ depDayId: asDayId(v) })} placeholder={t('dayplan.dayN', { n: '?' })} options={dayOptions} size="sm" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label className={labelClass}>{t('reservations.departureTime')}</label>
                      <CustomTimePicker value={wp.depTime} onChange={v => updateWp({ depTime: v })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelClass}>{t('reservations.meta.trainNumber')}</label>
                      <input type="text" value={wp.trainNumber} onChange={e => updateWp({ trainNumber: e.target.value })} placeholder="ICE 123" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>{t('reservations.meta.platform')}</label>
                      <input type="text" value={wp.platform} onChange={e => updateWp({ platform: e.target.value })} placeholder="12" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>{t('reservations.meta.seat')}</label>
                      <input type="text" value={wp.seat} onChange={e => updateWp({ seat: e.target.value })} placeholder="42A" className={inputClass} />
                    </div>
                  </div>
                </>
              )}
            </div>
            {!isLast && (
              <button type="button" onClick={() => setTrainWaypoints(prev => [...prev.slice(0, i + 1), emptyStation(prev[i]?.depDayId || ''), ...prev.slice(i + 1)])} className="text-content-faint hover:text-content-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 10px', border: '1px dashed var(--border-primary)', borderRadius: 8, background: 'none', fontSize: 'calc(11px * var(--fs-scale-caption, 1))', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Plus size={12} /> {t('reservations.layover.addStop')}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function OtherRoute({
  fromName, setFromName, toName, setToName, startDayId, setStartDayId, endDayId, setEndDayId,
  departureTime, setDepartureTime, arrivalTime, setArrivalTime, type, dayOptions, placeListId, places,
}: {
  fromName: string
  setFromName: (v: string) => void
  toName: string
  setToName: (v: string) => void
  startDayId: string
  setStartDayId: (v: string) => void
  endDayId: string
  setEndDayId: (v: string) => void
  departureTime: string
  setDepartureTime: (v: string) => void
  arrivalTime: string
  setArrivalTime: (v: string) => void
  type: TransportManualType
  dayOptions: { value: string; label: string; badge?: string }[]
  placeListId: string
  places: FamilyTripPlace[]
}): ReactElement {
  const { t } = useTranslation()
  return (
    <>
      <datalist id={placeListId}>
        {places.map(p => <option key={p.id} value={p.name} />)}
      </datalist>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{t('reservations.meta.from')}</label>
          <input type="text" list={placeListId} value={fromName} onChange={e => setFromName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t('reservations.meta.to')}</label>
          <input type="text" list={placeListId} value={toName} onChange={e => setToName(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label className={labelClass}>{type === 'car' ? t('reservations.pickupDate') : t('reservations.date')}</label>
          <CustomSelect value={startDayId} onChange={v => setStartDayId(asDayId(v))} placeholder={t('dayplan.dayN', { n: '?' })} options={dayOptions} size="sm" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label className={labelClass}>{type === 'car' ? t('reservations.pickupTime') : t('reservations.startTime')}</label>
          <CustomTimePicker value={departureTime} onChange={v => setDepartureTime(v)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label className={labelClass}>{type === 'car' ? t('reservations.returnDate') : t('reservations.endDate')}</label>
          <CustomSelect value={endDayId} onChange={v => setEndDayId(asDayId(v))} placeholder={t('dayplan.dayN', { n: '?' })} options={dayOptions} size="sm" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label className={labelClass}>{type === 'car' ? t('reservations.returnTime') : t('reservations.endTime')}</label>
          <CustomTimePicker value={arrivalTime} onChange={v => setArrivalTime(v)} />
        </div>
      </div>
    </>
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
