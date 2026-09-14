import { useEffect, useRef, useState } from 'react'
import { Bell, Calendar, Camera, Search, UserPlus, X } from 'lucide-react'
import Modal from '../shared/Modal'
import CustomSelect from '../shared/CustomSelect'
import { CustomDatePicker } from '../shared/CustomDateTimePicker'
import { NumericInput } from '../shared/NumericInput'
import { useToast } from '../shared/Toast'
import { useTranslation } from '../../i18n'
import { listPlacesByIds, searchCatalogPlaces, type CatalogPlaceHit } from '../../data/supabase/catalogPlaces'
import { listCountriesByIds, searchCountries, type CatalogCountryHit } from '../../data/supabase/catalogCountries'
import {
  listFamilyPeople,
  listTravelerPresets,
  type FamilyPerson,
  type TravelerPreset,
} from '../../data/supabase/familyRoster'
import {
  TRIP_OCCASIONS,
  buildCreateTripProposalRpcArgs,
  buildUpdateTripProposalRpcArgs,
  canAdvanceFromBasics,
  createTripProposal,
  fetchTripProposalEditSource,
  inclusiveDayCount,
  resolveProposalDates,
  updateTripProposal,
  type TripOccasion,
} from '../../data/supabase/tripProposals'
import { searchUnsplash, type UnsplashPhoto } from '../../data/supabase/unsplash'
import {
  listMyCatalogSavesInCountries,
  type CatalogSaveHint,
} from '../../data/supabase/catalogSaves'
import FamilyProposalHintChips from './FamilyProposalHintChips'

type ProposeStep = 'basics' | 'countries' | 'cities' | 'notes' | 'review'
const STEPS: ProposeStep[] = ['basics', 'countries', 'cities', 'notes', 'review']

const OCCASION_KEYS: Record<TripOccasion, string> = {
  trip: 'dashboard.propose.occasion.trip',
  vacation: 'dashboard.propose.occasion.vacation',
  weekend: 'dashboard.propose.occasion.weekend',
  other: 'dashboard.propose.occasion.other',
}

const STEP_KEYS: Record<ProposeStep, string> = {
  basics: 'dashboard.propose.step.basics',
  countries: 'dashboard.propose.step.countries',
  cities: 'dashboard.propose.step.cities',
  notes: 'dashboard.propose.step.notes',
  review: 'dashboard.propose.step.review',
}

type FamilyProposeTripModalProps = {
  isOpen: boolean
  familyId: string | null
  personId: string | null
  editingProposalId?: string | null
  editingTripId?: string | null
  onClose: () => void
  onSubmitted: (tripId: string, edited: boolean) => void
}

function mergeHits<T extends { id: string }>(named: T[], existing: T[]): T[] {
  const seen = new Set(named.map(h => h.id))
  return [...named, ...existing.filter(h => !seen.has(h.id))]
}

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent text-sm'

