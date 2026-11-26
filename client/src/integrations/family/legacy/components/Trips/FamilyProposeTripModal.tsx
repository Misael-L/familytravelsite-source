import { Bell, Calendar, CalendarDays, Camera, Check, Image as ImageIcon, Plane, Search, Type, UserPlus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { TRIP_COVER_LIMIT, TRIP_COVER_MIME, uploadNewTripCover } from '@family/backend/supabase/tripCovers';
import { CustomDatePicker } from '../../../../../components/shared/CustomDateTimePicker';
import { INPUT, LABEL, PANEL } from '../../../../../components/shared/dialogParts';
import { DialogButton, DialogHeader, DialogTile, fs, NEUTRAL_TINT } from '../../../../../components/shared/DialogShell';
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
import { normalizeImageFile } from '../../utils/convertHeic';
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
  wideCreate?: boolean;
  onClose: () => void;
  onSubmitted: (tripId: string, edited: boolean) => void;
};

type ProposalSubmission = {
  inFlight: boolean;
  pending?: ReturnType<typeof prepareTripProposal>;
  created?: CreateTripProposalResult;
};

function mergeHits<T extends { id: string }>(named: T[], existing: T[]): T[] {
  const seen = new Set(named.map((h) => h.id));
  return [...named, ...existing.filter((h) => !seen.has(h.id))];
}

const inputCls =
  'w-full px-3 py-2.5 border border-edge rounded-lg text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-body';

function SectionHeading({ icon, children, hint }: { icon: ReactNode; children: ReactNode; hint: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface-card text-content-muted shadow-sm" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="m-0 font-semibold text-content" style={fs(13, 'body')}>{children}</h3>
        <p className="m-0 mt-0.5 leading-normal text-content-faint" style={fs(11.5)}>{hint}</p>
      </div>
    </div>
  );
}

