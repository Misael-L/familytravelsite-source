import { Calendar, Check, ChevronRight, MapPin, Plus, Search, Sparkles, X } from 'lucide-react';
import { JourneyGlassBar, JourneySafeArea, JourneySheet } from '../components/Journey/JourneyMobileChrome';
import PageShell from '../components/Layout/PageShell';
import { PageLoadFailed } from '../components/shared/PageLoadFailed';
import { PageLoadingSurface } from '../components/shared/PageLoadingSurface';
import { TransHtml, useTranslation } from '../i18n';
import { computeJourneyLifecycle } from '../utils/journeyLifecycle';
import { localIsoDate } from '../utils/localIsoDate';
import './journey/journeyFrontpage.css';
import { journeyStatDisplay, type JourneyListItem } from './journey/journeyFrontpageModel';
import { useJourney } from './journey/useJourney';
import { journeyCoverSrc } from './journeyDetail/JourneyDetailPage.helpers';

const GRADIENTS = [
  'linear-gradient(135deg, #0F172A 0%, #6366F1 45%, #EC4899 100%)',
  'linear-gradient(135deg, #1E293B 0%, #7C3AED 50%, #F59E0B 100%)',
  'linear-gradient(135deg, #134E5E 0%, #71B280 100%)',
  'linear-gradient(135deg, #2D1B69 0%, #11998E 100%)',
  'linear-gradient(135deg, #4B134F 0%, #C94B4B 100%)',
  'linear-gradient(135deg, #373B44 0%, #4286F4 100%)',
];

