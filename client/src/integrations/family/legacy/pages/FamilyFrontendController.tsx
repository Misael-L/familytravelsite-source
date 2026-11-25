import { currentPlannerGovernancePort } from '../../../../repo/plannerGovernancePort';
import { useFamilyUiPermissions } from '../../uiPermissions';
// Copied Family controller from 247b76e. Only its render boundary is adapted.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import UpstreamTripLoadingSplash from '../../../../components/shared/TripLoadingSplash';
import { useTripStore as useCopiedTripStore } from '../../../../store/tripStore';
import { FamilyControllerContext } from '../../controllerContext';
import { familyFrontend } from '../../repository';
import { projectFamilyDayTimeline } from '../components/Planner/family/familyDayTimeline';
import { useToast } from '../components/shared/Toast';
import '../components/shared/trekMascot.css';
import { type ExploreDeepLink } from '../data/supabase/catalogExploreLists';
import { listTripCountryIds } from '../data/supabase/catalogPlaces';
import { notesByCivilDay as groupNotesByCivilDay, listDayNotes, type FamilyDayNote } from '../data/supabase/dayNotes';
import { groupScheduleByCivilDay, listScheduleItems, type FamilyScheduleItem } from '../data/supabase/scheduleItems';
import '../data/supabase/tripChangeRequests';
import { listTripDays, syncTripDays, type FamilyTripDay } from '../data/supabase/tripDays';
import { listTripPlaces, type FamilyTripPlace } from '../data/supabase/tripPlaces';
import {
  type FamilyExpensePrefill,
  type FamilyTransportReservation,
  type FamilyTripReservation,
} from '../data/supabase/tripReservations';
import { fetchTripById } from '../data/supabase/trips';
import { listTripTracks, type FamilyTripTrack } from '../data/supabase/tripTracks';
import { useFamilyItineraryRealtime } from '../hooks/useFamilyItineraryRealtime';
import { usePlannerHistory } from '../hooks/usePlannerHistory';
import { useTranslation } from '../i18n';
import { useAuthStore } from '../store/authStore';
import { useFamilyFeatureStore } from '../store/familyFeatureStore';
import type { FamilyDashboardTrip } from './dashboard/familyDashboardModel';
import {
  retainAssignPlaceToDay,
  retainConfirmDelete,
  retainConfirmDeleteNote,
  retainConfirmDeleteTrack,
  retainConfirmRemoveItem,
  retainHandlePickCatalog,
  retainMoveItem,
  retainOpenAddPlace,
  retainOpenTrackImport,
  retainRequestAssignToDay,
  retainRequestDelete,
  retainRequestDeleteTrack,
  retainRequestRemoveItem,
  retainSaveDayTitle,
  retainSaveNote,
  retainToastDenied,
  retainToastWrite,
  retainedDayIndex,
  type RetainedItineraryContext,
} from './familyTripWorkspace/controllerItineraryActions';
import { useFamilyTripWorkspaceGovernance } from './familyTripWorkspace/useFamilyTripWorkspaceGovernance';
import { useFamilyWorkspacePlaceCategories } from './familyTripWorkspace/useFamilyWorkspacePlaceCategories';

type WorkspaceTab = 'plan' | 'explore' | 'transports' | 'buchungen' | 'lists' | 'finanzplan' | 'files';

async function settled<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await promise };
  } catch {
    return { ok: false };
  }
}

/**
 * W5 supabase workspace — TREK Plan/Places rails + schedule_items assign loop.
 * Nest TripPlannerNestPage stays on the nest plane.
 */
