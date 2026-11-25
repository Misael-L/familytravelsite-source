import { Bell, Calendar, Camera, Search, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CustomDatePicker } from '../../../../../components/shared/CustomDateTimePicker';
import { primaryCoreMode } from '../../../corePrimaryProfile';
import { createTripProposalWithReceipt, prepareTripProposal, TripProposalRejected } from '../../../tripProposalReceipt';
import { listCountriesByIds, searchCountries, type CatalogCountryHit } from '../../data/supabase/catalogCountries';
import { listPlacesByIds, searchCatalogPlaces, type CatalogPlaceHit } from '../../data/supabase/catalogPlaces';
import { listMyCatalogSavesInCountries, type CatalogSaveHint } from '../../data/supabase/catalogSaves';
import {
  listFamilyPeople,
  listTravelerPresets,
  type FamilyPerson,
  type TravelerPreset,
} from '../../data/supabase/familyRoster';
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
  type CreateTripProposalResult,
  type TripOccasion,
} from '../../data/supabase/tripProposals';
import { searchUnsplash, type UnsplashPhoto } from '../../data/supabase/unsplash';
import { useTranslation } from '../../i18n';
import CustomSelect from '../shared/CustomSelect';
import Modal from '../shared/Modal';
import { NumericInput } from '../shared/NumericInput';
import { useToast } from '../shared/Toast';
import FamilyProposalHintChips from './FamilyProposalHintChips';

type ProposeStep = 'basics' | 'countries' | 'cities' | 'notes' | 'review';
const STEPS: ProposeStep[] = ['basics', 'countries', 'cities', 'notes', 'review'];

const OCCASION_KEYS: Record<TripOccasion, string> = {
  trip: 'dashboard.propose.occasion.trip',
  vacation: 'dashboard.propose.occasion.vacation',
  weekend: 'dashboard.propose.occasion.weekend',
  other: 'dashboard.propose.occasion.other',
};

const STEP_KEYS: Record<ProposeStep, string> = {
  basics: 'dashboard.propose.step.basics',
  countries: 'dashboard.propose.step.countries',
  cities: 'dashboard.propose.step.cities',
  notes: 'dashboard.propose.step.notes',
  review: 'dashboard.propose.step.review',
};

type FamilyProposeTripModalProps = {
  isOpen: boolean;
  familyId: string | null;
  personId: string | null;
  editingProposalId?: string | null;
  editingTripId?: string | null;
  onClose: () => void;
  onSubmitted: (tripId: string, edited: boolean) => void;
};

type ProposalSubmission = {
  inFlight: boolean;
  pending?: ReturnType<typeof prepareTripProposal>;
};

function mergeHits<T extends { id: string }>(named: T[], existing: T[]): T[] {
  const seen = new Set(named.map((h) => h.id));
  return [...named, ...existing.filter((h) => !seen.has(h.id))];
}

const inputCls =
  'w-full px-3 py-2.5 border border-edge rounded-lg text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-body';

