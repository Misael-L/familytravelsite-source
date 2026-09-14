import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useJourneyStore } from '../../store/journeyStore'
import { journeyApi } from '../../api/client'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import { isSupabaseDataPlane } from '../../data/supabase/auth'
import { listFamilyJourneyAvailableTrips } from '../../data/supabase/journeys'
import { useAuthStore } from '../../store/authStore'
import type { JourneyEntityId } from '../../store/journeyStore'
import {
  isLiveJourney,
  linkedTripIdSet,
  pickFamilyEndedTripSuggestion,
  pickJourneyHero,
  type JourneyListItem,
  type JourneySuggestionTrip,
} from './journeyFrontpageModel'

/**
 * Journey list page logic — store load, create modal, search, suggestion banner,
 * and live-vs-latest hero. JourneyPage stays a wiring container.
 */
export function useJourney() {
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useTranslation()
  const { journeys, loading, loadError, loadJourneys, createJourney } = useJourneyStore()
  const familyPlane = isSupabaseDataPlane()
  const familyId = useAuthStore(s => s.familyId)

  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [availableTrips, setAvailableTrips] = useState<JourneySuggestionTrip[]>([])
  const [selectedTripIds, setSelectedTripIds] = useState<Set<JourneyEntityId>>(new Set())
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [suggestions, setSuggestions] = useState<JourneySuggestionTrip[]>([])
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<JourneyEntityId>>(new Set())
  const [suggestionError, setSuggestionError] = useState(false)
  const [availableTripsError, setAvailableTripsError] = useState(false)
  const [suggestionEpoch, setSuggestionEpoch] = useState(0)

  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    void loadJourneys()
  }, [familyPlane, familyId])

  useEffect(() => {
    if (!familyPlane) {
      setSuggestionError(false)
      journeyApi.suggestions()
        .then(d => {
          setSuggestions(d.trips || [])
          setSuggestionError(false)
        })
        .catch(() => {
          setSuggestions([])
          setSuggestionError(true)
        })
      return
    }
    if (!familyId) {
      setSuggestions([])
      setSuggestionError(false)
      return
    }
    let cancelled = false
    setSuggestionError(false)
    listFamilyJourneyAvailableTrips(familyId)
      .then(trips => {
        if (cancelled) return
        setSuggestions(trips)
        setSuggestionError(false)
      })
      .catch(() => {
        if (cancelled) return
        setSuggestions([])
        setSuggestionError(true)
      })
    return () => { cancelled = true }
  }, [familyPlane, familyId, suggestionEpoch])

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      void openCreateModal()
      setSearchParams(p => { p.delete('create'); return p }, { replace: true })
    }
  }, [searchParams])

  const list = journeys as JourneyListItem[]

  const activeJourney = useMemo(
    () => pickJourneyHero(list, searchQuery),
    [list, searchQuery],
  )
  const activeJourneyIsLive = isLiveJourney(activeJourney)

  const activeSuggestion = useMemo(() => {
    const remaining = suggestions.filter(s => !dismissedSuggestions.has(s.id))
    if (!familyPlane) return remaining[0]
    return pickFamilyEndedTripSuggestion(remaining, linkedTripIdSet(list))
  }, [familyPlane, suggestions, dismissedSuggestions, list])

  const filteredJourneys = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return list.filter(j => j.id !== activeJourney?.id)
    return list.filter(j => {
      const inTitle = j.title.toLowerCase().includes(q)
      const inSubtitle = j.subtitle?.toLowerCase().includes(q) ?? false
      return inTitle || inSubtitle
    })
  }, [list, activeJourney, searchQuery])

  const openCreateModal = async (preSelectedTripId?: JourneyEntityId) => {
    setShowCreate(true)
    setNewTitle('')
    const initial = new Set<JourneyEntityId>()
    if (preSelectedTripId != null) initial.add(preSelectedTripId)
    setSelectedTripIds(initial)
    setAvailableTripsError(false)
    try {
      if (familyPlane) {
        if (!familyId) {
          setAvailableTrips([])
          setAvailableTripsError(false)
          return
        }
        const trips = await listFamilyJourneyAvailableTrips(familyId)
        setAvailableTrips(trips)
        setAvailableTripsError(false)
      } else {
        const data = await journeyApi.availableTrips()
        setAvailableTrips(data.trips || [])
        setAvailableTripsError(false)
      }
    } catch {
      setAvailableTrips([])
      setAvailableTripsError(true)
    }
  }

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    try {
      const j = await createJourney({
        title: newTitle.trim(),
        trip_ids: [...selectedTripIds],
      })
      setShowCreate(false)
      navigate(`/journey/${j.id}`)
    } catch {
      toast.error(t('journey.createError'))
    }
  }

  const totalPlaces = useMemo(() => {
    return availableTrips
      .filter(trip => selectedTripIds.has(trip.id))
      .reduce((sum, trip) => sum + (trip.place_count || 0), 0)
  }, [availableTrips, selectedTripIds])

  return {
    navigate, journeys: list, loading, loadError, loadJourneys,
    showCreate, setShowCreate, newTitle, setNewTitle,
    availableTrips, selectedTripIds, setSelectedTripIds,
    searchOpen, setSearchOpen, searchQuery, setSearchQuery, searchInputRef,
    activeSuggestion, setDismissedSuggestions,
    suggestionError, availableTripsError,
    retrySuggestions: () => setSuggestionEpoch(n => n + 1),
    activeJourney, activeJourneyIsLive, filteredJourneys,
    openCreateModal, handleCreate, totalPlaces,
  }
}
