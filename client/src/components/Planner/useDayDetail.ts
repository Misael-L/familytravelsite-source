import { currentPlannerStayWritePort } from '../../repo/plannerStayPort'
import { captureStayAction, useStayActionScope, useStayState } from './stayActionScope'
import { useState, useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react'
import type { AccommodationCreateRequest, AccommodationUpdateRequest, WeatherResult } from '@trek/shared'
import { weatherApi } from '../../api/client'
import { accommodationRepo, type StayWriteResult } from '../../repo/accommodationRepo'
import { isDayInAccommodationRange } from '../../utils/dayOrder'
import { applyStayStops } from '../../store/stayStops'
import { stayCheckoutDay, stayRequestBody } from './stayFormModel'
import { useStaysRefresh } from './useStaysRefresh'
import type { Accommodation, Day } from '../../types'

export interface HotelForm {
  check_in: string
  check_in_end: string
  check_out: string
  confirmation: string
  place_id: number | null
}

export interface HotelDayRange {
  start: number | undefined
  end: number | undefined
}

/** false while closed, true for a new stay, 'edit' for the one in `accommodation`. */
export type HotelPickerMode = boolean | 'edit'

const EMPTY_STAYS: Accommodation[] = []
const EMPTY_HOTEL_FORM: HotelForm = { check_in: '', check_in_end: '', check_out: '', confirmation: '', place_id: null }

/**
 * Creates a stay, or updates the one with `accId`, and applies the stops the
 * server moved for it, for the desktop day panel and the phone accommodation
 * sheet alike. Throws when the server refuses the write.
 */
function updateObservedStay(tripId: number, id: number, body: Parameters<typeof accommodationRepo.update>[2], observed?: Accommodation) {
  return currentPlannerStayWritePort() ? accommodationRepo.update(tripId,id,body,observed) : accommodationRepo.update(tripId,id,body)
}
export function writeStay(
  tripId: number, accId: number, body: AccommodationUpdateRequest, observed?: Accommodation
): Promise<StayWriteResult>
export function writeStay(
  tripId: number, accId: number | null, body: AccommodationCreateRequest, observed?: Accommodation, cohort?: Accommodation[]
): Promise<StayWriteResult>
export async function writeStay(
  tripId: number, accId: number | null, body: AccommodationUpdateRequest, observed?: Accommodation, cohort?: Accommodation[]
) {
  const action = captureStayAction()
  // The nullable-ID overload requires the complete create payload.
  const data = await action.perform(() =>
    accId != null
      ? updateObservedStay(tripId, accId, body, observed)
      : currentPlannerStayWritePort()?.create
        ? accommodationRepo.create(tripId, body as AccommodationCreateRequest, cohort)
        : accommodationRepo.create(tripId, body as AccommodationCreateRequest)
  )
  applyStayStops(data, action.assertCurrent)
  return data
}

/**
 * A day's detailed forecast (Open-Meteo through the weather service, climate
 * fallback), shared by the desktop day panel and the phone day sheet. `ready` says
 * whether there is a day and a place to ask about; while it is false the forecast
 * is cleared. An answer that arrives after the day or the place changed is dropped:
 * the panel stays mounted across a day switch, and the previous day's late
 * response would otherwise overwrite the new day's forecast.
 */
export function useDayForecast(ready: boolean, date: string | null | undefined, lat: number | null, lng: number | null, language: string) {
  const [weather, setWeather] = useState<WeatherResult | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!ready || !date || lat == null || lng == null) { setWeather(null); return }
    let cancelled = false
    setLoading(true)
    weatherApi.getDetailed(lat, lng, date, language)
      .then(data => { if (!cancelled) setWeather(data.error ? null : data) })
      .catch(() => { if (!cancelled) setWeather(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ready, date, lat, lng, language])
  return { weather, loading }
}

/**
 * Renaming a day in place (#1065), shared by the desktop day panel and the phone
 * day sheet: the field takes the focus when it opens, and committing closes it and
 * hands the trimmed title on.
 */
export function useDayRename(onCommit: (title: string) => void) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => { if (editingTitle) titleInputRef.current?.focus() }, [editingTitle])
  const startRename = (title: string) => {
    setTitleDraft(title)
    setEditingTitle(true)
  }
  const commitRename = () => {
    setEditingTitle(false)
    onCommit(titleDraft.trim())
  }
  return { editingTitle, setEditingTitle, titleDraft, setTitleDraft, titleInputRef, startRename, commitRename }
}