export default function FamilyProposeTripModal({
  isOpen,
  familyId,
  personId,
  editingProposalId = null,
  editingTripId = null,
  wideCreate = false,
  onClose,
  onSubmitted,
}: FamilyProposeTripModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const fieldId = useId();
  const restoreTo = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const suppressRestoreRef = useRef(false);
  const coverSearchSeq = useRef(0);
  const coverPickSeq = useRef(0);
  const coverInput = useRef<HTMLInputElement>(null);
  const placeCountries = useRef(new Map<string, string>());
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
  const [deviceCover, setDeviceCover] = useState<{ file: File; preview: string } | null>(null);
  const [convertingCover, setConvertingCover] = useState(false);
  const [coverDragActive, setCoverDragActive] = useState(false);
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
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [countrySearchFailed, setCountrySearchFailed] = useState(false);
  const [citySearchFailed, setCitySearchFailed] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const isEditing = Boolean(editingProposalId && editingTripId);
  const compactBasics = wideCreate && step === 'basics';
  const coreMode = primaryCoreMode();
  const canPickDeviceCover = !isEditing && (coreMode === 'write' || coreMode === undefined);
  const coverPreview = deviceCover?.preview ?? coverUrl;

  useEffect(() => {
    if (deviceCover) return () => URL.revokeObjectURL(deviceCover.preview);
  }, [deviceCover]);

  useEffect(() => () => { coverPickSeq.current++; }, [isOpen, familyId, personId]);

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
    setDeviceCover(null);
    setConvertingCover(false);
    setCoverDragActive(false);
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
    placeCountries.current.clear();
    setCountrySearchFailed(false);
    setCitySearchFailed(false);
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
        for (const place of namedPlaces) {
          if (place.countryId) placeCountries.current.set(place.id, place.countryId);
        }
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
    setLoadingCountries(true);
    setCountrySearchFailed(false);
    const handle = window.setTimeout(() => {
      searchCountries({ query: countryQuery, limit: 80 })
        .then((rows) => {
          if (!cancelled) setCountries(rows);
        })
        .catch(() => {
          if (!cancelled) {
            setCountries([]);
            setCountrySearchFailed(true);
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingCountries(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isOpen, step, countryQuery]);

  useEffect(() => {
    if (!isOpen || step !== 'cities') return;
    setCitySearchFailed(false);
    if (selectedCountryIds.length === 0) {
      setPlaces([]);
      setLoadingCities(false);
      return;
    }
    let cancelled = false;
    setLoadingCities(true);
    const handle = window.setTimeout(() => {
      searchCatalogPlaces({ query: placeQuery, countryIds: selectedCountryIds, limit: 120 })
        .then((rows) => {
          if (!cancelled) setPlaces(rows);
        })
        .catch(() => {
          if (!cancelled) {
            setPlaces([]);
            setCitySearchFailed(true);
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingCities(false);
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
  const canContinue = !convertingCover && (
    step === 'basics'
      ? canAdvanceFromBasics(title, dates)
      : step === 'countries'
        ? selectedCountryIds.length > 0
        : true);

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

  const selectDeviceCover = async (file: File | undefined) => {
    if (!file || !canPickDeviceCover) return;
    const sequence = ++coverPickSeq.current;
    const heic = /\.(heic|heif)$/i.test(file.name) || ['image/heic', 'image/heif'].includes(file.type);
    setConvertingCover(false);
    if ((!heic && !TRIP_COVER_MIME.includes(file.type)) || file.size < 1 || file.size > TRIP_COVER_LIMIT) {
      setCoverSearchError(t('dashboard.propose.coverFileInvalid'));
      return;
    }
    coverSearchSeq.current++;
    setSearchingCover(false);
    setCoverSearchResults([]);
    setCoverSearchError('');
    setConvertingCover(true);
    try {
      const normalized = await normalizeImageFile(file);
      if (sequence !== coverPickSeq.current) return;
      if (!TRIP_COVER_MIME.includes(normalized.type) || normalized.size < 1 || normalized.size > TRIP_COVER_LIMIT) {
        setCoverSearchError(t('dashboard.propose.coverFileInvalid'));
        return;
      }
      setCoverUrl(null);
      setDeviceCover({ file: normalized, preview: URL.createObjectURL(normalized) });
    } catch {
      if (sequence === coverPickSeq.current) setCoverSearchError(t('dashboard.propose.coverConversionFailed'));
    } finally {
      if (sequence === coverPickSeq.current) setConvertingCover(false);
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
    const removing = selectedCountryIds.includes(hit.id);
    const next = removing
      ? selectedCountryIds.filter((id) => id !== hit.id)
      : [...selectedCountryIds, hit.id];
    setSelectedCountryIds(next);
    if (removing) {
      setPrimaryCountryId((current) => (current === hit.id ? (next[0] ?? null) : current));
      setSelectedPlaceIds((ids) => ids.filter((id) => placeCountries.current.get(id) !== hit.id));
      setPlaces([]);
    } else {
      setPrimaryCountryId((current) => current ?? hit.id);
      setSelectedCountryNames((prev) => ({ ...prev, [hit.id]: hit.name }));
    }
  };

  const togglePlace = (hit: Pick<CatalogPlaceHit, 'id' | 'name' | 'countryId'>) => {
    if (hit.countryId) placeCountries.current.set(hit.id, hit.countryId);
    setSelectedPlaceIds((prev) => (prev.includes(hit.id) ? prev.filter((id) => id !== hit.id) : [...prev, hit.id]));
    setSelectedPlaceNames((prev) => ({ ...prev, [hit.id]: hit.name }));
  };

  const toggleHintPlace = (hint: CatalogSaveHint) => {
    if (hint.kind === 'place' && hint.countryId && selectedCountryIds.includes(hint.countryId)) {
      togglePlace({ id: hint.entityId, name: hint.name, countryId: hint.countryId });
    }
  };

  const handleSubmit = async () => {
    const attempt = submission.current;
    if (attempt.inFlight || convertingCover) return;
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
      if ('p_family_id' in built.args && (previous || coreMode === 'write' || deviceCover)) {
        const pending = previous ?? prepareTripProposal(built.args, personId);
        attempt.pending = pending;
        result = attempt.created ??
          await pending.actor.perform(() => createTripProposalWithReceipt(pending.operationId, pending.args));
        if (deviceCover) {
          attempt.created = result;
          const tripId = result.tripId;
          await pending.actor.perform(() => uploadNewTripCover(pending.operationId, tripId, deviceCover.file));
        }
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
      const message = attempt.created
        ? t('dashboard.propose.coverSaveFailed')
        : attempt.pending && !(err instanceof TripProposalRejected) && attempt.pending.actor.current()
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

  const fieldInputCls = compactBasics ? INPUT : inputCls;
  const fieldLabelCls = compactBasics ? LABEL : 'mb-1.5 block text-body font-medium text-content';
  const pillCls = compactBasics ? 'rounded-full' : 'rounded-lg';
  const chipCls = (on: boolean) =>
    `px-3 py-1.5 text-caption font-medium ${pillCls} border transition-colors ${
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

  const stepLabel = t('dashboard.propose.stepOf', { current: stepIndex + 1, total: STEPS.length });
  const footer = compactBasics ? (
    <>
      <p className="m-0 flex-1 text-content-muted" style={fs(11)}>{stepLabel}</p>
      <DialogButton onClick={onClose}>{t('common.cancel')}</DialogButton>
      <DialogButton variant="primary" onClick={goNext} disabled={!canContinue || loadingSource}>
        {t('dashboard.propose.continue')}
      </DialogButton>
    </>
  ) : (
    <div className="flex w-full items-center justify-between gap-3">
      <p className="text-caption text-content-muted">
        {stepLabel}
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
            disabled={submitting || convertingCover || loadingSource || !personId || (!isEditing && !familyId)}
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
              t(submission.current.created ? 'dashboard.propose.retryCover' :
                retryPending ? 'dashboard.propose.retrySubmission' : 'dashboard.propose.submit')
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

  const coverFields = (
    <div>
      {!isEditing ? (
        <SectionHeading icon={<ImageIcon size={16} />} hint={t('dashboard.propose.coverHint')}>
          <label htmlFor={`${fieldId}-cover`}>{t('dashboard.coverImage')}</label>
        </SectionHeading>
      ) : (
        <label htmlFor={`${fieldId}-cover`} className={fieldLabelCls}>{t('dashboard.coverImage')}</label>
      )}
      {coverPreview ? (
        <div className="relative mt-3 h-[110px] overflow-hidden rounded-xl">
          <img src={coverPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div className="absolute bottom-2 end-2 flex gap-1.5">
            {canPickDeviceCover && (
              <button
                type="button"
                onClick={() => coverInput.current?.click()}
                disabled={convertingCover}
                className="flex items-center gap-1 rounded-lg bg-black/55 px-2.5 py-[5px] text-caption font-semibold text-white backdrop-blur-sm"
              >
                <Camera size={12} aria-hidden />{t(convertingCover ? 'common.uploading' : 'common.change')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                coverPickSeq.current++;
                setConvertingCover(false);
                setCoverUrl(null);
                setDeviceCover(null);
                setCoverSearchError('');
              }}
              className="rounded-lg bg-black/55 p-1.5 text-white backdrop-blur-sm"
              aria-label={t('common.clear')}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      ) : null}
      {canPickDeviceCover && (
        <>
          <input
            ref={coverInput}
            type="file"
            accept={[...TRIP_COVER_MIME, 'image/heic', 'image/heif', '.heic', '.heif'].join(',')}
            aria-label={t('dashboard.addCoverImage')}
            className="hidden"
            onChange={(e) => {
              void selectDeviceCover(e.currentTarget.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
          {!coverPreview && <button
            type="button"
            onClick={() => coverInput.current?.click()}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                setCoverDragActive(true);
              }
            }}
            onDragLeave={() => setCoverDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setCoverDragActive(false);
              void selectDeviceCover(e.dataTransfer.files[0]);
            }}
            className={`mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed px-4 transition-colors ${coverDragActive ? 'border-accent bg-accent-subtle text-content' : 'border-edge text-content-faint hover:border-edge-secondary hover:text-content-muted'}`}
            style={fs(13, 'body')}
          >
            <Camera size={14} aria-hidden />
            {t(convertingCover ? 'common.uploading' : 'dashboard.addCoverImage')}
          </button>}
        </>
      )}
      <div className={compactBasics ? 'mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 max-[419px]:grid-cols-1' : 'mt-2 flex flex-wrap gap-2'}>
        <input
          type="text"
          id={`${fieldId}-cover`}
          value={coverSearchQuery}
          onChange={(e) => setCoverSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleCoverSearch();
            }
          }}
          placeholder={t('dashboard.unsplashSearchPlaceholder')}
          className={compactBasics ? fieldInputCls : `${fieldInputCls} min-w-[10rem] flex-1`}
        />
        <button
          type="button"
          onClick={() => void handleCoverSearch()}
          disabled={searchingCover || (!coverSearchQuery.trim() && !title.trim())}
          className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] bg-accent px-4 py-2 font-medium text-accent-text hover:opacity-90 disabled:cursor-default disabled:opacity-50 ${compactBasics ? 'text-[length:calc(13px*var(--fs-scale-body,1))]' : 'text-body'}`}
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
              onClick={() => {
                coverPickSeq.current++;
                setConvertingCover(false);
                setDeviceCover(null);
                setCoverUrl(photo.url);
                if (wideCreate) setCoverSearchResults([]);
              }}
              aria-pressed={coverUrl === photo.url}
              aria-label={t('dashboard.useUnsplashPhoto', { photographer: photo.photographer || 'Unsplash' })}
              className={`relative h-20 overflow-hidden rounded-lg border ${coverUrl === photo.url ? 'border-edge ring-2 ring-accent' : 'border-edge hover:border-edge'}`}
            >
              <img
                src={photo.thumb}
                alt={photo.description || ''}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {photo.photographer && (
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-1 text-caption text-white">
                  {photo.photographer}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const nameFields = (
    <>
      <div>
        <label htmlFor={`${fieldId}-title`} className={fieldLabelCls}>
          {t('dashboard.tripTitle')} <span className="text-danger" aria-hidden>*</span>
        </label>
        <input
          type="text"
          id={`${fieldId}-title`}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('dashboard.tripTitlePlaceholder')}
          className={fieldInputCls}
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-description`} className={fieldLabelCls}>
          {t('dashboard.tripDescription')}
        </label>
        <textarea
          id={`${fieldId}-description`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('dashboard.tripDescriptionPlaceholder')}
          rows={3}
          className={`${fieldInputCls} resize-none`}
        />
      </div>
    </>
  );

  const scheduleFields = (
    <>
      <div className={`grid grid-cols-2 ${compactBasics ? 'gap-3' : 'gap-4'}`}>
        <div className="min-w-0">
          <label className={fieldLabelCls}>
            {!compactBasics && <Calendar className="me-1 inline h-4 w-4" />}
            {t('dashboard.startDate')}
          </label>
          <CustomDatePicker
            value={startDate}
            onChange={updateStart}
            placeholder={t('dashboard.startDate')}
            ariaLabel={t('dashboard.startDate')}
          />
        </div>
        <div className="min-w-0">
          <label className={fieldLabelCls}>
            {!compactBasics && <Calendar className="me-1 inline h-4 w-4" />}
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
      {wideCreate && startDate && endDate && endDate < startDate && (
        <p className="text-caption text-danger" role="status">{t('dashboard.endDateError')}</p>
      )}
      {!startDate && !endDate && (
        <div>
          <label htmlFor={`${fieldId}-duration`} className={fieldLabelCls}>{t('dashboard.dayCount')}</label>
          <NumericInput
            id={`${fieldId}-duration`}
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
            className={fieldInputCls}
          />
          <p className="mt-1.5 text-caption text-content-muted">{t('dashboard.dayCountHint')}</p>
        </div>
      )}

      <div>
        <label className={fieldLabelCls}>
          {t('dashboard.propose.occasion')}
        </label>
        <div className="flex flex-wrap gap-2">
          {TRIP_OCCASIONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setOccasion(value)}
              aria-pressed={occasion === value}
              className={chipCls(occasion === value)}
            >
              {t(OCCASION_KEYS[value])}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={fieldLabelCls}>
          {!compactBasics && <Bell className="me-1 inline h-4 w-4" />}
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
              aria-pressed={!customReminder && reminderDays === opt.value}
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
            aria-pressed={customReminder}
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
              aria-label={t('trips.reminderDaysBefore')}
              value={reminderDays}
              onValueChange={(raw) => setReminderDays(Math.max(1, Math.min(30, Number(raw) || 1)))}
              className="w-20 rounded-lg border border-edge px-3 py-1.5 text-body text-content focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <span className="text-caption text-content-muted">{t('trips.reminderDaysBefore')}</span>
          </div>
        )}
      </div>
    </>
  );

  const travelerFields = (
    <div>
      <label className={fieldLabelCls}>
        {!compactBasics && <UserPlus className="me-1 inline h-4 w-4" />}
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
  );

  const countryFields = (
    <>
      <input
        type="text"
        aria-label={t('dashboard.propose.searchCountries')}
        value={countryQuery}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        onChange={(e) => setCountryQuery(e.target.value)}
        placeholder={t('dashboard.propose.searchCountries')}
        className={inputCls}
      />
      {loadingCountries && <p className="text-caption text-content-muted">{t('common.loading')}</p>}
      {!loadingCountries && countries.length === 0 && (
        <p role="status" className="text-caption text-content-muted">
          {t(countrySearchFailed ? 'dashboard.propose.catalogUnavailable' : 'dashboard.propose.noCountries')}
        </p>
      )}
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {mergeHits(
          selectedCountryIds.map((id) =>
            countries.find((country) => country.id === id) ?? { id, name: selectedCountryNames[id] ?? id, iso2: null }
          ),
          countries
        ).map((hit) => {
          const on = selectedCountryIds.includes(hit.id);
          const primary = primaryCountryId === hit.id;
          return (
            <li key={hit.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleCountry(hit)}
                aria-pressed={on}
                className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start text-body ${on ? 'border-accent bg-surface-card' : 'border-edge hover:bg-surface-hover'}`}
              >
                <span>{hit.name}{hit.iso2 ? ` (${hit.iso2})` : ''}</span>
                {on && <Check size={14} className="shrink-0" aria-hidden />}
              </button>
              {on && (
                <button type="button" onClick={() => setPrimaryCountryId(hit.id)} aria-pressed={primary} className={chipCls(primary)}>
                  {primary ? t('dashboard.propose.primary') : t('dashboard.propose.makePrimary')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );

  const cityFields = (
    <>
      <input
        type="text"
        aria-label={t('dashboard.propose.searchCities')}
        value={placeQuery}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        onChange={(e) => setPlaceQuery(e.target.value)}
        placeholder={t('dashboard.propose.searchCities')}
        className={inputCls}
      />
      {loadingCities && <p className="text-caption text-content-muted">{t('common.loading')}</p>}
      {!loadingCities && places.length === 0 && placeQuery.trim() && (
        <p role="status" className="text-caption text-content-muted">
          {t(citySearchFailed ? 'dashboard.propose.catalogUnavailable' : 'dashboard.propose.noCities')}
        </p>
      )}
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {mergeHits(
          selectedPlaceIds.map((id) =>
            places.find((place) => place.id === id) ?? { id, name: selectedPlaceNames[id] ?? id, countryId: null }
          ),
          places
        ).map((hit) => {
          const on = selectedPlaceIds.includes(hit.id);
          return (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => togglePlace(hit)}
                  aria-pressed={on}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start text-body ${on ? 'border-accent bg-surface-card' : 'border-edge hover:bg-surface-hover'}`}
              >
                <span>{hit.name}</span>
                {on && <Check size={14} className="shrink-0" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );

  const hintFields = (
    <FamilyProposalHintChips
      hints={savedHints}
      selectedPlaceIds={selectedPlaceIds}
      onPlaceTap={toggleHintPlace}
    />
  );

  const submissionError = error && (
    <p role="alert" className="rounded-lg border border-edge bg-danger-soft p-3 text-body text-danger">{error}</p>
  );

  const section = `min-w-0 ${PANEL}`;
  const createBasics = (
    <div className={`grid min-w-0 items-start gap-x-6 gap-y-4 ${compactBasics ? 'md:grid-cols-2' : ''}`}>
      <div className="min-w-0 space-y-4">
        <section className={section}>{coverFields}</section>
        <section className={section}>
          <SectionHeading icon={<Type size={16} />} hint={t('dashboard.propose.aboutHint')}>{t('dashboard.propose.nameAndDescription')}</SectionHeading>
          {nameFields}
        </section>
      </div>
      <section className={section}>
        <SectionHeading icon={<CalendarDays size={16} />} hint={t('dashboard.propose.whenHint')}>{t('dashboard.hero.tripDates')}</SectionHeading>
        {scheduleFields}
        {travelerFields}
      </section>
    </div>
  );

  const dialogTitle = t(step === 'basics' && isEditing ? 'dashboard.editTrip' : STEP_KEYS[step]);
  const close = () => { if (!submission.current.inFlight) onClose(); };
  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={dialogTitle}
      size={compactBasics ? 'wide' : 'lg'}
      header={compactBasics ? (labelId) => (
        <DialogHeader
          labelId={labelId}
          onClose={close}
          title={dialogTitle}
          tint={NEUTRAL_TINT}
          tile={<DialogTile><Plane size={18} className="text-content-muted" aria-hidden /></DialogTile>}
        />
      ) : undefined}
      focusScope={wideCreate ? { restoreTo: restoreTo.current, suppressRestoreRef } : undefined}
      footer={footer}
    >
      <div className="space-y-4" onPaste={(e) => {
        if (!canPickDeviceCover) return;
        const image = Array.from(e.clipboardData.items).find(item => item.type.startsWith('image/'));
        if (!image) return;
        e.preventDefault();
        void selectDeviceCover(image.getAsFile() ?? undefined);
      }}>
        {submissionError}

        {loadingSource && <p className="text-caption text-content-muted">{t('common.loading')}</p>}

        {step === 'basics' && (isEditing ? <>{coverFields}{nameFields}{scheduleFields}{travelerFields}</> : createBasics)}
        {step === 'countries' && countryFields}
        {step === 'cities' && cityFields}

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
                {coverPreview ? (
                  <img src={coverPreview} alt="" className="mt-1 h-20 w-full rounded-lg object-cover" />
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

        {(step === 'countries' || step === 'notes' || step === 'review') && hintFields}
      </div>
    </Modal>
  );
}