export default function FamilyProposeTripModal({
  isOpen,
  familyId,
  personId,
  editingProposalId = null,
  editingTripId = null,
  onClose,
  onSubmitted,
}: FamilyProposeTripModalProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const coverSearchSeq = useRef(0)

  const [step, setStep] = useState<ProposeStep>('basics')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [dayCount, setDayCount] = useState<number | ''>(7)
  const [occasion, setOccasion] = useState<TripOccasion>('trip')
  const [reminderDays, setReminderDays] = useState(3)
  const [customReminder, setCustomReminder] = useState(false)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [coverSearchQuery, setCoverSearchQuery] = useState('')
  const [coverSearchResults, setCoverSearchResults] = useState<UnsplashPhoto[]>([])
  const [coverSearchError, setCoverSearchError] = useState('')
  const [searchingCover, setSearchingCover] = useState(false)

  const [roster, setRoster] = useState<FamilyPerson[]>([])
  const [presets, setPresets] = useState<TravelerPreset[]>([])
  const [selectedTravelerIds, setSelectedTravelerIds] = useState<string[]>([])
  const [travelerSelect, setTravelerSelect] = useState('')

  const [countryQuery, setCountryQuery] = useState('')
  const [countries, setCountries] = useState<CatalogCountryHit[]>([])
  const [selectedCountryIds, setSelectedCountryIds] = useState<string[]>([])
  const [primaryCountryId, setPrimaryCountryId] = useState<string | null>(null)
  const [selectedCountryNames, setSelectedCountryNames] = useState<Record<string, string>>({})

  const [placeQuery, setPlaceQuery] = useState('')
  const [places, setPlaces] = useState<CatalogPlaceHit[]>([])
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([])
  const [selectedPlaceNames, setSelectedPlaceNames] = useState<Record<string, string>>({})
  const [savedHints, setSavedHints] = useState<CatalogSaveHint[]>([])

  const [error, setError] = useState('')
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [loadingSource, setLoadingSource] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const isEditing = Boolean(editingProposalId && editingTripId)

  useEffect(() => {
    if (!isOpen) return
    setStep('basics')
    setTitle('')
    setNotes('')
    setStartDate('')
    setEndDate('')
    setDayCount(7)
    setOccasion('trip')
    setReminderDays(3)
    setCustomReminder(false)
    setCoverUrl(null)
    setCoverSearchQuery('')
    setCoverSearchResults([])
    setCoverSearchError('')
    setCountryQuery('')
    setCountries([])
    setSelectedCountryIds([])
    setPrimaryCountryId(null)
    setSelectedCountryNames({})
    setPlaceQuery('')
    setPlaces([])
    setSelectedPlaceIds([])
    setSelectedPlaceNames({})
    setSavedHints([])
    setError('')
    setSubmitting(false)
    setLoadingSource(false)
    setSelectedTravelerIds(personId ? [personId] : [])
    if (!familyId) return
    let cancelled = false
    const boot = async () => {
      try {
        const [people, travelerPresets, countryHits] = await Promise.all([
          listFamilyPeople(familyId),
          personId ? listTravelerPresets(familyId, personId).catch(() => [] as TravelerPreset[]) : Promise.resolve([] as TravelerPreset[]),
          searchCountries({ limit: 80 }),
        ])
        if (cancelled) return
        setRoster(people)
        setPresets(travelerPresets)
        setCountries(countryHits)
        if (!editingProposalId || !editingTripId) return
        setLoadingSource(true)
        const source = await fetchTripProposalEditSource(editingTripId)
        if (cancelled) return
        if (!source) {
          setError(t('dashboard.toast.proposeError'))
          return
        }
        setTitle(source.title)
        setNotes(source.notes ?? '')
        setStartDate(source.startDate)
        setEndDate(source.endDate)
        setDayCount(source.startDate && source.endDate ? inclusiveDayCount(source.startDate, source.endDate) : 7)
        setOccasion(source.occasion)
        setReminderDays(source.reminderDays)
        setCustomReminder(![0, 1, 3, 9].includes(source.reminderDays))
        setCoverUrl(source.coverUrl)
        setSelectedCountryIds(source.countryIds)
        setPrimaryCountryId(source.primaryCountryId || source.countryIds[0] || null)
        setSelectedPlaceIds(source.placeIds)
        const travelers = source.travelerPersonIds.length > 0
          ? source.travelerPersonIds
          : (personId ? [personId] : [])
        setSelectedTravelerIds(
          personId && travelers.length > 0 && !travelers.includes(personId)
            ? [personId, ...travelers]
            : travelers,
        )
        const [namedCountries, namedPlaces] = await Promise.all([
          listCountriesByIds(source.countryIds),
          listPlacesByIds(source.placeIds),
        ])
        if (cancelled) return
        setSelectedCountryNames(Object.fromEntries(namedCountries.map(c => [c.id, c.name])))
        setSelectedPlaceNames(Object.fromEntries(namedPlaces.map(p => [p.id, p.name])))
        setCountries(prev => mergeHits(namedCountries, prev))
        setPlaces(prev => mergeHits(namedPlaces, prev))
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof Error && err.message ? err.message : t('dashboard.toast.proposeError')
        setError(message)
      } finally {
        if (!cancelled) setLoadingSource(false)
      }
    }
    void boot()
    return () => { cancelled = true }
  }, [isOpen, familyId, personId, editingProposalId, editingTripId])

  useEffect(() => {
    if (!isOpen || step !== 'countries') return
    let cancelled = false
    const handle = window.setTimeout(() => {
      setLoadingCatalog(true)
      searchCountries({ query: countryQuery, limit: 80 })
        .then(rows => { if (!cancelled) { setCountries(rows); setError('') } })
        .catch(() => { if (!cancelled) setCountries([]) })
        .finally(() => { if (!cancelled) setLoadingCatalog(false) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(handle) }
  }, [isOpen, step, countryQuery])

  useEffect(() => {
    if (!isOpen || step !== 'cities') return
    if (selectedCountryIds.length === 0) {
      setPlaces([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      setLoadingCatalog(true)
      searchCatalogPlaces({ query: placeQuery, countryIds: selectedCountryIds, limit: 120 })
        .then(rows => { if (!cancelled) { setPlaces(rows); setError('') } })
        .catch(() => { if (!cancelled) setPlaces([]) })
        .finally(() => { if (!cancelled) setLoadingCatalog(false) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(handle) }
  }, [isOpen, step, placeQuery, selectedCountryIds])

  useEffect(() => {
    if (!isOpen || !familyId || selectedCountryIds.length === 0) {
      setSavedHints([])
      return
    }
    let cancelled = false
    listMyCatalogSavesInCountries({ familyId, countryIds: selectedCountryIds })
      .then(rows => { if (!cancelled) setSavedHints(rows) })
      .catch(() => { if (!cancelled) setSavedHints([]) })
    return () => { cancelled = true }
  }, [isOpen, familyId, selectedCountryIds])

  const dates = resolveProposalDates({
    startDate,
    endDate,
    dayCount: typeof dayCount === 'number' ? dayCount : 0,
  })
  const stepIndex = STEPS.indexOf(step)
  const canContinue = step === 'basics'
    ? canAdvanceFromBasics(title, dates)
    : step === 'countries'
      ? selectedCountryIds.length > 0
      : true

  const updateStart = (value: string) => {
    setStartDate(value)
    if (!value) return
    if (!endDate || endDate < value) setEndDate(value)
  }

  const handleCoverSearch = async () => {
    const query = coverSearchQuery.trim() || title.trim()
    if (!query) {
      setCoverSearchError(t('dashboard.unsplashQueryRequired'))
      return
    }
    const seq = ++coverSearchSeq.current
    setSearchingCover(true)
    setCoverSearchError('')
    try {
      const photos = await searchUnsplash(query)
      if (seq !== coverSearchSeq.current) return
      setCoverSearchResults(photos)
      if (photos.length === 0) setCoverSearchError(t('dashboard.unsplashNoResults'))
    } catch (err: unknown) {
      if (seq !== coverSearchSeq.current) return
      setCoverSearchError(err instanceof Error ? err.message : t('dashboard.coverSearchError'))
    } finally {
      if (seq === coverSearchSeq.current) setSearchingCover(false)
    }
  }

  const goNext = () => {
    setError('')
    if (step === 'basics' && !canAdvanceFromBasics(title, dates)) {
      setError(title.trim() ? t('dashboard.propose.datesRequired') : t('dashboard.titleRequired'))
      return
    }
    if (step === 'countries' && selectedCountryIds.length === 0) {
      setError(t('dashboard.propose.countryRequired'))
      return
    }
    const next = STEPS[stepIndex + 1]
    if (next) setStep(next)
  }

  const goBack = () => {
    setError('')
    const prev = STEPS[stepIndex - 1]
    if (prev) setStep(prev)
  }

  const toggleCountry = (hit: CatalogCountryHit) => {
    setSelectedCountryIds(prev => {
      const next = prev.includes(hit.id)
        ? prev.filter(id => id !== hit.id)
        : [...prev, hit.id]
      if (prev.includes(hit.id)) {
        setPrimaryCountryId(current => (current === hit.id ? (next[0] ?? null) : current))
        setSelectedPlaceIds(ids => ids.filter(id => {
          const place = places.find(p => p.id === id)
          if (place?.countryId) return next.includes(place.countryId)
          const hint = savedHints.find(h => h.kind === 'place' && h.entityId === id)
          if (hint?.countryId) return next.includes(hint.countryId)
          return true
        }))
      } else {
        setPrimaryCountryId(current => current ?? hit.id)
      }
      return next
    })
    setSelectedCountryNames(prev => ({ ...prev, [hit.id]: hit.name }))
  }

  const togglePlace = (hit: CatalogPlaceHit) => {
    setSelectedPlaceIds(prev => prev.includes(hit.id) ? prev.filter(id => id !== hit.id) : [...prev, hit.id])
    setSelectedPlaceNames(prev => ({ ...prev, [hit.id]: hit.name }))
  }

  const toggleHintPlace = (hint: CatalogSaveHint) => {
    if (hint.kind !== 'place') return
    setSelectedPlaceIds(prev => (
      prev.includes(hint.entityId) ? prev.filter(id => id !== hint.entityId) : [...prev, hint.entityId]
    ))
    setSelectedPlaceNames(prev => ({ ...prev, [hint.entityId]: hint.name }))
  }

  const handleSubmit = async () => {
    if (!personId || (!isEditing && !familyId)) {
      toast.error(t('dashboard.propose.missingPerson'))
      return
    }
    const travelers = selectedTravelerIds.includes(personId)
      ? selectedTravelerIds
      : [personId, ...selectedTravelerIds]
    const fields = {
      title,
      notes,
      startDate,
      endDate,
      dayCount: typeof dayCount === 'number' ? dayCount : 7,
      countryIds: selectedCountryIds,
      placeIds: selectedPlaceIds,
      travelerPersonIds: travelers,
      primaryCountryId,
      occasion,
      coverUrl,
      reminderDays,
    }
    const built = isEditing && editingProposalId
      ? buildUpdateTripProposalRpcArgs({ ...fields, proposalId: editingProposalId })
      : buildCreateTripProposalRpcArgs({ ...fields, familyId: familyId as string })
    if (built.ok === false) {
      setError(
        built.error === 'title' ? t('dashboard.titleRequired')
          : built.error === 'countries' ? t('dashboard.propose.countryRequired')
            : t('dashboard.propose.datesRequired'),
      )
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = isEditing && editingProposalId
        ? await updateTripProposal({ ...fields, proposalId: editingProposalId })
        : await createTripProposal({ ...fields, familyId: familyId as string })
      onSubmitted(result.tripId, isEditing)
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : t('dashboard.toast.proposeError')
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const chipCls = (on: boolean) =>
    `px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
      on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
    }`

  const nameForPerson = (id: string) => {
    if (id === personId) return t('dashboard.propose.you')
    return roster.find(p => p.personId === id)?.displayName ?? id
  }

  const travelerOptions = roster
    .filter(p => p.personId !== personId && !selectedTravelerIds.includes(p.personId))
    .map(p => ({ value: p.personId, label: p.displayName }))

  const footer = (
    <div className="flex items-center justify-between gap-3 w-full">
      <p className="text-xs text-slate-400">{t('dashboard.propose.stepOf', { current: stepIndex + 1, total: STEPS.length })}</p>
      <div className="flex gap-3">
        {stepIndex === 0 ? (
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50">
            {t('common.cancel')}
          </button>
        ) : (
          <button type="button" onClick={goBack} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50">
            {t('common.back')}
          </button>
        )}
        {step === 'review' ? (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || loadingSource || !personId || (!isEditing && !familyId)}
            className="px-4 py-2 text-sm bg-slate-900 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded-lg flex items-center gap-2"
          >
            {submitting
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('common.saving')}</>
              : isEditing ? t('common.update') : t('dashboard.propose.submit')}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue || loadingSource}
            className="px-4 py-2 text-sm bg-slate-900 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded-lg"
          >
            {t('dashboard.propose.continue')}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t(step === 'basics' && isEditing ? 'dashboard.editTrip' : STEP_KEYS[step])}
      size="lg"
      footer={footer}
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
        )}

        {loadingSource && <p className="text-xs text-slate-400">{t('common.loading')}</p>}

        {step === 'basics' && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('dashboard.coverImage')}</label>
              {coverUrl ? (
                <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', height: 130 }}>
                  <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    type="button"
                    onClick={() => setCoverUrl(null)}
                    className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/55 text-white"
                    aria-label={t('common.clear')}
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => toast.error(t('dashboard.propose.coverFileToast'))}
                  className="w-full py-[18px] border-2 border-dashed border-slate-200 rounded-[10px] text-sm text-slate-400 flex items-center justify-center gap-1.5 hover:border-slate-300"
                >
                  <Camera size={15} /> {t('dashboard.addCoverImage')}
                </button>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={coverSearchQuery}
                  onChange={e => setCoverSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleCoverSearch() } }}
                  placeholder={t('dashboard.unsplashSearchPlaceholder')}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => void handleCoverSearch()}
                  disabled={searchingCover || (!coverSearchQuery.trim() && !title.trim())}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
                >
                  {searchingCover ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" /> : <Search size={14} />}
                  {t('dashboard.searchUnsplash')}
                </button>
              </div>
              {coverSearchError && <p className="text-xs text-red-500 mt-1.5">{coverSearchError}</p>}
              {coverSearchResults.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {coverSearchResults.map(photo => (
                    <button
                      type="button"
                      key={photo.id}
                      onClick={() => setCoverUrl(photo.url)}
                      aria-label={t('dashboard.useUnsplashPhoto', { photographer: photo.photographer || 'Unsplash' })}
                      className={`relative h-20 overflow-hidden rounded-lg border ${coverUrl === photo.url ? 'border-slate-900 ring-2 ring-slate-900/20' : 'border-slate-200 hover:border-slate-400'}`}
                    >
                      <img src={photo.thumb} alt={photo.description || ''} loading="lazy" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('dashboard.tripTitle')} <span className="text-red-500">*</span>
              </label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('dashboard.tripTitlePlaceholder')} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('dashboard.tripDescription')}</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('dashboard.tripDescriptionPlaceholder')} rows={3} className={`${inputCls} resize-none`} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <Calendar className="inline w-4 h-4 mr-1" />{t('dashboard.startDate')}
                </label>
                <CustomDatePicker value={startDate} onChange={updateStart} placeholder={t('dashboard.startDate')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <Calendar className="inline w-4 h-4 mr-1" />{t('dashboard.endDate')}
                </label>
                <CustomDatePicker value={endDate} onChange={setEndDate} placeholder={t('dashboard.endDate')} />
              </div>
            </div>
            {!startDate && !endDate && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('dashboard.dayCount')}</label>
                <NumericInput
                  min={1}
                  max={365}
                  value={dayCount}
                  onValueChange={raw => {
                    if (raw === '') { setDayCount(''); return }
                    const n = Math.floor(Number(raw))
                    if (Number.isFinite(n)) setDayCount(Math.min(365, Math.max(1, n)))
                  }}
                  className={inputCls}
                />
                <p className="text-xs text-slate-400 mt-1.5">{t('dashboard.dayCountHint')}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('dashboard.propose.occasion')}</label>
              <div className="flex flex-wrap gap-2">
                {TRIP_OCCASIONS.map(value => (
                  <button key={value} type="button" onClick={() => setOccasion(value)} className={chipCls(occasion === value)}>
                    {t(OCCASION_KEYS[value])}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <Bell className="inline w-4 h-4 mr-1" />{t('trips.reminder')}
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 0, label: t('trips.reminderNone') },
                  { value: 1, label: `1 ${t('trips.reminderDay')}` },
                  { value: 3, label: `3 ${t('trips.reminderDays')}` },
                  { value: 9, label: `9 ${t('trips.reminderDays')}` },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setReminderDays(opt.value); setCustomReminder(false) }}
                    className={chipCls(!customReminder && reminderDays === opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setCustomReminder(true); if ([0, 1, 3, 9].includes(reminderDays)) setReminderDays(7) }}
                  className={chipCls(customReminder)}
                >
                  {t('trips.reminderCustom')}
                </button>
              </div>
              {customReminder && (
                <div className="flex items-center gap-2 mt-2">
                  <NumericInput
                    min={1}
                    max={30}
                    value={reminderDays}
                    onValueChange={raw => setReminderDays(Math.max(1, Math.min(30, Number(raw) || 1)))}
                    className="w-20 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                  <span className="text-xs text-slate-500">{t('trips.reminderDaysBefore')}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <UserPlus className="inline w-4 h-4 mr-1" />{t('dashboard.propose.travelers')}
              </label>
              {presets.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {presets.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSelectedTravelerIds(prev => {
                          const next = new Set(prev)
                          for (const id of preset.personIds) next.add(id)
                          if (personId) next.add(personId)
                          return [...next]
                        })
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              )}
              {selectedTravelerIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedTravelerIds.map(id => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-secondary text-content border border-edge"
                    >
                      {nameForPerson(id)}
                      {id !== personId && (
                        <button type="button" onClick={() => setSelectedTravelerIds(prev => prev.filter(x => x !== id))} aria-label={t('common.clear')}>
                          <X size={11} className="text-content-faint" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {travelerOptions.length > 0 && (
                <CustomSelect
                  value={travelerSelect}
                  onChange={value => {
                    if (!value) return
                    const id = String(value)
                    setSelectedTravelerIds(prev => prev.includes(id) ? prev : [...prev, id])
                    setTravelerSelect('')
                  }}
                  placeholder={t('dashboard.propose.addTraveler')}
                  options={travelerOptions}
                  searchable
                  size="sm"
                />
              )}
            </div>
          </>
        )}

        {step === 'countries' && (
          <>
            <input
              type="text"
              value={countryQuery}
              onChange={e => setCountryQuery(e.target.value)}
              placeholder={t('dashboard.propose.searchCountries')}
              className={inputCls}
            />
            {loadingCatalog && <p className="text-xs text-slate-400">{t('common.loading')}</p>}
            <ul className="space-y-1 max-h-72 overflow-y-auto">
              {mergeHits(
                selectedCountryIds
                  .filter(id => !countries.some(c => c.id === id))
                  .map(id => ({ id, name: selectedCountryNames[id] ?? id, iso2: null })),
                countries,
              ).map(hit => {
                const on = selectedCountryIds.includes(hit.id)
                const primary = primaryCountryId === hit.id
                return (
                  <li key={hit.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCountry(hit)}
                      className={`flex-1 text-left px-3 py-2 rounded-lg border text-sm ${on ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}
                    >
                      {hit.name}{hit.iso2 ? ` (${hit.iso2})` : ''}
                    </button>
                    {on && (
                      <button
                        type="button"
                        onClick={() => setPrimaryCountryId(hit.id)}
                        className={chipCls(primary)}
                      >
                        {primary ? t('dashboard.propose.primary') : t('dashboard.propose.makePrimary')}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {step === 'cities' && (
          <>
            <input
              type="text"
              value={placeQuery}
              onChange={e => setPlaceQuery(e.target.value)}
              placeholder={t('dashboard.propose.searchCities')}
              className={inputCls}
            />
            {loadingCatalog && <p className="text-xs text-slate-400">{t('common.loading')}</p>}
            <ul className="space-y-1 max-h-72 overflow-y-auto">
              {mergeHits(
                selectedPlaceIds
                  .filter(id => !places.some(p => p.id === id))
                  .map(id => ({ id, name: selectedPlaceNames[id] ?? id, countryId: null })),
                places,
              ).map(hit => {
                const on = selectedPlaceIds.includes(hit.id)
                return (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => togglePlace(hit)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${on ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}
                    >
                      {hit.name}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {step === 'notes' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('dashboard.propose.step.notes')}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('dashboard.propose.notesHint')} rows={6} className={`${inputCls} resize-none`} />
          </div>
        )}

        {step === 'review' && (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-400">{t('dashboard.tripTitle')}</dt>
              <dd className="font-medium text-slate-900">{title.trim() || t('dashboard.propose.none')}</dd>
            </div>
            <div>
              <dt className="text-slate-400">{t('dashboard.propose.occasion')}</dt>
              <dd>{t(OCCASION_KEYS[occasion])}</dd>
            </div>
            <div>
              <dt className="text-slate-400">{t('dashboard.hero.tripDates')}</dt>
              <dd>{dates ? `${dates.startAt.slice(0, 10)} – ${dates.endAt.slice(0, 10)}` : t('dashboard.propose.none')}</dd>
            </div>
            <div>
              <dt className="text-slate-400">{t('dashboard.propose.step.countries')}</dt>
              <dd>{selectedCountryIds.map(id => selectedCountryNames[id] ?? id).join(', ') || t('dashboard.propose.none')}</dd>
            </div>
            <div>
              <dt className="text-slate-400">{t('dashboard.propose.step.cities')}</dt>
              <dd>{selectedPlaceIds.map(id => selectedPlaceNames[id] ?? id).join(', ') || t('dashboard.propose.none')}</dd>
            </div>
            <div>
              <dt className="text-slate-400">{t('dashboard.propose.travelers')}</dt>
              <dd>{selectedTravelerIds.map(nameForPerson).join(', ') || t('dashboard.propose.none')}</dd>
            </div>
            <div>
              <dt className="text-slate-400">{t('dashboard.propose.reviewCover')}</dt>
              <dd>{coverUrl ? <img src={coverUrl} alt="" className="mt-1 h-20 w-full object-cover rounded-lg" /> : t('dashboard.propose.none')}</dd>
            </div>
            <div>
              <dt className="text-slate-400">{t('dashboard.propose.step.notes')}</dt>
              <dd className="whitespace-pre-wrap">{notes.trim() || t('dashboard.propose.none')}</dd>
            </div>
          </dl>
        )}

        {(step === 'countries' || step === 'notes' || step === 'review') && (
          <FamilyProposalHintChips
            hints={savedHints}
            selectedPlaceIds={selectedPlaceIds}
            onPlaceTap={toggleHintPlace}
          />
        )}
      </div>
    </Modal>
  )
}