function pickGradient(id: string | number): string {
  if (typeof id === 'number' && Number.isFinite(id)) return GRADIENTS[Math.abs(Math.trunc(id)) % GRADIENTS.length];
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

export default function JourneyPage() {
  const { t } = useTranslation();
  const {
    navigate,
    journeys,
    loading,
    loadError,
    loadJourneys,
    showCreate,
    setShowCreate,
    newTitle,
    setNewTitle,
    availableTrips,
    selectedTripIds,
    setSelectedTripIds,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchInputRef,
    activeSuggestion,
    setDismissedSuggestions,
    suggestionError,
    availableTripsError,
    retrySuggestions,
    activeJourney,
    activeJourneyIsLive,
    filteredJourneys,
    openCreateModal,
    handleCreate,
    totalPlaces,
  } = useJourney();

  return (
    <PageShell className="bg-surface" navOffset="var(--nav-h, 0px)">
      <JourneySafeArea className="journey-front mx-auto max-w-[1800px]">
        <div className="px-5 pb-4 pt-5 md:hidden">
          <JourneyGlassBar>
            <button
              type="button"
              aria-label={searchOpen ? t('common.close') : t('common.search')}
              onClick={() => {
                if (searchOpen) {
                  setSearchOpen(false);
                  setSearchQuery('');
                } else {
                  setSearchOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-edge bg-surface-card text-content-muted"
            >
              {searchOpen ? <X size={15} /> : <Search size={15} />}
            </button>
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-body font-semibold text-accent-text"
            >
              <Plus size={16} strokeWidth={2.5} />
              {t('journey.frontpage.createJourney')}
            </button>
          </JourneyGlassBar>
          {searchOpen && (
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchQuery('');
                  setSearchOpen(false);
                }
              }}
              placeholder={t('journey.search.placeholder')}
              className="mt-2 w-full rounded-xl border border-edge bg-surface-input px-3.5 py-2.5 text-body text-content"
            />
          )}
        </div>

        <div className="px-4 pb-16 pt-6 md:px-8 md:pt-10">
          {suggestionError && !activeSuggestion && (
            <div
              role="alert"
              className="border-danger/30 mb-6 flex flex-col gap-3 rounded-xl border bg-danger-soft px-4 py-3 text-body text-danger sm:flex-row sm:items-center sm:justify-between"
            >
              <span>{t('journey.suggestionsLoadError')}</span>
              <button
                type="button"
                onClick={() => retrySuggestions()}
                className="self-start rounded-lg bg-accent px-3 py-1.5 text-caption font-medium text-accent-text"
              >
                {t('common.errorRetry')}
              </button>
            </div>
          )}

          {activeSuggestion && (
            <div className="journey-suggest relative mb-8 overflow-hidden rounded-2xl">
              <div className="journey-suggest-glow pointer-events-none absolute inset-0 hidden md:block" />
              <div className="relative flex flex-col justify-between gap-4 p-5 text-inverse-text md:flex-row md:items-center md:gap-6">
                <div className="flex items-center gap-3.5">
                  <div className="bg-inverse/15 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] backdrop-blur">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <div className="text-caption font-semibold uppercase tracking-[0.12em] opacity-70">
                      {t('journey.frontpage.suggestionLabel')}
                    </div>
                    <div className="mt-0.5 text-body">
                      <TransHtml html="journey.frontpage.suggestionText" params={{ title: activeSuggestion.title }} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDismissedSuggestions((prev) => new Set([...prev, activeSuggestion.id]))}
                    className="border-inverse-text/20 rounded-lg border px-3 py-1.5 text-caption font-medium text-inverse-text"
                  >
                    {t('journey.frontpage.dismiss')}
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreateModal(activeSuggestion.id)}
                    className="rounded-lg bg-inverse-text px-3 py-1.5 text-caption font-medium text-inverse"
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
                className={`journey-hero relative block w-full cursor-pointer overflow-hidden text-left transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1${activeJourney.cover_image ? 'has-cover' : ''}`}
                style={
                  activeJourney.cover_image
                    ? {
                        ['--journey-hero-cover' as string]: `url("${journeyCoverSrc(activeJourney.cover_image).replace(/"/g, '%22')}")`,
                      }
                    : { background: pickGradient(activeJourney.id) }
                }
              >
                <div className="journey-hero-glass pointer-events-none absolute inset-0" />
                <div className="journey-hero-inner absolute inset-0 flex flex-col text-inverse-text">
                  <div className="mt-auto">
                    <div className="mb-2.5">
                      <span className="text-caption font-semibold uppercase tracking-[0.2em] opacity-80">
                        {activeJourneyIsLive
                          ? t('journey.frontpage.activeJourney')
                          : t('journey.frontpage.latestJourney')}
                      </span>
                    </div>
                    <h2 className="journey-hero-title">{activeJourney.title}</h2>
                    {activeJourney.subtitle && <div className="journey-hero-subtitle">{activeJourney.subtitle}</div>}
                    <div className="mt-[22px] flex items-center gap-5">
                      <div className="journey-hero-stats">
                        {[
                          { val: journeyStatDisplay(activeJourney.entry_count), label: t('journey.stats.entries') },
                          { val: journeyStatDisplay(activeJourney.photo_count), label: t('journey.stats.photos') },
                          { val: journeyStatDisplay(activeJourney.place_count), label: t('journey.stats.places') },
                        ].map((s) => (
                          <div key={s.label} className="flex flex-col gap-1">
                            <span className="journey-hero-stat-val">{s.val}</span>
                            <span className="journey-hero-stat-label font-semibold uppercase">{s.label}</span>
                          </div>
                        ))}
                      </div>
                      <span className="journey-hero-continue">
                        {t('journey.frontpage.continueWriting')}
                        <ChevronRight size={16} strokeWidth={2.4} />
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
              <span className="text-caption font-bold uppercase tracking-[0.14em] text-content-muted">
                {t('journey.frontpage.allJourneys')}
              </span>
              <span className="text-caption text-content-faint">
                {journeys.length} {t('journey.frontpage.journeys')}
              </span>
            </div>
          )}

          {loading && journeys.length === 0 ? (
            <PageLoadingSurface fullscreen={false} />
          ) : loadError && journeys.length === 0 ? (
            <PageLoadFailed
              title={t('journey.loadError')}
              body={t('common.errorBody')}
              onRetry={() => {
                void loadJourneys();
              }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-[18px] lg:grid-cols-3 xl:grid-cols-4">
              {filteredJourneys.map((j) => (
                <JourneyCard key={j.id} journey={j} onClick={() => navigate(`/journey/${j.id}`)} />
              ))}
              <button
                type="button"
                onClick={() => openCreateModal()}
                className="journey-create-card group flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[24px] transition-transform duration-200 hover:-translate-y-1"
              >
                <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-accent-text transition-transform duration-300 group-hover:rotate-90">
                  <Plus size={22} strokeWidth={2.4} />
                </span>
                <div className="text-center">
                  <div className="text-body font-semibold text-content">{t('journey.frontpage.createNew')}</div>
                  <div className="mt-[3px] max-w-[200px] text-caption leading-snug text-content-muted">
                    {t('journey.frontpage.createNewSub')}
                  </div>
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
        footer={
          <div className="flex items-center justify-between border-t border-edge bg-surface-secondary px-7 py-4">
            <div className="text-caption text-content-muted">
              <strong className="text-content">{selectedTripIds.size}</strong>{' '}
              <span className="hidden md:inline">{t('journey.frontpage.tripsSelected')}</span>
              <span className="md:hidden">{t('journey.frontpage.trips')}</span>
              {selectedTripIds.size > 0 && (
                <>
                  {' · '}
                  <strong className="text-content">{totalPlaces}</strong>{' '}
                  <span className="hidden md:inline">{t('journey.frontpage.placesImported')}</span>
                  <span className="md:hidden">{t('journey.frontpage.places')}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-edge px-3.5 py-2 text-body font-medium text-content"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newTitle.trim()}
                className="rounded-lg bg-accent px-3.5 py-2 text-body font-medium text-accent-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="md:hidden">{t('journey.create')}</span>
                <span className="hidden md:inline">{t('journey.frontpage.createJourney')}</span>
              </button>
            </div>
          </div>
        }
      >
        <p className="mb-5 text-body text-content-muted">{t('journey.frontpage.createNewSub')}</p>
        <label className="mb-2.5 block text-caption font-semibold uppercase tracking-[0.12em] text-content-muted">
          {t('journey.frontpage.journeyName')}
        </label>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={t('journey.frontpage.namePlaceholder')}
          className="mb-5 w-full rounded-lg border border-edge bg-surface-input px-3.5 py-2.5 text-body text-content"
        />
        <label className="mb-2.5 block text-caption font-semibold uppercase tracking-[0.12em] text-content-muted">
          {t('journey.frontpage.selectTrips')}
        </label>
        {availableTripsError ? (
          <p role="alert" className="mb-4 text-body text-danger">
            {t('journey.availableTripsLoadError')}
          </p>
        ) : (
          <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
            {availableTrips.map((trip) => {
              const selected = selectedTripIds.has(trip.id);
              const today = localIsoDate();
              const status =
                trip.end_date && trip.end_date < today
                  ? 'completed'
                  : trip.start_date && trip.start_date <= today
                    ? 'active'
                    : 'upcoming';
              const toggleTrip = () => {
                setSelectedTripIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(trip.id)) next.delete(trip.id);
                  else next.add(trip.id);
                  return next;
                });
              };
              return (
                <div
                  key={trip.id}
                  role="checkbox"
                  aria-checked={selected}
                  tabIndex={0}
                  onClick={toggleTrip}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleTrip();
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                    selected ? 'border-accent bg-accent-subtle' : 'border-edge hover:border-edge-secondary'
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 ${
                      selected ? 'border-accent bg-accent' : 'border-edge'
                    }`}
                  >
                    {selected && <Check size={12} className="text-accent-text" />}
                  </div>
                  <div
                    className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg"
                    style={{ background: pickGradient(trip.id) }}
                  >
                    {trip.cover_image && <img src={trip.cover_image} className="h-full w-full object-cover" alt="" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-body font-semibold text-content">{trip.title}</div>
                    <div className="mt-0.5 flex items-center gap-2.5 text-caption text-content-muted">
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />{' '}
                        {trip.start_date
                          ? Math.ceil(
                              (new Date(trip.end_date || trip.start_date).getTime() -
                                new Date(trip.start_date).getTime()) /
                                86400000
                            ) + 1
                          : '?'}
                        <span className="hidden md:inline"> {t('journey.stats.days').toLowerCase()}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin size={11} /> {trip.place_count || 0}
                        <span className="hidden md:inline"> {t('journey.frontpage.places')}</span>
                      </span>
                    </div>
                  </div>
                  <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-caption font-medium uppercase tracking-[0.05em] text-content-secondary">
                    {t(`journey.status.${status}`)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </JourneySheet>
    </PageShell>
  );
}

function JourneyCard({ journey, onClick }: { journey: JourneyListItem; onClick: () => void }) {
  const { t } = useTranslation();
  const j = journey;
  const lifecycle = computeJourneyLifecycle(j.status, j.trip_date_min, j.trip_date_max);

  return (
    <button
      type="button"
      onClick={onClick}
      className="journey-card flex w-full cursor-pointer flex-col overflow-hidden rounded-[24px] text-left transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1"
    >
      <div className="relative h-[200px] overflow-hidden" style={{ background: pickGradient(j.id) }}>
        {j.cover_image && (
          <img src={journeyCoverSrc(j.cover_image)} className="absolute inset-0 h-full w-full object-cover" alt="" />
        )}
        <div className="journey-card-scrim absolute inset-0" />
        <span className="journey-year-pill absolute left-3.5 top-3.5 z-[2] inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold text-inverse-text">
          <Calendar size={12} strokeWidth={2.2} />
          {new Date(j.created_at).getFullYear()}
        </span>
        {lifecycle !== 'live' && (
          <span className="bg-inverse/40 absolute right-3.5 top-3.5 z-[2] rounded-full px-2 py-0.5 text-caption font-semibold uppercase tracking-wide text-inverse-text">
            {t(`journey.status.${lifecycle}`)}
          </span>
        )}
        <div className="absolute bottom-[15px] left-[18px] right-[18px] z-[2] text-inverse-text">
          <div className="journey-card-title">{j.title}</div>
          {j.subtitle && <div className="journey-card-subtitle">{j.subtitle}</div>}
        </div>
      </div>
      <div className="px-[18px] pb-[13px] pt-[11px]">
        <div className="flex gap-[26px]">
          {[
            { val: j.entry_count ?? 0, label: t('journey.stats.entries') },
            { val: j.photo_count ?? 0, label: t('journey.stats.photos') },
            { val: j.place_count ?? 0, label: t('journey.stats.places') },
          ].map((s) => (
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
  );
}
