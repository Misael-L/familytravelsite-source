import PageShell from '../components/Layout/PageShell'
import { useTranslation, TransHtml } from '../i18n'
import {
  Plus, Search, Sparkles, Calendar, MapPin,
  Check, X, ChevronRight,
} from 'lucide-react'
import { computeJourneyLifecycle } from '../utils/journeyLifecycle'
import { localIsoDate } from '../utils/localIsoDate'
import { useJourney } from './journey/useJourney'
import { journeyCoverSrc } from './journeyDetail/JourneyDetailPage.helpers'
import { PageLoadingSurface } from '../components/shared/PageLoadingSurface'
import { PageLoadFailed } from '../components/shared/PageLoadFailed'
import { JourneyGlassBar, JourneySafeArea, JourneySheet } from '../components/Journey/JourneyMobileChrome'
import { journeyStatDisplay, type JourneyListItem } from './journey/journeyFrontpageModel'
import './journey/journeyFrontpage.css'

const GRADIENTS = [
  'linear-gradient(135deg, #0F172A 0%, #6366F1 45%, #EC4899 100%)',
  'linear-gradient(135deg, #1E293B 0%, #7C3AED 50%, #F59E0B 100%)',
  'linear-gradient(135deg, #134E5E 0%, #71B280 100%)',
  'linear-gradient(135deg, #2D1B69 0%, #11998E 100%)',
  'linear-gradient(135deg, #4B134F 0%, #C94B4B 100%)',
  'linear-gradient(135deg, #373B44 0%, #4286F4 100%)',
]

function pickGradient(id: string | number): string {
  if (typeof id === 'number' && Number.isFinite(id)) return GRADIENTS[Math.abs(Math.trunc(id)) % GRADIENTS.length]
  let h = 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return GRADIENTS[Math.abs(h) % GRADIENTS.length]
}