export default function FamilyFrontendController({ children }: React.PropsWithChildren): React.ReactElement | null {
  const { id: tripId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { t, locale } = useTranslation();
  const { pushUndo, undo, canUndo, lastActionLabel } = usePlannerHistory();

  const [trip, setTrip] = useState<FamilyDashboardTrip | null>(null);
  const [places, setPlaces] = useState<FamilyTripPlace[]>([]);
  const [, setTracks] = useState<FamilyTripTrack[]>([]);
  const [days, setDays] = useState<FamilyTripDay[]>([]);
  const [scheduleItems, setScheduleItems] = useState<FamilyScheduleItem[]>([]);
  const [bookings, setBookings] = useState<FamilyTripReservation[] | null>(null);
  const [transports, setTransports] = useState<FamilyTransportReservation[] | null>(null);
  const reservationGeneration = useRef(0);
  const reservationsStale = useRef(false);
  const reservationInFlight = useRef<Promise<boolean> | null>(null);
  const previousTab = useRef<WorkspaceTab>('plan');
  const [dayNotes, setDayNotes] = useState<FamilyDayNote[]>([]);
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [partialLoadError, setPartialLoadError] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [, setFitKey] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<'left' | 'right' | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trackImportOpen, setTrackImportOpen] = useState(false);
  const [pendingDeleteTrackId, setPendingDeleteTrackId] = useState<string | null>(null);
  const [dayPickerPlaceId, setDayPickerPlaceId] = useState<string | null>(null);
  const [noteDayId, setNoteDayId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingRemoveItemId, setPendingRemoveItemId] = useState<string | null>(null);
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('plan');
  const [pendingExploreDeepLink, setPendingExploreDeepLink] = useState<ExploreDeepLink | null>(null);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [expensePrefill, setExpensePrefill] = useState<FamilyExpensePrefill | null>(null);

  const personId = useAuthStore((s) => s.personId);
  const categoriesEnabled = useFamilyFeatureStore((s) => s.isEnabled('workspace.place_categories'));

  const reloadPlaces = useCallback(async () => {
    if (!tripId) return;
    const next = await listTripPlaces(tripId);
    setPlaces(next);
    setFitKey((k) => k + 1);
  }, [tripId]);

  const reloadNotes = useCallback(async () => {
    if (!tripId) return;
    setDayNotes(await listDayNotes(tripId));
  }, [tripId]);

  const reloadTracks = useCallback(async () => {
    if (!tripId) return;
    const next = await listTripTracks(tripId);
    setTracks(next);
    setFitKey((k) => k + 1);
  }, [tripId]);

  const reloadSchedule = useCallback(async () => {
    if (!tripId) return;
    const next = await listScheduleItems(tripId);
    setScheduleItems(next);
  }, [tripId]);

  const [publishedSliceEpoch, setPublishedSliceEpoch] = useState(0);
  const reloadReservations = useCallback((): Promise<boolean> => {
    if (!tripId) return Promise.resolve(true);
    if (reservationInFlight.current) return reservationInFlight.current;
    const generation = ++reservationGeneration.current;
    const requestedTrip = tripId;
    reservationsStale.current = false;
    let task!: Promise<boolean>;
    task = (async () => {
      let ok = true;
      try {
        const [tripBookings, tripTransports] = await Promise.all([
          settled(familyFrontend.canonicalBookings(requestedTrip)),
          settled(familyFrontend.canonicalTransports(requestedTrip)),
        ]);
        if (generation !== reservationGeneration.current || requestedTrip !== tripId) return false;
        if (tripBookings.ok) setBookings(tripBookings.value);
        else ok = false;
        if (tripTransports.ok) setTransports(tripTransports.value);
        else ok = false;
        if (!ok) setPartialLoadError(true);
        return ok;
      } finally {
        if (reservationInFlight.current === task) reservationInFlight.current = null;
        if (reservationsStale.current && generation === reservationGeneration.current) void reloadReservations();
      }
    })();
    reservationInFlight.current = task;
    return task;
  }, [tripId]);

  const reloadItinerary = useCallback(async () => {
    await Promise.all([reloadPlaces(), reloadSchedule(), reloadNotes(), reloadReservations()]);
    setPublishedSliceEpoch((n) => n + 1);
  }, [reloadPlaces, reloadSchedule, reloadNotes, reloadReservations]);

  const reloadTripMeta = useCallback(async () => {
    if (!tripId) return;
    const [found, tripDays] = await Promise.all([fetchTripById(tripId), settled(listTripDays(tripId))]);
    if (found) setTrip(found);
    if (tripDays.ok) setDays(tripDays.value);
  }, [tripId]);

  const reloadActiveItinerary = useCallback(async () => {
    await Promise.all([reloadTripMeta(), reloadItinerary()]);
  }, [reloadTripMeta, reloadItinerary]);

  useFamilyItineraryRealtime(tripId, reloadActiveItinerary);

  const gov = useFamilyTripWorkspaceGovernance({
    tripId,
    personId,
    enabled: Boolean(tripId),
    onAfterPublish: reloadItinerary,
  });
  const canMutate = gov.canMutate;
  const canEditPublished = gov.canEditPublished;
  const legacyModeFor = (key: string) => (currentPlannerGovernancePort() ? ('deny' as const) : gov.writeModeFor(key));
  const placesMode = legacyModeFor('trip.places.manage');
  const scheduleMode = legacyModeFor('trip.schedule.manage');
  const reservationsMode = legacyModeFor('trip.reservations.manage');
  const costsMode = legacyModeFor('trip.costs.manage');
  const settleDirect = legacyModeFor('trip.costs.settle') === 'direct';
  const packingDirect = legacyModeFor('trip.packing.manage') === 'direct';
  const todosDirect = legacyModeFor('trip.todos.manage') === 'direct';
  const filesUpload = legacyModeFor('trip.files.upload') === 'direct';
  const filesMetadata = legacyModeFor('trip.files.metadata') === 'direct';
  const filesTrash = legacyModeFor('trip.files.trash') === 'direct';
  const canUsePlaces = placesMode === 'direct' || placesMode === 'draft';
  const canUseSchedule = scheduleMode === 'direct' || scheduleMode === 'draft';
  const canUseReservations = reservationsMode === 'direct' || reservationsMode === 'draft';
  const canUseCosts = costsMode === 'direct' || costsMode === 'draft';

  const toastDenied = retainToastDenied(canMutate, gov, toast, t);

  const placeCategories = useFamilyWorkspacePlaceCategories({
    familyId: trip?.family_id ?? null,
    tripId,
    placesMode,
    canUsePlaces,
    nextSortOrder: gov.nextSortOrder,
    enabled: categoriesEnabled,
    addDraftOp: gov.addDraftOp,
    onPlacesPatched: (placeId, patch) => {
      setPlaces((prev) => prev.map((p) => (p.id === placeId ? patch(p) : p)));
    },
    onDenied: () => toastDenied('draftable', placesMode),
  });

  useEffect(() => {
    if (!tripId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setPartialLoadError(false);
    setBookings(null);
    setTransports(null);
    reservationInFlight.current = null;
    reservationsStale.current = false;
    const reservationTask = reloadReservations();

    const daysP = syncTripDays(tripId)
      .catch(() => undefined)
      .then(() => settled(listTripDays(tripId)));

    Promise.all([
      fetchTripById(tripId),
      settled(listTripPlaces(tripId)),
      daysP,
      settled(listScheduleItems(tripId)),
      settled(listDayNotes(tripId)),
      settled(listTripCountryIds(tripId)),
      settled(listTripTracks(tripId)),
      reservationTask,
    ])
      .then(([found, tripPlaces, tripDays, schedule, notes, countries, tripTracks, reservationsOk]) => {
        if (cancelled) return;
        if (!found) {
          toast.error(t('trip.toast.notFound'));
          navigate('/dashboard');
          return;
        }
        const partial =
          !tripPlaces.ok ||
          !tripDays.ok ||
          !schedule.ok ||
          !notes.ok ||
          !countries.ok ||
          !tripTracks.ok ||
          reservationsOk === false;
        setTrip(found);
        setPlaces(tripPlaces.ok ? tripPlaces.value : []);
        setTracks(tripTracks.ok ? tripTracks.value : []);
        setDays(tripDays.ok ? tripDays.value : []);
        setScheduleItems(schedule.ok ? schedule.value : []);
        setDayNotes(notes.ok ? notes.value : []);
        setCountryIds(countries.ok ? countries.value : []);
        setFitKey((k) => k + 1);
        setPartialLoadError(partial);
        if (partial) toast.error(t('trip.toast.loadPartial'));
      })
      .catch(() => {
        if (!cancelled) {
          toast.error(t('trip.toast.loadFailed'));
          navigate('/dashboard');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, loadNonce]); // eslint-disable-line react-hooks/exhaustive-deps -- stable load key only

  useEffect(() => {
    if (gov.mutateGateError) toast.error(t('trip.toast.mutateGateError'));
  }, [gov.mutateGateError]); // eslint-disable-line react-hooks/exhaustive-deps

  const tripPlaceIds = useMemo(() => places.map((p) => p.id), [places]);
  const excludeIds = useMemo(() => places.map((p) => p.id), [places]);
  const placesById = useMemo(() => {
    const m = new Map<string, FamilyTripPlace>();
    for (const p of places) m.set(p.id, p);
    return m;
  }, [places]);
  const itemsByDayId = useMemo(() => groupScheduleByCivilDay(scheduleItems, days), [scheduleItems, days]);
  const timeline = useMemo(
    () =>
      projectFamilyDayTimeline({
        days,
        scheduleItems,
        notes: dayNotes,
        bookings: bookings ?? [],
        transports: transports ?? [],
        placesById,
      }),
    [days, scheduleItems, dayNotes, bookings, transports, placesById]
  );
  const notesByDay = useMemo(() => groupNotesByCivilDay(dayNotes), [dayNotes]);
  const noteDay = useMemo(() => days.find((d) => d.id === noteDayId) ?? null, [days, noteDayId]);
  const noteExisting = useMemo(
    () => (noteDay ? (notesByDay.get(noteDay.civilDay) ?? null) : null),
    [noteDay, notesByDay]
  );
  const noteDayIndexLabel = useMemo(() => retainedDayIndex(days, noteDay), [days, noteDay]);

  const toastWrite = retainToastWrite(toast, t);
  const toastShare = () => toast.error(t('trip.toast.shareLater'));
  const consumeExpensePrefill = useCallback(() => setExpensePrefill(null), []);

  const retainedItinerary = {
    canEditPublished,
    canUsePlaces,
    canUseSchedule,
    days,
    gov,
    itemsByDayId,
    noteDay,
    noteExisting,
    pendingDeleteId,
    pendingDeleteNoteId,
    pendingDeleteTrackId,
    pendingRemoveItemId,
    places,
    placesMode,
    pushUndo,
    reloadPlaces,
    scheduleItems,
    scheduleMode,
    selectedDayId,
    selectedPlaceId,
    setDayNotes,
    setDayPickerPlaceId,
    setDays,
    setFitKey,
    setMobileSidebarOpen,
    setNoteDayId,
    setPendingDeleteId,
    setPendingDeleteNoteId,
    setPendingDeleteTrackId,
    setPendingRemoveItemId,
    setPickerOpen,
    setPlaces,
    setScheduleItems,
    setSelectedDayId,
    setSelectedPlaceId,
    setTrackImportOpen,
    setTracks,
    t,
    timeline,
    toast,
    toastDenied,
    tripId,
  } satisfies RetainedItineraryContext;

  const requestDelete = retainRequestDelete(retainedItinerary);

  const confirmDelete = retainConfirmDelete(retainedItinerary);

  const openTrackImport = retainOpenTrackImport(retainedItinerary);

  const requestDeleteTrack = retainRequestDeleteTrack(retainedItinerary);

  const confirmDeleteTrack = retainConfirmDeleteTrack(retainedItinerary);

  const openAddPlace = retainOpenAddPlace(retainedItinerary);

  const handlePickCatalog = retainHandlePickCatalog(retainedItinerary);

  const assignPlaceToDay = useCallback(
    (placeId: string, dayId: string) =>
      retainAssignPlaceToDay({
        tripId,
        canUseSchedule,
        toastDenied,
        scheduleMode,
        places,
        days,
        toast,
        itemsByDayId,
        setDayPickerPlaceId,
        gov,
        t,
        setScheduleItems,
        pushUndo,
        setSelectedDayId,
      })(placeId, dayId),
    [tripId, canUseSchedule, gov, places, days, itemsByDayId, pushUndo, t, toast, scheduleMode]
  );

  const requestAssignToDay = retainRequestAssignToDay(retainedItinerary, assignPlaceToDay);

  const requestRemoveItem = retainRequestRemoveItem(retainedItinerary);

  const confirmRemoveItem = retainConfirmRemoveItem(retainedItinerary);

  const moveItem = retainMoveItem(retainedItinerary);

  const saveDayTitle = retainSaveDayTitle(retainedItinerary);

  const saveNote = retainSaveNote(retainedItinerary);

  const confirmDeleteNote = retainConfirmDeleteNote(retainedItinerary);

  useEffect(() => {
    const previous = previousTab.current;
    previousTab.current = activeTab;
    if (previous === 'buchungen' || previous === 'transports') reservationsStale.current = true;
    if (activeTab === 'plan' && reservationsStale.current) {
      familyFrontend.invalidateReservations(tripId);
      void reloadReservations().then(() => {
        const key = familyFrontend.knownViews()?.ids.register('trip', tripId);
        if (key && String(useCopiedTripStore.getState().trip?.id) === String(key))
          void useCopiedTripStore.getState().loadReservations(key);
      });
    }
  }, [activeTab, reloadReservations]);

  useLayoutEffect(() => {
    if (!trip || isLoading) return;
    return familyFrontend.attachController(
      { trip, days, places, schedule: scheduleItems, notes: dayNotes },
      { canMutate: gov.canMutate, outcomes: gov.actionOutcomes },
      gov.layer,
      gov.setLayer
    );
  }, [
    trip,
    isLoading,
    days,
    places,
    scheduleItems,
    dayNotes,
    gov.canMutate,
    gov.actionOutcomes,
    gov.layer,
    gov.setLayer,
  ]);

  useLayoutEffect(() => {
    if (!trip || isLoading) return;
    const controller = {
      core: { trip, days, places, schedule: scheduleItems, notes: dayNotes },
      gov,
      selectedDayId,
      selectedPlaceId,
      selectDay: setSelectedDayId,
      selectPlace: setSelectedPlaceId,
      setTab: setActiveTab,
      reload: reloadActiveItinerary,
      explore: {
        open: exploreOpen,
        pendingDeepLink: pendingExploreDeepLink,
        countryIds,
        tripPlaceIds,
        familyId: trip.family_id,
        personId,
        canMutate: placesMode === 'direct',
        writeMode: placesMode,
        writeModeFor: (kind: 'place' | 'experience' | 'food' | 'hotel') => {
          if (kind === 'place') return placesMode;
          if (kind === 'hotel') return reservationsMode;
          return scheduleMode;
        },
        openExplore,
        closeExplore,
        consumeDeepLink,
      },
      partialLoad: { failed: partialLoadError, retry: retryPartialLoad },
    };
    useFamilyUiPermissions.setState({ controller });
    return () => {
      if (useFamilyUiPermissions.getState().controller === controller)
        useFamilyUiPermissions.setState({ controller: null });
    };
  }, [
    trip,
    isLoading,
    days,
    places,
    scheduleItems,
    dayNotes,
    gov,
    selectedDayId,
    selectedPlaceId,
    reloadActiveItinerary,
    exploreOpen,
    pendingExploreDeepLink,
    countryIds,
    tripPlaceIds,
    personId,
    placesMode,
    reservationsMode,
    scheduleMode,
    partialLoadError,
  ]);

  useEffect(() => {
    let running = false,
      again = false,
      disposed = false;
    const reload = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          await reloadActiveItinerary();
        } while (again && !disposed);
      } catch {
        if (!disposed) toast.error(t('trip.toast.loadFailed'));
      } finally {
        running = false;
      }
    };
    const detach = familyFrontend.subscribe((id) => {
      if (id === tripId) void reload();
    });
    return () => {
      disposed = true;
      detach();
    };
  }, [tripId, reloadActiveItinerary, toast, t]);

  const openExplore = useCallback((link: ExploreDeepLink | null) => {
    setPendingExploreDeepLink(link);
    setExploreOpen(true);
  }, []);
  const closeExplore = useCallback(() => {
    setExploreOpen(false);
    setPendingExploreDeepLink(null);
  }, []);
  const consumeDeepLink = useCallback(() => setPendingExploreDeepLink(null), []);
  const retryPartialLoad = useCallback(() => setLoadNonce((n) => n + 1), []);

  if (isLoading) {
    return <UpstreamTripLoadingSplash title={trip?.title} />;
  }
  if (!trip) return null;

  return (
    <FamilyControllerContext.Provider
      value={{
        core: { trip, days, places, schedule: scheduleItems, notes: dayNotes },
        gov,
        selectedDayId,
        selectedPlaceId,
        selectDay: setSelectedDayId,
        selectPlace: setSelectedPlaceId,
        setTab: setActiveTab,
        reload: reloadActiveItinerary,
        explore: {
          open: exploreOpen,
          pendingDeepLink: pendingExploreDeepLink,
          countryIds,
          tripPlaceIds,
          familyId: trip.family_id,
          personId,
          canMutate: placesMode === 'direct',
          writeMode: placesMode,
          writeModeFor: (kind) => {
            if (kind === 'place') return placesMode;
            if (kind === 'hotel') return reservationsMode;
            return scheduleMode;
          },
          openExplore,
          closeExplore,
          consumeDeepLink,
        },
        partialLoad: { failed: partialLoadError, retry: retryPartialLoad },
      }}
    >
      {children}
    </FamilyControllerContext.Provider>
  );
}