export default function FamilyProposeTripModal({
  isOpen,
  familyId,
  personId,
  editingProposalId = null,
  editingTripId = null,
  onClose,
  onSubmitted,
}: FamilyProposeTripModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const coverSearchSeq = useRef(0);
  const submission = useRef<ProposalSubmission>({ inFlight: false });

  const [step, setStep] = useState<ProposeStep>('basics');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dayCount, setDayCount] = useState<number | ''>(7);
  const [occasion, setOccasion] = useState<TripOccasion>('trip');
  const [reminderDays, setReminderDays] = useState(3);
  const [customReminder, setCustomReminder] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverSearchQuery, setCoverSearchQuery] = useState('');
  const [coverSearchResults, setCoverSearchResults] = useState<UnsplashPhoto[]>([]);
  const [coverSearchError, setCoverSearchError] = useState('');
  const [searchingCover, setSearchingCover] = useState(false);

  const [roster, setRoster] = useState<FamilyPerson[]>([]);
  const [presets, setPresets] = useState<TravelerPreset[]>([]);
  const [selectedTravelerIds, setSelectedTravelerIds] = useState<string[]>([]);
  const [travelerSelect, setTravelerSelect] = useState('');

  const [countryQuery, setCountryQuery] = useState('');
  const [countries, setCountries] = useState<CatalogCountryHit[]>([]);
  const [selectedCountryIds, setSelectedCountryIds] = useState<string[]>([]);
  const [primaryCountryId, setPrimaryCountryId] = useState<string | null>(null);
  const [selectedCountryNames, setSelectedCountryNames] = useState<Record<string, string>>({});

  const [placeQuery, setPlaceQuery] = useState('');
  const [places, setPlaces] = useState<CatalogPlaceHit[]>([]);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [selectedPlaceNames, setSelectedPlaceNames] = useState<Record<string, string>>({});
  const [savedHints, setSavedHints] = useState<CatalogSaveHint[]>([]);

  const [error, setError] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const isEditing = Boolean(editingProposalId && editingTripId);

  useEffect(() => {
    if (!isOpen) return;
    setStep('basics');
    setTitle('');
    setNotes('');
    setStartDate('');
    setEndDate('');
    setDayCount(7);
    setOccasion('trip');
    setReminderDays(3);
    setCustomReminder(false);
    setCoverUrl(null);
    setCoverSearchQuery('');
    setCoverSearchResults([]);
    setCoverSearchError('');
    setCountryQuery('');
    setCountries([]);
    setSelectedCountryIds([]);
    setPrimaryCountryId(null);
    setSelectedCountryNames({});
    setPlaceQuery('');
    setPlaces([]);
    setSelectedPlaceIds([]);
    setSelectedPlaceNames({});
    setSavedHints([]);
    setError('');
    setSubmitting(false);
    setRetryPending(false);
    setLoadingSource(false);
    setSelectedTravelerIds(personId ? [personId] : []);
    if (!familyId) return;
    let cancelled = false;
    const boot = async () => {
      try {
        const [people, travelerPresets, countryHits] = await Promise.all([
          listFamilyPeople(familyId),
          personId
            ? listTravelerPresets(familyId, personId).catch(() => [] as TravelerPreset[])
            : Promise.resolve([] as TravelerPreset[]),
          searchCountries({ limit: 80 }),
        ]);
        if (cancelled) return;
        setRoster(people);
        setPresets(travelerPresets);
        setCountries(countryHits);
        if (!editingProposalId || !editingTripId) return;
        setLoadingSource(true);
        const source = await fetchTripProposalEditSource(editingTripId);
        if (cancelled) return;
        if (!source) {
          setError(t('dashboard.toast.proposeError'));
          return;
        }
        setTitle(source.title);
        setNotes(source.notes ?? '');
        setStartDate(source.startDate);
        setEndDate(source.endDate);
        setDayCount(source.startDate && source.endDate ? inclusiveDayCount(source.startDate, source.endDate) : 7);
        setOccasion(source.occasion);
        setReminderDays(source.reminderDays);
        setCustomReminder(![0, 1, 3, 9].includes(source.reminderDays));
        setCoverUrl(source.coverUrl);
        setSelectedCountryIds(source.countryIds);
        setPrimaryCountryId(source.primaryCountryId || source.countryIds[0] || null);
        setSelectedPlaceIds(source.placeIds);
        const travelers = source.travelerPersonIds.length > 0 ? source.travelerPersonIds : personId ? [personId] : [];
        setSelectedTravelerIds(
          personId && travelers.length > 0 && !travelers.includes(personId) ? [personId, ...travelers] : travelers
        );
        const [namedCountries, namedPlaces] = await Promise.all([
          listCountriesByIds(source.countryIds),
          listPlacesByIds(source.placeIds),
        ]);
        if (cancelled) return;
        setSelectedCountryNames(Object.fromEntries(namedCountries.map((c) => [c.id, c.name])));
        setSelectedPlaceNames(Object.fromEntries(namedPlaces.map((p) => [p.id, p.name])));
        setCountries((prev) => mergeHits(namedCountries, prev));
        setPlaces((prev) => mergeHits(namedPlaces, prev));
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error && err.message ? err.message : t('dashboard.toast.proposeError');
        setError(message);
      } finally {
        if (!cancelled) setLoadingSource(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [isOpen, familyId, personId, editingProposalId, editingTripId]);

  useEffect(() => {
    return () => {
      submission.current = { inFlight: false };
    };
  }, [isOpen, familyId, personId, editingProposalId, editingTripId]);

  useEffect(() => {
    if (!isOpen || step !== 'countries') return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoadingCatalog(true);
      searchCountries({ query: countryQuery, limit: 80 })
        .then((rows) => {
          if (!cancelled) {
            setCountries(rows);
            setError('');
          }
        })
        .catch(() => {
          if (!cancelled) setCountries([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingCatalog(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isOpen, step, countryQuery]);

  useEffect(() => {
    if (!isOpen || step !== 'cities') return;
    if (selectedCountryIds.length === 0) {
      setPlaces([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoadingCatalog(true);
      searchCatalogPlaces({ query: placeQuery, countryIds: selectedCountryIds, limit: 120 })
        .then((rows) => {
          if (!cancelled) {
            setPlaces(rows);
            setError('');
          }
        })
        .catch(() => {
          if (!cancelled) setPlaces([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingCatalog(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isOpen, step, placeQuery, selectedCountryIds]);

  useEffect(() => {
    if (!isOpen || !familyId || selectedCountryIds.length === 0) {
      setSavedHints([]);
      return;
    }
    let cancelled = false;
    listMyCatalogSavesInCountries({ familyId, countryIds: selectedCountryIds })
      .then((rows) => {
        if (!cancelled) setSavedHints(rows);
      })
      .catch(() => {
        if (!cancelled) setSavedHints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, familyId, selectedCountryIds]);

  const dates = resolveProposalDates({
    startDate,
    endDate,
    dayCount: typeof dayCount === 'number' ? dayCount : 0,
  });
  const stepIndex = STEPS.indexOf(step);
  const canContinue =
    step === 'basics'
      ? canAdvanceFromBasics(title, dates)
      : step === 'countries'
        ? selectedCountryIds.length > 0
        : true;

  const updateStart = (value: string) => {
    setStartDate(value);
    if (!value) return;
    if (!endDate || endDate < value) setEndDate(value);
  };

  const handleCoverSearch = async () => {
    const query = coverSearchQuery.trim() || title.trim();
    if (!query) {
      setCoverSearchError(t('dashboard.unsplashQueryRequired'));
      return;
    }
    const seq = ++coverSearchSeq.current;
    setSearchingCover(true);
    setCoverSearchError('');
    try {
      const photos = await searchUnsplash(query);
      if (seq !== coverSearchSeq.current) return;
      setCoverSearchResults(photos);
      if (photos.length === 0) setCoverSearchError(t('dashboard.unsplashNoResults'));
    } catch (err: unknown) {
      if (seq !== coverSearchSeq.current) return;
      setCoverSearchError(err instanceof Error ? err.message : t('dashboard.coverSearchError'));
    } finally {
      if (seq === coverSearchSeq.current) setSearchingCover(false);
    }
  };

  const goNext = () => {
    setError('');
    if (step === 'basics' && !canAdvanceFromBasics(title, dates)) {
      setError(title.trim() ? t('dashboard.propose.datesRequired') : t('dashboard.titleRequired'));
      return;
    }
    if (step === 'countries' && selectedCountryIds.length === 0) {
      setError(t('dashboard.propose.countryRequired'));
      return;
    }
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };

  const goBack = () => {
    setError('');
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const toggleCountry = (hit: CatalogCountryHit) => {
    setSelectedCountryIds((prev) => {
      const next = prev.includes(hit.id) ? prev.filter((id) => id !== hit.id) : [...prev, hit.id];
      if (prev.includes(hit.id)) {
        setPrimaryCountryId((current) => (current === hit.id ? (next[0] ?? null) : current));
        setSelectedPlaceIds((ids) =>
          ids.filter((id) => {
            const place = places.find((p) => p.id === id);
            if (place?.countryId) return next.includes(place.countryId);
            const hint = savedHints.find((h) => h.kind === 'place' && h.entityId === id);
            if (hint?.countryId) return next.includes(hint.countryId);
            return true;
          })
        );
      } else {
        setPrimaryCountryId((current) => current ?? hit.id);
      }
      return next;
    });
    setSelectedCountryNames((prev) => ({ ...prev, [hit.id]: hit.name }));
  };

  const togglePlace = (hit: CatalogPlaceHit) => {
    setSelectedPlaceIds((prev) => (prev.includes(hit.id) ? prev.filter((id) => id !== hit.id) : [...prev, hit.id]));
    setSelectedPlaceNames((prev) => ({ ...prev, [hit.id]: hit.name }));
  };

  const toggleHintPlace = (hint: CatalogSaveHint) => {
    if (hint.kind !== 'place') return;
    setSelectedPlaceIds((prev) =>
      prev.includes(hint.entityId) ? prev.filter((id) => id !== hint.entityId) : [...prev, hint.entityId]
    );
    setSelectedPlaceNames((prev) => ({ ...prev, [hint.entityId]: hint.name }));
  };

  const handleSubmit = async () => {
    const attempt = submission.current;
    if (attempt.inFlight) return;
    if (!personId || (!isEditing && !familyId)) {
      toast.error(t('dashboard.propose.missingPerson'));
      return;
    }
    const travelers = selectedTravelerIds.includes(personId) ? selectedTravelerIds : [personId, ...selectedTravelerIds];
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
    };
    const previous = attempt.pending;
    const built = previous
      ? { ok: true as const, args: previous.args }
      : isEditing && editingProposalId
        ? buildUpdateTripProposalRpcArgs({ ...fields, proposalId: editingProposalId })
        : buildCreateTripProposalRpcArgs({ ...fields, familyId: familyId as string });
    if (built.ok === false) {
      setError(
        built.error === 'title'
          ? t('dashboard.titleRequired')
          : built.error === 'countries'
            ? t('dashboard.propose.countryRequired')
            : t('dashboard.propose.datesRequired')
      );
      return;
    }
    attempt.inFlight = true;
    setSubmitting(true);
    setError('');
    try {
      let result: CreateTripProposalResult;
      if ('p_family_id' in built.args && (previous || primaryCoreMode() === 'write')) {
        const pending = previous ?? prepareTripProposal(built.args, personId);
        attempt.pending = pending;
        result = await pending.actor.perform(() => createTripProposalWithReceipt(pending.operationId, pending.args));
        attempt.pending = undefined;
      } else {
        result =
          isEditing && editingProposalId
            ? await updateTripProposal({ ...fields, proposalId: editingProposalId })
            : await createTripProposal({ ...fields, familyId: familyId as string });
      }
      if (submission.current === attempt) onSubmitted(result.tripId, isEditing);
    } catch (err: unknown) {
      if (submission.current !== attempt) return;
      if (!previous && err instanceof TripProposalRejected) attempt.pending = undefined;
      setRetryPending(Boolean(attempt.pending));
      const message = attempt.pending && !(err instanceof TripProposalRejected) && attempt.pending.actor.current()
        ? t('dashboard.propose.submissionUnconfirmed')
        : err instanceof Error && err.message
          ? err.message
          : t('dashboard.toast.proposeError');
      setError(message);
      toast.error(message);
    } finally {
      attempt.inFlight = false;
      if (submission.current === attempt) setSubmitting(false);
    }
  };

  const chipCls = (on: boolean) =>
    `px-3 py-1.5 text-caption font-medium rounded-lg border transition-colors ${
      on
        ? 'bg-inverse text-inverse-text border-edge'
        : 'bg-surface-card text-content-muted border-edge hover:border-edge'
    }`;

  const nameForPerson = (id: string) => {
    if (id === personId) return t('dashboard.propose.you');
    return roster.find((p) => p.personId === id)?.displayName ?? id;
  };

  const travelerOptions = roster
    .filter((p) => p.personId !== personId && !selectedTravelerIds.includes(p.personId))
    .map((p) => ({ value: p.personId, label: p.displayName }));

  const footer = (
    <div className="flex w-full items-center justify-between gap-3">
      <p className="text-caption text-content-muted">
        {t('dashboard.propose.stepOf', { current: stepIndex + 1, total: STEPS.length })}
      </p>
      <div className="flex gap-3">
        {stepIndex === 0 ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-edge px-4 py-2 text-body text-content-muted hover:bg-surface-secondary hover:text-content"
          >
            {t('common.cancel')}
          </button>
        ) : (
          <button
            type="button"
            onClick={goBack}
            disabled={submitting || retryPending}
            className="rounded-lg border border-edge px-4 py-2 text-body text-content-muted hover:bg-surface-secondary hover:text-content"
          >
            {t('common.back')}
          </button>
        )}
        {step === 'review' ? (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || loadingSource || !personId || (!isEditing && !familyId)}
            className="flex items-center gap-2 rounded-lg bg-inverse px-4 py-2 text-body text-inverse-text hover:bg-inverse disabled:bg-surface-tertiary"
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-edge" />
                {t('common.saving')}
              </>
            ) : isEditing ? (
              t('common.update')
            ) : (
              t(retryPending ? 'dashboard.propose.retrySubmission' : 'dashboard.propose.submit')
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue || loadingSource}
            className="rounded-lg bg-inverse px-4 py-2 text-body text-inverse-text hover:bg-inverse disabled:bg-surface-tertiary"
          >
            {t('dashboard.propose.continue')}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t(step === 'basics' && isEditing ? 'dashboard.editTrip' : STEP_KEYS[step])}
      size="lg"
      footer={footer}
    >
      <div className="space-y-4">
        {error && <div className="rounded-lg border border-edge bg-danger-soft p-3 text-body text-danger">{error}</div>}

        {loadingSource && <p className="text-caption text-content-muted">{t('common.loading')}</p>}

        {step === 'basics' && (
          <>
            <div>
              <label className="mb-1.5 block text-body font-medium text-content">{t('dashboard.coverImage')}</label>
              {coverUrl ? (
                <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', height: 130 }}>
                  <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    type="button"
                    onClick={() => setCoverUrl(null)}
                    className="absolute bottom-2 end-2 rounded-lg bg-[var(--overlay)] p-1.5 text-inverse-text"
                    aria-label={t('common.clear')}
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => toast.error(t('dashboard.propose.coverFileToast'))}
                  className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border-2 border-dashed border-edge py-[18px] text-body text-content-muted hover:border-edge"
                >
                  <Camera size={15} /> {t('dashboard.addCoverImage')}
                </button>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={coverSearchQuery}
                  onChange={(e) => setCoverSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleCoverSearch();
                    }
                  }}
                  placeholder={t('dashboard.unsplashSearchPlaceholder')}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => void handleCoverSearch()}
                  disabled={searchingCover || (!coverSearchQuery.trim() && !title.trim())}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-edge px-3 py-2 text-body hover:bg-surface-secondary disabled:opacity-40"
                >
                  {searchingCover ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-edge" />
                  ) : (
                    <Search size={14} />
                  )}
                  {t('dashboard.searchUnsplash')}
                </button>
              </div>
              {coverSearchError && <p className="mt-1.5 text-caption text-danger">{coverSearchError}</p>}
              {coverSearchResults.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {coverSearchResults.map((photo) => (
                    <button
                      type="button"
                      key={photo.id}
                      onClick={() => setCoverUrl(photo.url)}
                      aria-label={t('dashboard.useUnsplashPhoto', { photographer: photo.photographer || 'Unsplash' })}
                      className={`relative h-20 overflow-hidden rounded-lg border ${coverUrl === photo.url ? 'border-edge ring-2 ring-accent' : 'border-edge hover:border-edge'}`}
                    >
                      <img
                        src={photo.thumb}
                        alt={photo.description || ''}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-body font-medium text-content">
                {t('dashboard.tripTitle')} <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('dashboard.tripTitlePlaceholder')}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-body font-medium text-content">
                {t('dashboard.tripDescription')}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('dashboard.tripDescriptionPlaceholder')}
                rows={3}
                className={`${inputCls} resize-none`}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-body font-medium text-content">
                  <Calendar className="me-1 inline h-4 w-4" />
                  {t('dashboard.startDate')}
                </label>
                <CustomDatePicker
                  value={startDate}
                  onChange={updateStart}
                  placeholder={t('dashboard.startDate')}
                  ariaLabel={t('dashboard.startDate')}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-body font-medium text-content">
                  <Calendar className="me-1 inline h-4 w-4" />
                  {t('dashboard.endDate')}
                </label>
                <CustomDatePicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder={t('dashboard.endDate')}
                  ariaLabel={t('dashboard.endDate')}
                />
              </div>
            </div>
            {!startDate && !endDate && (
              <div>
                <label className="mb-1.5 block text-body font-medium text-content">{t('dashboard.dayCount')}</label>
                <NumericInput
                  min={1}
                  max={365}
                  value={dayCount}
                  onValueChange={(raw) => {
                    if (raw === '') {
                      setDayCount('');
                      return;
                    }
                    const n = Math.floor(Number(raw));
                    if (Number.isFinite(n)) setDayCount(Math.min(365, Math.max(1, n)));
                  }}
                  className={inputCls}
                />
                <p className="mt-1.5 text-caption text-content-muted">{t('dashboard.dayCountHint')}</p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-body font-medium text-content">
                {t('dashboard.propose.occasion')}
              </label>
              <div className="flex flex-wrap gap-2">
                {TRIP_OCCASIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setOccasion(value)}
                    className={chipCls(occasion === value)}
                  >
                    {t(OCCASION_KEYS[value])}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-body font-medium text-content">
                <Bell className="me-1 inline h-4 w-4" />
                {t('trips.reminder')}
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 0, label: t('trips.reminderNone') },
                  { value: 1, label: `1 ${t('trips.reminderDay')}` },
                  { value: 3, label: `3 ${t('trips.reminderDays')}` },
                  { value: 9, label: `9 ${t('trips.reminderDays')}` },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setReminderDays(opt.value);
                      setCustomReminder(false);
                    }}
                    className={chipCls(!customReminder && reminderDays === opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setCustomReminder(true);
                    if ([0, 1, 3, 9].includes(reminderDays)) setReminderDays(7);
                  }}
                  className={chipCls(customReminder)}
                >
                  {t('trips.reminderCustom')}
                </button>
              </div>
              {customReminder && (
                <div className="mt-2 flex items-center gap-2">
                  <NumericInput
                    min={1}
                    max={30}
                    value={reminderDays}
                    onValueChange={(raw) => setReminderDays(Math.max(1, Math.min(30, Number(raw) || 1)))}
                    className="w-20 rounded-lg border border-edge px-3 py-1.5 text-body text-content focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <span className="text-caption text-content-muted">{t('trips.reminderDaysBefore')}</span>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-body font-medium text-content">
                <UserPlus className="me-1 inline h-4 w-4" />
                {t('dashboard.propose.travelers')}
              </label>
              {presets.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSelectedTravelerIds((prev) => {
                          const next = new Set(prev);
                          for (const id of preset.personIds) next.add(id);
                          if (personId) next.add(personId);
                          return [...next];
                        });
                      }}
                      className="rounded-lg border border-edge px-3 py-1.5 text-caption font-medium text-content-muted hover:border-edge"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              )}
              {selectedTravelerIds.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {selectedTravelerIds.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border border-edge bg-surface-secondary px-2.5 py-1 text-caption font-medium text-content"
                    >
                      {nameForPerson(id)}
                      {id !== personId && (
                        <button
                          type="button"
                          onClick={() => setSelectedTravelerIds((prev) => prev.filter((x) => x !== id))}
                          aria-label={t('common.clear')}
                        >
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
                  onChange={(value) => {
                    if (!value) return;
                    const id = String(value);
                    setSelectedTravelerIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
                    setTravelerSelect('');
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
              onChange={(e) => setCountryQuery(e.target.value)}
              placeholder={t('dashboard.propose.searchCountries')}
              className={inputCls}
            />
            {loadingCatalog && <p className="text-caption text-content-muted">{t('common.loading')}</p>}
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {mergeHits(
                selectedCountryIds
                  .filter((id) => !countries.some((c) => c.id === id))
                  .map((id) => ({ id, name: selectedCountryNames[id] ?? id, iso2: null })),
                countries
              ).map((hit) => {
                const on = selectedCountryIds.includes(hit.id);
                const primary = primaryCountryId === hit.id;
                return (
                  <li key={hit.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCountry(hit)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-start text-body ${on ? 'border-edge bg-surface-secondary' : 'border-edge hover:bg-surface-secondary'}`}
                    >
                      {hit.name}
                      {hit.iso2 ? ` (${hit.iso2})` : ''}
                    </button>
                    {on && (
                      <button type="button" onClick={() => setPrimaryCountryId(hit.id)} className={chipCls(primary)}>
                        {primary ? t('dashboard.propose.primary') : t('dashboard.propose.makePrimary')}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {step === 'cities' && (
          <>
            <input
              type="text"
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              placeholder={t('dashboard.propose.searchCities')}
              className={inputCls}
            />
            {loadingCatalog && <p className="text-caption text-content-muted">{t('common.loading')}</p>}
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {mergeHits(
                selectedPlaceIds
                  .filter((id) => !places.some((p) => p.id === id))
                  .map((id) => ({ id, name: selectedPlaceNames[id] ?? id, countryId: null })),
                places
              ).map((hit) => {
                const on = selectedPlaceIds.includes(hit.id);
                return (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => togglePlace(hit)}
                      className={`w-full rounded-lg border px-3 py-2 text-start text-body ${on ? 'border-edge bg-surface-secondary' : 'border-edge hover:bg-surface-secondary'}`}
                    >
                      {hit.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {step === 'notes' && (
          <div>
            <label className="mb-1.5 block text-body font-medium text-content">
              {t('dashboard.propose.step.notes')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('dashboard.propose.notesHint')}
              rows={6}
              className={`${inputCls} resize-none`}
            />
          </div>
        )}

        {step === 'review' && (
          <dl className="space-y-3 text-body">
            <div>
              <dt className="text-content-muted">{t('dashboard.tripTitle')}</dt>
              <dd className="font-medium text-content">{title.trim() || t('dashboard.propose.none')}</dd>
            </div>
            <div>
              <dt className="text-content-muted">{t('dashboard.propose.occasion')}</dt>
              <dd>{t(OCCASION_KEYS[occasion])}</dd>
            </div>
            <div>
              <dt className="text-content-muted">{t('dashboard.hero.tripDates')}</dt>
              <dd>
                {dates ? `${dates.startAt.slice(0, 10)} – ${dates.endAt.slice(0, 10)}` : t('dashboard.propose.none')}
              </dd>
            </div>
            <div>
              <dt className="text-content-muted">{t('dashboard.propose.step.countries')}</dt>
              <dd>
                {selectedCountryIds.map((id) => selectedCountryNames[id] ?? id).join(', ') ||
                  t('dashboard.propose.none')}
              </dd>
            </div>
            <div>
              <dt className="text-content-muted">{t('dashboard.propose.step.cities')}</dt>
              <dd>
                {selectedPlaceIds.map((id) => selectedPlaceNames[id] ?? id).join(', ') || t('dashboard.propose.none')}
              </dd>
            </div>
            <div>
              <dt className="text-content-muted">{t('dashboard.propose.travelers')}</dt>
              <dd>{selectedTravelerIds.map(nameForPerson).join(', ') || t('dashboard.propose.none')}</dd>
            </div>
            <div>
              <dt className="text-content-muted">{t('dashboard.propose.reviewCover')}</dt>
              <dd>
                {coverUrl ? (
                  <img src={coverUrl} alt="" className="mt-1 h-20 w-full rounded-lg object-cover" />
                ) : (
                  t('dashboard.propose.none')
                )}
              </dd>
            </div>
            <div>
              <dt className="text-content-muted">{t('dashboard.propose.step.notes')}</dt>
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
  );
}