/**
 * The stay the panel holds once its stays were read again. The picked one (the
 * stay being edited) stays picked, as its fresh copy, while it is still on the
 * day. One that left the day while the panel stayed on it, cancelled or moved
 * away by someone else, leaves nothing picked: falling back to the day's first
 * stay would hand an open editor another stay to save over. With nothing
 * picked, or on another day, the day's first stay is taken.
 */
function stayAfterReload(picked: Accommodation | null, forDay: Accommodation[], sameDay: boolean): Accommodation | null {
  if (picked) {
    const kept = forDay.find(a => a.id === picked.id)
    if (kept) return kept
    if (sameDay) return null
  }
  return forDay[0] ?? null
}

/** Day-detail data + accommodation logic: weather load, accommodations list,
 *  hotel picker form state and create/update/delete handlers.
 *
 *  The write handlers let a failed request through to the caller, which is the
 *  one that can tell the user; the picker stays open with what was entered. */
export function useDayDetail(day: Day | null, days: Day[], tripId: number, lat: number | null, lng: number | null, language: string, onAccommodationChange?: () => void) {
  const capture = useStayActionScope(tripId, day?.id)
  const [accommodation, setAccommodation] = useStayState<Accommodation | null>(capture, null)
  const [dayAccommodations, setDayAccommodations] = useStayState<Accommodation[]>(capture, EMPTY_STAYS)
  const [accommodations, setAccommodations] = useStayState<Accommodation[]>(capture, EMPTY_STAYS)
  const [showHotelPicker, setShowHotelPicker] = useStayState<HotelPickerMode>(capture, false)
  // A stay virtually never checks out the day it checks in — default the range
  // to check-out on the next day, unless the trip ends here.
  const defaultHotelDayRange = (d: Day | null): HotelDayRange => {
    return { start: d?.id, end: stayCheckoutDay(days || [], d?.id) || d?.id }
  }
  const [hotelDayRange, setHotelDayRange] = useStayState<HotelDayRange>(capture, defaultHotelDayRange(day))
  const [hotelCategoryFilter, setHotelCategoryFilter] = useStayState<number | ''>(capture, '')
  const [hotelForm, setHotelForm] = useStayState<HotelForm>(capture, EMPTY_HOTEL_FORM)

  const originalStay = useRef<Accommodation | null>(null)
  const originalCreation = useRef<Accommodation[] | undefined>(undefined)
  useLayoutEffect(() => { if (showHotelPicker === true) originalCreation.current = currentPlannerStayWritePort()?.captureCreation?.(tripId) }, [showHotelPicker, tripId])
  const beginStayEdit = (row: Accommodation) => { originalStay.current = row; setAccommodation(row) }
  const editor = useRef({ id: accommodation?.id, form: hotelForm, range: hotelDayRange, picker: showHotelPicker })
  useLayoutEffect(() => { editor.current = { id: accommodation?.id, form: hotelForm, range: hotelDayRange, picker: showHotelPicker } })
  const captureEditor = () => {
    const original = editor.current
    return capture(() => original.id === editor.current.id && original.form === editor.current.form && original.range.start === editor.current.range.start && original.range.end === editor.current.range.end && original.picker === editor.current.picker)
  }

  const isForDay = (a: Accommodation) => day ? isDayInAccommodationRange(day, a.start_day_id, a.end_day_id, days) : false

  // Both effects drop an answer that arrives after the day changed: the panel
  // stays mounted across a day switch, and the previous day's late response
  // would otherwise overwrite the new day's forecast and hotel.
  const { weather, loading } = useDayForecast(!!(day?.date && lat && lng), day?.date, lat, lng, language)

  // A stay booked, moved or cancelled elsewhere (the assistant, a fellow
  // traveller, a plugin, a booking import) reaches this panel as a nudge, and the
  // panel reads its stays again through the effect below.
  const [staysRevision, setStaysRevision] = useStayState(capture, 0)
  useStaysRefresh(() => setStaysRevision(r => r + 1))

  // The day the stays on show were read for, so that a read of the same day can
  // tell a stay that left it from a switch to another day.
  const staysDayRef = useRef<number | undefined>(undefined)
  // Shows a read of the stays against the latest pick and editor state.
  const showStays = useEffectEvent((all: Accommodation[]) => {
    const forDay = all.filter(isForDay)
    const sameDay = staysDayRef.current === day?.id
    staysDayRef.current = day?.id
    const next = stayAfterReload(accommodation, forDay, sameDay)
    setAccommodations(all)
    setDayAccommodations(forDay)
    setAccommodation(next)
    // The stay open in the editor is no longer on this day: close the editor,
    // so Save neither writes its form over another stay nor books it anew.
    if (showHotelPicker === 'edit' && accommodation && next?.id !== accommodation.id) setShowHotelPicker(false)
  })

  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    const action = capture()
    action.perform(() => accommodationRepo.list(tripId))
      .then(data => {
        if (!cancelled) action.effect(() => showStays(data.accommodations || []))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [tripId, day?.id, staysRevision, capture])


  const handleSelectPlace = (placeId: number) => {
    setHotelForm(f => ({ ...f, place_id: placeId }))
  }

  /** Creates the stay the picker describes. Throws when the original save cannot be confirmed. */
  const handleSaveAccommodation = async () => {
    const action = captureEditor()
    action.assertCurrent()
    if (!hotelForm.place_id || hotelDayRange.start == null || hotelDayRange.end == null) return
    const data = await action.perform(() => writeStay(tripId, null, stayRequestBody(hotelForm, hotelDayRange), undefined, originalCreation.current))
    action.effect(() => {
      const newAcc: Accommodation = data.accommodation
      const updated = [...accommodations, newAcc]
      setAccommodations(updated)
      setAccommodation(newAcc)
      setDayAccommodations(updated.filter(isForDay))
      setShowHotelPicker(false)
      setHotelForm(EMPTY_HOTEL_FORM)
      onAccommodationChange?.()
    })
  }

  /** Save and reload both belong to the editor that initiated them. */
  const handleUpdateAccommodation = async () => {
    const action = captureEditor()
    action.assertCurrent()
    if (!accommodation) return
    await action.perform(() => writeStay(tripId, accommodation.id, stayRequestBody(hotelForm, hotelDayRange), originalStay.current ?? undefined))
    const d = await action.perform(() => accommodationRepo.list(tripId))
    action.effect(() => {
      setShowHotelPicker(false)
      setHotelForm(EMPTY_HOTEL_FORM)
      const all: Accommodation[] = d.accommodations || []
      setAccommodations(all)
      const forDay = all.filter(isForDay)
      setDayAccommodations(forDay)
      setAccommodation(stayAfterReload(accommodation, forDay, true))
      onAccommodationChange?.()
    })
  }

  const updateAccommodationField = async (field: string, value: string | null) => {
    const action = captureEditor()
    if (!action.current() || !accommodation) return
    try {
      const data = await action.perform(() => updateObservedStay(tripId, accommodation.id, { [field]: value || null }, accommodation))
      action.effect(() => {
        applyStayStops(data, action.assertCurrent)
        setAccommodation(data.accommodation)
        onAccommodationChange?.()
      })
    } catch {
      // Preserve the existing inline-edit failure behavior, without publishing an obsolete reply.
    }
  }

  /** The selected target remains explicit even when several hotels share the day. */
  const handleRemoveAccommodation = async (target: Accommodation | null = accommodation) => {
    const action = captureEditor()
    action.assertCurrent()
    if (!target) return
    const result = await action.perform(() => currentPlannerStayWritePort()?.trash ? accommodationRepo.delete(tripId, target.id, undefined, target) : accommodationRepo.delete(tripId, target.id))
    action.effect(() => {
      applyStayStops(result, action.assertCurrent)
      const updated = accommodations.filter(a => a.id !== target.id)
      setAccommodations(updated)
      setDayAccommodations(updated.filter(isForDay))
      setAccommodation(prev => (prev && prev.id !== target.id ? prev : null))
      onAccommodationChange?.()
    })
  }

  return {
    weather, loading, accommodation, setAccommodation, beginStayEdit, dayAccommodations, setDayAccommodations,
    accommodations, setAccommodations, showHotelPicker, setShowHotelPicker,
    hotelDayRange, setHotelDayRange, hotelCategoryFilter, setHotelCategoryFilter,
    hotelForm, setHotelForm, handleSelectPlace, handleSaveAccommodation, handleUpdateAccommodation,
    updateAccommodationField, handleRemoveAccommodation,
  }
}