export default function JourneyPage() {
  const { t } = useTranslation()
  const {
    navigate, journeys, loading, loadError, loadJourneys,
    showCreate, setShowCreate, newTitle, setNewTitle,
    availableTrips, selectedTripIds, setSelectedTripIds,
    searchOpen, setSearchOpen, searchQuery, setSearchQuery, searchInputRef,
    activeSuggestion, setDismissedSuggestions,
    suggestionError, availableTripsError, retrySuggestions,
    activeJourney, activeJourneyIsLive, filteredJourneys,
    openCreateModal, handleCreate, totalPlaces,
  } = useJourney()

  return (
    <PageShell className="bg-surface" navOffset="var(--nav-h, 0px)">
      <JourneySafeArea className="journey-front max-w-[1800px] mx-auto">
        <div className="px-5 pt-5 pb-4 md:hidden">
          <JourneyGlassBar>
            <button
              type="button"
              aria-label={searchOpen ? t('common.close') : t('common.search')}
              onClick={() => {
                if (searchOpen) {
                  setSearchOpen(false)
                  setSearchQuery('')
                } else {
                  setSearchOpen(true)
                  setTimeout(() => searchInputRef.current?.focus(), 50)
                }
              }}
              className="w-10 h-10 rounded-xl border border-edge bg-surface-card flex items-center justify-center text-content-muted"
            >
              {searchOpen ? <X size={15} /> : <Search size={15} />}
            </button>
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-accent-text text-body font-semibold"
            >
              <Plus size={16} strokeWidth={2.5} />
              {t('journey.frontpage.createJourney')}
            </button>
          </JourneyGlassBar>
          {searchOpen && (
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false) } }}
              placeholder={t('journey.search.placeholder')}
              className="mt-2 w-full px-3.5 py-2.5 border border-edge rounded-xl text-body bg-surface-input text-content"
            />
          )}
        </div>

        <div className="px-4 md:px-8 pt-6 md:pt-10 pb-16">
          {suggestionError && !activeSuggestion && (
            <div role="alert" className="mb-6 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-body text-danger flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span>{t('journey.suggestionsLoadError')}</span>
              <button
                type="button"
                onClick={() => retrySuggestions()}
                className="self-start px-3 py-1.5 rounded-lg bg-accent text-accent-text text-caption font-medium"
              >
                {t('common.errorRetry')}
              </button>
            </div>
          )}

          {activeSuggestion && (
            <div className="journey-suggest relative rounded-2xl overflow-hidden mb-8">
              <div className="journey-suggest-glow absolute inset-0 pointer-events-none hidden md:block" />
              <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 p-5 text-inverse-text">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-[10px] bg-inverse/15 backdrop-blur flex items-center justify-center flex-shrink-0">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <div className="text-caption font-semibold tracking-[0.12em] uppercase opacity-70">{t('journey.frontpage.suggestionLabel')}</div>
                    <div className="text-body mt-0.5">
                      <TransHtml html="journey.frontpage.suggestionText" params={{ title: activeSuggestion.title }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setDismissedSuggestions(prev => new Set([...prev, activeSuggestion.id]))}
                    className="px-3 py-1.5 rounded-lg border border-inverse-text/20 text-caption font-medium text-inverse-text"
                  >
                    {t('journey.frontpage.dismiss')}
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreateModal(activeSuggestion.id)}
                    className="px-3 py-1.5 rounded-lg bg-inverse-text text-inverse text-caption font-medium"
                  >
                    {t('journey.frontpage.createJourney')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeJourney && (
            <div className="mb-10">
              <button
                type="button"
                onClick={() => navigate(`/journey/${activeJourney.id}`)}
                className={`journey-hero block w-full text-left relative overflow-hidden cursor-pointer transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1${activeJourney.cover_image ? ' has-cover' : ''}`}
                style={
                  activeJourney.cover_image
                    ? { ['--journey-hero-cover' as string]: `url("${journeyCoverSrc(activeJourney.cover_image).replace(/"/g, '%22')}")` }
                    : { background: pickGradient(activeJourney.id) }
                }
              >
                <div className="journey-hero-glass absolute inset-0 pointer-events-none" />
                <div className="journey-hero-inner absolute inset-0 flex flex-col text-inverse-text">
                  <div className="mt-auto">
                    <div className="mb-2.5">
                      <span className="text-caption font-semibold uppercase tracking-[0.2em] opacity-80">
                        {activeJourneyIsLive ? t('journey.frontpage.activeJourney') : t('journey.frontpage.latestJourney')}
                      </span>
                    </div>
                    <h2 className="journey-hero-title">
                      {activeJourney.title}
                    </h2>
                    {activeJourney.subtitle && (
                      <div className="journey-hero-subtitle">{activeJourney.subtitle}</div>
                    )}
                    <div className="flex items-center gap-5 mt-[22px]">
                      <div className="journey-hero-stats">
                        {[
                          { val: journeyStatDisplay(activeJourney.entry_count), label: t('journey.stats.entries') },
                          { val: journeyStatDisplay(activeJourney.photo_count), label: t('journey.stats.photos') },
                          { val: journeyStatDisplay(activeJourney.place_count), label: t('journey.stats.places') },
                        ].map(s => (
                          <div key={s.label} className="flex flex-col gap-1">
                            <span className="journey-hero-stat-val">{s.val}</span>
                            <span className="journey-hero-stat-label uppercase font-semibold">{s.label}</span>
                          </div>
                        ))}
                      </div>
                      <span className="journey-hero-continue">
                        {t('journey.frontpage.continueWriting')}<ChevronRight size={16} strokeWidth={2.4} />
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          )}

          {searchQuery.trim() && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-body text-content-muted">
                {filteredJourneys.length === 0
                  ? t('journey.search.noResults', { query: searchQuery.trim() })
                  : `${filteredJourneys.length} ${t('journey.frontpage.journeys')}`}
              </span>
            </div>
          )}

          {!searchQuery.trim() && (
            <div className="mb-4 flex items-center justify-between">
              <span className="text-caption font-bold tracking-[0.14em] uppercase text-content-muted">{t('journey.frontpage.allJourneys')}</span>
              <span className="text-caption text-content-faint">{journeys.length} {t('journey.frontpage.journeys')}</span>
            </div>
          )}

          {loading && journeys.length === 0 ? (
            <PageLoadingSurface fullscreen={false} />
          ) : loadError && journeys.length === 0 ? (
            <PageLoadFailed
              title={t('journey.loadError')}
              body={t('common.errorBody')}
              onRetry={() => { void loadJourneys() }}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-[18px]">
              {filteredJourneys.map(j => (
                <JourneyCard key={j.id} journey={j} onClick={() => navigate(`/journey/${j.id}`)} />
              ))}
              <button
                type="button"
                onClick={() => openCreateModal()}
                className="journey-create-card group min-h-[200px] rounded-[24px] flex flex-col items-center justify-center gap-3 transition-transform duration-200 cursor-pointer hover:-translate-y-1"
              >
                <span className="w-[52px] h-[52px] rounded-full flex items-center justify-center bg-accent text-accent-text transition-transform duration-300 group-hover:rotate-90">
                  <Plus size={22} strokeWidth={2.4} />
                </span>
                <div className="text-center">
                  <div className="text-body font-semibold text-content">{t('journey.frontpage.createNew')}</div>
                  <div className="text-caption mt-[3px] max-w-[200px] leading-snug text-content-muted">{t('journey.frontpage.createNewSub')}</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </JourneySafeArea>

      <JourneySheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('journey.frontpage.createJourney')}
        footer={(
          <div className="px-7 py-4 border-t border-edge bg-surface-secondary flex items-center justify-between">
            <div className="text-caption text-content-muted">
              <strong className="text-content">{selectedTripIds.size}</strong> <span className="hidden md:inline">{t('journey.frontpage.tripsSelected')}</span><span className="md:hidden">{t('journey.frontpage.trips')}</span>
              {selectedTripIds.size > 0 && <> · <strong className="text-content">{totalPlaces}</strong> <span className="hidden md:inline">{t('journey.frontpage.placesImported')}</span><span className="md:hidden">{t('journey.frontpage.places')}</span></>}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-3.5 py-2 rounded-lg border border-edge text-body font-medium text-content"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newTitle.trim()}
                className="px-3.5 py-2 rounded-lg bg-accent text-accent-text text-body font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="md:hidden">{t('journey.create')}</span><span className="hidden md:inline">{t('journey.frontpage.createJourney')}</span>
              </button>
            </div>
          </div>
        )}
      >
        <p className="text-body text-content-muted mb-5">{t('journey.frontpage.createNewSub')}</p>
        <label className="text-caption font-semibold tracking-[0.12em] uppercase text-content-muted block mb-2.5">{t('journey.frontpage.journeyName')}</label>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder={t('journey.frontpage.namePlaceholder')}
          className="w-full px-3.5 py-2.5 border border-edge rounded-lg text-body bg-surface-input text-content mb-5"
        />
        <label className="text-caption font-semibold tracking-[0.12em] uppercase text-content-muted block mb-2.5">{t('journey.frontpage.selectTrips')}</label>
        {availableTripsError ? (
          <p role="alert" className="text-body text-danger mb-4">{t('journey.availableTripsLoadError')}</p>
        ) : (
        <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto">
          {availableTrips.map(trip => {
            const selected = selectedTripIds.has(trip.id)
            const today = localIsoDate()
            const status = trip.end_date && trip.end_date < today
              ? 'completed'
              : trip.start_date && trip.start_date <= today
                ? 'active'
                : 'upcoming'
            const toggleTrip = () => {
              setSelectedTripIds(prev => {
                const next = new Set(prev)
                if (next.has(trip.id)) next.delete(trip.id)
                else next.add(trip.id)
                return next
              })
            }
            return (
              <div
                key={trip.id}
                role="checkbox"
                aria-checked={selected}
                tabIndex={0}
                onClick={toggleTrip}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTrip() }
                }}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${
                  selected ? 'border-accent bg-accent-subtle' : 'border-edge hover:border-edge-secondary'
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                  selected ? 'bg-accent border-accent' : 'border-edge'
                }`}>
                  {selected && <Check size={12} className="text-accent-text" />}
                </div>
                <div className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden" style={{ background: pickGradient(trip.id) }}>
                  {trip.cover_image && (
                    <img src={trip.cover_image} className="w-full h-full object-cover" alt="" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-body font-semibold text-content">{trip.title}</div>
                  <div className="text-caption text-content-muted flex items-center gap-2.5 mt-0.5">
                    <span className="flex items-center gap-1"><Calendar size={11} /> {trip.start_date ? Math.ceil((new Date(trip.end_date || trip.start_date).getTime() - new Date(trip.start_date).getTime()) / 86400000) + 1 : '?'}<span className="hidden md:inline"> {t('journey.stats.days').toLowerCase()}</span></span>
                    <span className="flex items-center gap-1"><MapPin size={11} /> {trip.place_count || 0}<span className="hidden md:inline"> {t('journey.frontpage.places')}</span></span>
                  </div>
                </div>
                <span className="text-caption font-medium uppercase tracking-[0.05em] px-2 py-0.5 rounded-full bg-surface-secondary text-content-secondary">
                  {t(`journey.status.${status}`)}
                </span>
              </div>
            )
          })}
        </div>
        )}
      </JourneySheet>
    </PageShell>
  )
}

function JourneyCard({ journey, onClick }: { journey: JourneyListItem; onClick: () => void }) {
  const { t } = useTranslation()
  const j = journey
  const lifecycle = computeJourneyLifecycle(j.status, j.trip_date_min, j.trip_date_max)

  return (
    <button
      type="button"
      onClick={onClick}
      className="journey-card w-full text-left rounded-[24px] overflow-hidden cursor-pointer transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 flex flex-col"
    >
      <div className="relative h-[200px] overflow-hidden" style={{ background: pickGradient(j.id) }}>
        {j.cover_image && (
          <img src={journeyCoverSrc(j.cover_image)} className="absolute inset-0 w-full h-full object-cover" alt="" />
        )}
        <div className="journey-card-scrim absolute inset-0" />
        <span className="journey-year-pill absolute top-3.5 left-3.5 z-[2] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-inverse-text text-caption font-semibold">
          <Calendar size={12} strokeWidth={2.2} />
          {new Date(j.created_at).getFullYear()}
        </span>
        {lifecycle !== 'live' && (
          <span className="absolute top-3.5 right-3.5 z-[2] px-2 py-0.5 rounded-full text-caption font-semibold uppercase tracking-wide text-inverse-text bg-inverse/40">
            {t(`journey.status.${lifecycle}`)}
          </span>
        )}
        <div className="absolute left-[18px] right-[18px] bottom-[15px] z-[2] text-inverse-text">
          <div className="journey-card-title">{j.title}</div>
          {j.subtitle && (
            <div className="journey-card-subtitle">{j.subtitle}</div>
          )}
        </div>
      </div>
      <div className="px-[18px] pt-[11px] pb-[13px]">
        <div className="flex gap-[26px]">
          {[
            { val: j.entry_count ?? 0, label: t('journey.stats.entries') },
            { val: j.photo_count ?? 0, label: t('journey.stats.photos') },
            { val: j.place_count ?? 0, label: t('journey.stats.places') },
          ].map(s => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <span className={`journey-card-stat-val ${s.val > 0 ? 'text-content' : 'text-content-faint'}`}>
                {s.val > 0 ? s.val : '--'}
              </span>
              <span className="journey-card-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </button>
  )
}
