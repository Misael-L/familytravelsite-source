import type { Dispatch, SetStateAction } from 'react';
import type { MapMarkerPlace } from '../../components/Map/mapMarkerPlace';
import { schedulePairMove, type FamilyDayTimelineDay } from '../../components/Planner/family/familyDayTimeline';
import type { useToast } from '../../components/shared/Toast';
import { deleteDayNote, upsertDayNote, type FamilyDayNote } from '../../data/supabase/dayNotes';
import {
  civilDayToUtcMidnightIso,
  deleteScheduleItem,
  insertScheduleItem,
  updateScheduleSortOrders,
  type FamilyScheduleItem,
  type groupScheduleByCivilDay,
} from '../../data/supabase/scheduleItems';
import {
  payloadDayNote,
  payloadPlanItem,
  payloadRemoveMarker,
  payloadTripPlaceAdd,
  payloadTripPlaceRemove,
  targetTableForModule,
} from '../../data/supabase/tripChangeRequests';
import { updateTripDayTitle, type FamilyTripDay } from '../../data/supabase/tripDays';
import { deleteTripPlace, upsertTripPlace, type FamilyTripPlace } from '../../data/supabase/tripPlaces';
import { deleteTripTrack, type FamilyTripTrack } from '../../data/supabase/tripTracks';
import type { usePlannerHistory } from '../../hooks/usePlannerHistory';
import type { useTranslation } from '../../i18n';
import type { UseFamilyTripWorkspaceGovernanceResult } from './useFamilyTripWorkspaceGovernance';
import type { WorkspaceWriteMode } from './workspaceGovernanceModel';
import { pinToMarker } from './workspacePlaceCategoryModel';
type Setter<T> = Dispatch<SetStateAction<T>>;
type ControllerToast = ReturnType<typeof useToast>;
type ControllerTranslation = ReturnType<typeof useTranslation>['t'];
type FamilyToastWriteKind = 'edit' | 'import' | 'export' | 'reorder';
/** Captured frame values for retained actions; construction never performs a write. */
export interface RetainedItineraryContext {
  readonly canEditPublished: boolean;
  readonly canUsePlaces: boolean;
  readonly canUseSchedule: boolean;
  readonly days: FamilyTripDay[];
  readonly gov: UseFamilyTripWorkspaceGovernanceResult;
  readonly itemsByDayId: ReturnType<typeof groupScheduleByCivilDay>;
  readonly noteDay: FamilyTripDay | null;
  readonly noteExisting: FamilyDayNote | null;
  readonly pendingDeleteId: string | null;
  readonly pendingDeleteNoteId: string | null;
  readonly pendingDeleteTrackId: string | null;
  readonly pendingRemoveItemId: string | null;
  readonly places: FamilyTripPlace[];
  readonly placesMode: WorkspaceWriteMode;
  readonly pushUndo: ReturnType<typeof usePlannerHistory>['pushUndo'];
  readonly reloadPlaces: () => Promise<void>;
  readonly scheduleItems: FamilyScheduleItem[];
  readonly scheduleMode: WorkspaceWriteMode;
  readonly selectedDayId: string | null;
  readonly selectedPlaceId: string | null;
  readonly setDayNotes: Setter<FamilyDayNote[]>;
  readonly setDayPickerPlaceId: Setter<string | null>;
  readonly setDays: Setter<FamilyTripDay[]>;
  readonly setFitKey: Setter<number>;
  readonly setMobileSidebarOpen: Setter<'left' | 'right' | null>;
  readonly setNoteDayId: Setter<string | null>;
  readonly setPendingDeleteId: Setter<string | null>;
  readonly setPendingDeleteNoteId: Setter<string | null>;
  readonly setPendingDeleteTrackId: Setter<string | null>;
  readonly setPendingRemoveItemId: Setter<string | null>;
  readonly setPickerOpen: Setter<boolean>;
  readonly setPlaces: Setter<FamilyTripPlace[]>;
  readonly setScheduleItems: Setter<FamilyScheduleItem[]>;
  readonly setSelectedDayId: Setter<string | null>;
  readonly setSelectedPlaceId: Setter<string | null>;
  readonly setTrackImportOpen: Setter<boolean>;
  readonly setTracks: Setter<FamilyTripTrack[]>;
  readonly t: ControllerTranslation;
  readonly timeline: FamilyDayTimelineDay[];
  readonly toast: ControllerToast;
  readonly toastDenied: (kind?: 'draftable' | 'publishedOnly', mode?: WorkspaceWriteMode) => void;
  readonly tripId: string;
}

export function retainRequestDelete(
  context: Pick<RetainedItineraryContext, 'canUsePlaces' | 'toastDenied' | 'placesMode' | 'setPendingDeleteId'>
) {
  const { canUsePlaces, toastDenied, placesMode, setPendingDeleteId } = context;
  return (placeId: string) => {
    if (!canUsePlaces) {
      toastDenied('draftable', placesMode);
      return;
    }
    setPendingDeleteId(placeId);
  };
}

export function retainOpenTrackImport(
  context: Pick<RetainedItineraryContext, 'canEditPublished' | 'toastDenied' | 'setTrackImportOpen'>
) {
  const { canEditPublished, toastDenied, setTrackImportOpen } = context;
  return () => {
    if (!canEditPublished) {
      toastDenied('publishedOnly');
      return;
    }
    setTrackImportOpen(true);
  };
}

export function retainRequestDeleteTrack(
  context: Pick<RetainedItineraryContext, 'canEditPublished' | 'toastDenied' | 'setPendingDeleteTrackId'>
) {
  const { canEditPublished, toastDenied, setPendingDeleteTrackId } = context;
  return (trackId: string) => {
    if (!canEditPublished) {
      toastDenied('publishedOnly');
      return;
    }
    setPendingDeleteTrackId(trackId);
  };
}

export function retainOpenAddPlace(
  context: Pick<RetainedItineraryContext, 'canUsePlaces' | 'toastDenied' | 'placesMode' | 'setPickerOpen'>
) {
  const { canUsePlaces, toastDenied, placesMode, setPickerOpen } = context;
  return () => {
    if (!canUsePlaces) {
      toastDenied('draftable', placesMode);
      return;
    }
    setPickerOpen(true);
  };
}

export function retainRequestAssignToDay(
  context: Pick<
    RetainedItineraryContext,
    'canUseSchedule' | 'toastDenied' | 'scheduleMode' | 'days' | 'toast' | 'selectedDayId' | 'setDayPickerPlaceId'
  >,
  assignPlaceToDay: (placeId: string, dayId: string) => Promise<void>
) {
  const { canUseSchedule, toastDenied, scheduleMode, days, toast, selectedDayId, setDayPickerPlaceId } = context;
  return (placeId: string) => {
    if (!canUseSchedule) {
      toastDenied('draftable', scheduleMode);
      return;
    }
    if (days.length === 0) {
      toast.error('This trip has no days yet');
      return;
    }
    if (selectedDayId) {
      void assignPlaceToDay(placeId, selectedDayId);
      return;
    }
    setDayPickerPlaceId(placeId);
  };
}

export function retainRequestRemoveItem(
  context: Pick<RetainedItineraryContext, 'canUseSchedule' | 'toastDenied' | 'scheduleMode' | 'setPendingRemoveItemId'>
) {
  const { canUseSchedule, toastDenied, scheduleMode, setPendingRemoveItemId } = context;
  return (itemId: string) => {
    if (!canUseSchedule) {
      toastDenied('draftable', scheduleMode);
      return;
    }
    setPendingRemoveItemId(itemId);
  };
}

export function retainConfirmDelete(
  context: Pick<
    RetainedItineraryContext,
    | 'tripId'
    | 'pendingDeleteId'
    | 'placesMode'
    | 'gov'
    | 'toast'
    | 't'
    | 'setPlaces'
    | 'setScheduleItems'
    | 'selectedPlaceId'
    | 'setSelectedPlaceId'
    | 'setFitKey'
    | 'setPendingDeleteId'
  >
) {
  const {
    tripId,
    pendingDeleteId,
    placesMode,
    gov,
    toast,
    t,
    setPlaces,
    setScheduleItems,
    selectedPlaceId,
    setSelectedPlaceId,
    setFitKey,
    setPendingDeleteId,
  } = context;
  return async () => {
    if (!tripId || !pendingDeleteId) return;
    const id = pendingDeleteId;
    try {
      if (placesMode === 'draft') {
        const ok = await gov.addDraftOp({
          module: 'trip_place',
          op: 'remove',
          payload: payloadTripPlaceRemove(id),
          targetTable: targetTableForModule('trip_place'),
          targetId: id,
          sortOrder: gov.nextSortOrder,
        });
        if (ok) toast.success(t('trip.governance.stagedRemove'));
        return;
      }
      await deleteTripPlace(tripId, id);
      setPlaces((prev) => prev.filter((p) => p.id !== id));
      setScheduleItems((prev) => prev.filter((s) => s.placeId !== id));
      if (selectedPlaceId === id) setSelectedPlaceId(null);
      setFitKey((k) => k + 1);
    } catch {
      toast.error('Could not remove this place');
    } finally {
      setPendingDeleteId(null);
    }
  };
}

export function retainConfirmDeleteTrack(
  context: Pick<
    RetainedItineraryContext,
    'pendingDeleteTrackId' | 'setTracks' | 'setFitKey' | 'toast' | 't' | 'setPendingDeleteTrackId'
  >
) {
  const { pendingDeleteTrackId, setTracks, setFitKey, toast, t, setPendingDeleteTrackId } = context;
  return async () => {
    if (!pendingDeleteTrackId) return;
    const id = pendingDeleteTrackId;
    try {
      await deleteTripTrack(id);
      setTracks((prev) => prev.filter((tr) => tr.id !== id));
      setFitKey((k) => k + 1);
    } catch {
      toast.error(t('places.importFileError'));
    } finally {
      setPendingDeleteTrackId(null);
    }
  };
}

export function retainHandlePickCatalog(
  context: Pick<
    RetainedItineraryContext,
    | 'tripId'
    | 'canUsePlaces'
    | 'toastDenied'
    | 'placesMode'
    | 'gov'
    | 'toast'
    | 't'
    | 'setPickerOpen'
    | 'setMobileSidebarOpen'
    | 'reloadPlaces'
    | 'setSelectedPlaceId'
  >
) {
  const {
    tripId,
    canUsePlaces,
    toastDenied,
    placesMode,
    gov,
    toast,
    t,
    setPickerOpen,
    setMobileSidebarOpen,
    reloadPlaces,
    setSelectedPlaceId,
  } = context;
  return async (placeId: string) => {
    if (!tripId) return;
    if (!canUsePlaces) {
      toastDenied('draftable', placesMode);
      return;
    }
    try {
      if (placesMode === 'draft') {
        const ok = await gov.addDraftOp({
          module: 'trip_place',
          op: 'add',
          payload: payloadTripPlaceAdd(placeId),
          targetTable: targetTableForModule('trip_place'),
          sortOrder: gov.nextSortOrder,
        });
        if (ok) {
          toast.success(t('trip.governance.staged'));
          setPickerOpen(false);
          setMobileSidebarOpen(null);
        }
        return;
      }
      const inserted = await upsertTripPlace(tripId, placeId);
      if (!inserted) {
        toast.info('That place is already on this trip');
        setPickerOpen(false);
        return;
      }
      await reloadPlaces();
      setSelectedPlaceId(placeId);
      setPickerOpen(false);
      setMobileSidebarOpen(null);
    } catch {
      toast.error('Could not add this place');
    }
  };
}

export function retainAssignPlaceToDay(
  context: Pick<
    RetainedItineraryContext,
    | 'tripId'
    | 'canUseSchedule'
    | 'toastDenied'
    | 'scheduleMode'
    | 'places'
    | 'days'
    | 'toast'
    | 'itemsByDayId'
    | 'setDayPickerPlaceId'
    | 'gov'
    | 't'
    | 'setScheduleItems'
    | 'pushUndo'
    | 'setSelectedDayId'
  >
) {
  const {
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
  } = context;
  return async (placeId: string, dayId: string) => {
    if (!tripId) return;
    if (!canUseSchedule) {
      toastDenied('draftable', scheduleMode);
      return;
    }
    const place = places.find((p) => p.id === placeId);
    const day = days.find((d) => d.id === dayId);
    if (!place || !day) {
      toast.error('Could not assign this place');
      return;
    }
    const dayItems = itemsByDayId.get(dayId) ?? [];
    if (dayItems.some((i) => i.placeId === placeId)) {
      toast.info('That place is already on this day');
      setDayPickerPlaceId(null);
      return;
    }
    const sortOrder = dayItems.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1;
    const startsAt = civilDayToUtcMidnightIso(day.civilDay);
    try {
      if (scheduleMode === 'draft') {
        const ok = await gov.addDraftOp({
          module: 'plan_item',
          op: 'add',
          payload: payloadPlanItem({
            activity: place.name,
            placeId,
            startsAt,
            sortOrder,
          }),
          tripDayId: day.id,
          civilDate: day.civilDay,
          targetTable: targetTableForModule('plan_item'),
          sortOrder: gov.nextSortOrder,
        });
        if (ok) {
          toast.success(t('trip.governance.staged'));
          setDayPickerPlaceId(null);
        }
        return;
      }
      const created = await insertScheduleItem({
        tripId,
        activity: place.name,
        placeId,
        startsAt,
        sortOrder,
      });
      setScheduleItems((prev) => [...prev, created]);
      pushUndo(t('undo.assignPlace'), async () => {
        await deleteScheduleItem(created.id);
        setScheduleItems((prev) => prev.filter((s) => s.id !== created.id));
      });
      setSelectedDayId(dayId);
      setDayPickerPlaceId(null);
      toast.success('Place assigned to day');
    } catch {
      toast.error('Could not assign this place');
    }
  };
}

export function retainConfirmRemoveItem(
  context: Pick<
    RetainedItineraryContext,
    | 'pendingRemoveItemId'
    | 'scheduleItems'
    | 'setPendingRemoveItemId'
    | 'scheduleMode'
    | 'gov'
    | 'toast'
    | 't'
    | 'setScheduleItems'
    | 'pushUndo'
    | 'tripId'
  >
) {
  const {
    pendingRemoveItemId,
    scheduleItems,
    setPendingRemoveItemId,
    scheduleMode,
    gov,
    toast,
    t,
    setScheduleItems,
    pushUndo,
    tripId,
  } = context;
  return async () => {
    if (!pendingRemoveItemId) return;
    const item = scheduleItems.find((s) => s.id === pendingRemoveItemId);
    if (!item) {
      setPendingRemoveItemId(null);
      return;
    }
    try {
      if (scheduleMode === 'draft') {
        const ok = await gov.addDraftOp({
          module: 'plan_item',
          op: 'remove',
          payload: payloadRemoveMarker(),
          targetTable: targetTableForModule('plan_item'),
          targetId: item.id,
          sortOrder: gov.nextSortOrder,
        });
        if (ok) toast.success(t('trip.governance.stagedRemove'));
        return;
      }
      await deleteScheduleItem(item.id);
      setScheduleItems((prev) => prev.filter((s) => s.id !== item.id));
      pushUndo(t('undo.removeAssignment'), async () => {
        if (!tripId) return;
        const restored = await insertScheduleItem({
          tripId,
          activity: item.activity,
          placeId: item.placeId,
          address: item.address,
          startsAt: item.startsAt,
          sortOrder: item.sortOrder,
          experienceId: item.experienceId,
          foodId: item.foodId,
          linkUrl: item.linkUrl,
        });
        setScheduleItems((prev) => [...prev, restored]);
      });
      toast.success('Removed from day');
    } catch {
      toast.error('Could not remove from day');
    } finally {
      setPendingRemoveItemId(null);
    }
  };
}

export function retainMoveItem(
  context: Pick<
    RetainedItineraryContext,
    | 'canUseSchedule'
    | 'toastDenied'
    | 'scheduleMode'
    | 'timeline'
    | 'scheduleItems'
    | 'gov'
    | 'toast'
    | 't'
    | 'setScheduleItems'
    | 'pushUndo'
  >
) {
  const {
    canUseSchedule,
    toastDenied,
    scheduleMode,
    timeline,
    scheduleItems,
    gov,
    toast,
    t,
    setScheduleItems,
    pushUndo,
  } = context;
  return async (dayId: string, itemId: string, direction: -1 | 1) => {
    if (!canUseSchedule) {
      toastDenied('draftable', scheduleMode);
      return;
    }
    const rows = timeline.find((day) => day.dayId === dayId)?.rows ?? [];
    const updates = schedulePairMove(rows, itemId, direction);
    if (!updates) return;
    const previous = updates.map((update) => {
      const current = scheduleItems.find((item) => item.id === update.id);
      return { id: update.id, sortOrder: current?.sortOrder ?? update.sortOrder };
    });
    try {
      if (scheduleMode === 'draft') {
        let sort = gov.nextSortOrder;
        for (const u of updates) {
          const current = scheduleItems.find((item) => item.id === u.id);
          if (!current || current.sortOrder === u.sortOrder) continue;
          const ok = await gov.addDraftOp({
            module: 'plan_item',
            op: 'update',
            payload: payloadPlanItem({
              activity: current.activity,
              placeId: current.placeId,
              startsAt: current.startsAt,
              sortOrder: u.sortOrder,
              experienceId: current.experienceId,
              foodId: current.foodId,
            }),
            targetTable: targetTableForModule('plan_item'),
            targetId: u.id,
            sortOrder: sort,
          });
          if (!ok) return;
          sort += 1;
        }
        toast.success(t('trip.governance.stagedUpdate'));
        return;
      }
      await updateScheduleSortOrders(updates);
      setScheduleItems((prev) =>
        prev.map((s) => {
          const u = updates.find((x) => x.id === s.id);
          return u ? { ...s, sortOrder: u.sortOrder } : s;
        })
      );
      pushUndo(t('undo.reorder'), async () => {
        await updateScheduleSortOrders(previous);
        setScheduleItems((prev) =>
          prev.map((s) => {
            const u = previous.find((x) => x.id === s.id);
            return u ? { ...s, sortOrder: u.sortOrder } : s;
          })
        );
      });
    } catch {
      toast.error('Could not reorder');
    }
  };
}

export function retainSaveDayTitle(
  context: Pick<RetainedItineraryContext, 'canEditPublished' | 'toastDenied' | 'setDays' | 'toast'>
) {
  const { canEditPublished, toastDenied, setDays, toast } = context;
  return async (dayId: string, title: string | null) => {
    if (!canEditPublished) {
      toastDenied('publishedOnly');
      return;
    }
    try {
      await updateTripDayTitle(dayId, title);
      setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, title } : d)));
    } catch {
      toast.error('Could not update day title');
    }
  };
}

export function retainSaveNote(
  context: Pick<
    RetainedItineraryContext,
    | 'tripId'
    | 'noteDay'
    | 'canUseSchedule'
    | 'toastDenied'
    | 'scheduleMode'
    | 'gov'
    | 'noteExisting'
    | 'toast'
    | 't'
    | 'setNoteDayId'
    | 'setDayNotes'
  >
) {
  const {
    tripId,
    noteDay,
    canUseSchedule,
    toastDenied,
    scheduleMode,
    gov,
    noteExisting,
    toast,
    t,
    setNoteDayId,
    setDayNotes,
  } = context;
  return async (body: string) => {
    if (!tripId || !noteDay) return;
    if (!canUseSchedule) {
      toastDenied('draftable', scheduleMode);
      return;
    }
    try {
      if (scheduleMode === 'draft') {
        const ok = await gov.addDraftOp({
          module: 'day_note',
          op: noteExisting ? 'update' : 'add',
          payload: payloadDayNote({ body, icon: noteExisting?.icon ?? null, sortOrder: noteExisting?.sortOrder ?? 0 }),
          tripDayId: noteDay.id,
          civilDate: noteDay.civilDay,
          targetTable: targetTableForModule('day_note'),
          targetId: noteExisting?.id ?? null,
          sortOrder: gov.nextSortOrder,
        });
        if (ok) {
          toast.success(t('trip.governance.staged'));
          setNoteDayId(null);
        }
        return;
      }
      const saved = await upsertDayNote({
        tripId,
        civilDay: noteDay.civilDay,
        body,
        noteId: noteExisting?.id ?? null,
      });
      setDayNotes((prev) => {
        const withoutId = prev.filter((n) => n.id !== saved.id);
        if (noteExisting) return [...withoutId, saved];
        return [...withoutId.filter((n) => n.civilDay !== saved.civilDay), saved];
      });
      setNoteDayId(null);
      toast.success(t('common.saved'));
    } catch {
      toast.error('Could not save note');
    }
  };
}

export function retainConfirmDeleteNote(
  context: Pick<
    RetainedItineraryContext,
    | 'pendingDeleteNoteId'
    | 'scheduleMode'
    | 'gov'
    | 'toast'
    | 't'
    | 'setDayNotes'
    | 'setNoteDayId'
    | 'setPendingDeleteNoteId'
  >
) {
  const { pendingDeleteNoteId, scheduleMode, gov, toast, t, setDayNotes, setNoteDayId, setPendingDeleteNoteId } =
    context;
  return async () => {
    if (!pendingDeleteNoteId) return;
    const id = pendingDeleteNoteId;
    try {
      if (scheduleMode === 'draft') {
        const ok = await gov.addDraftOp({
          module: 'day_note',
          op: 'remove',
          payload: payloadRemoveMarker(),
          targetTable: targetTableForModule('day_note'),
          targetId: id,
          sortOrder: gov.nextSortOrder,
        });
        if (ok) toast.success(t('trip.governance.stagedRemove'));
        return;
      }
      await deleteDayNote(id);
      setDayNotes((prev) => prev.filter((n) => n.id !== id));
      setNoteDayId(null);
      toast.success('Note deleted');
    } catch {
      toast.error('Could not delete note');
    } finally {
      setPendingDeleteNoteId(null);
    }
  };
}

export function retainToastDenied(
  canMutate: boolean,
  gov: UseFamilyTripWorkspaceGovernanceResult,
  toast: ControllerToast,
  t: ControllerTranslation
) {
  return (kind: 'draftable' | 'publishedOnly' = 'draftable', mode: WorkspaceWriteMode = gov.writeMode) => {
    if (kind === 'publishedOnly') {
      if (canMutate && gov.layer === 'myDraft') toast.info(t('trip.governance.nudgePublished'));
      else toast.error(t('trip.explore.add.hofOnly'));
      return;
    }
    if (mode === 'nudge') toast.info(t('trip.governance.nudgeDraft'));
    else toast.error(t('trip.governance.denied'));
  };
}

export function retainToastWrite(toast: ControllerToast, t: ControllerTranslation) {
  return (kind?: FamilyToastWriteKind) => {
    if (kind === 'import') toast.error(t('trip.toast.importLater'));
    else if (kind === 'export') toast.error(t('trip.toast.exportLater'));
    else if (kind === 'reorder') toast.error(t('trip.toast.reorderDaysLater'));
    else toast.error(t('trip.toast.editPlaceLater'));
  };
}

export function retainedDayIndex(days: FamilyTripDay[], noteDay: FamilyTripDay | null) {
  if (!noteDay) return 1;
  const sorted = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
  const idx = sorted.findIndex((d) => d.id === noteDay.id);
  return idx >= 0 ? idx + 1 : noteDay.dayIndex + 1;
}

export function retainedDayPlaces(
  selectedDayId: string | null,
  itemsByDayId: RetainedItineraryContext['itemsByDayId'],
  placesById: Map<string, FamilyTripPlace>,
  categoriesEnabled: boolean
) {
  if (!selectedDayId) return [] as MapMarkerPlace[];
  const items = itemsByDayId.get(selectedDayId) ?? [];
  const markers: MapMarkerPlace[] = [];
  for (const item of items) {
    if (!item.placeId) continue;
    const place = placesById.get(item.placeId);
    if (!place) continue;
    const m = pinToMarker(place, { categoriesEnabled });
    if (m) markers.push(m);
  }
  return markers;
}

export function retainedDayOrder(selectedDayId: string | null, itemsByDayId: RetainedItineraryContext['itemsByDayId']) {
  const map: Record<string, number[]> = {};
  if (!selectedDayId) return map;
  const items = itemsByDayId.get(selectedDayId) ?? [];
  items.forEach((item, idx) => {
    if (!item.placeId) return;
    const list = map[item.placeId] ?? [];
    list.push(idx + 1);
    map[item.placeId] = list;
  });
  return map;
}

export function retainedPlaceCentroids(places: FamilyTripPlace[]) {
  return places
    .filter(
      (p): p is FamilyTripPlace & { lat: number; lng: number } =>
        p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    )
    .map((p) => ({ lat: p.lat, lng: p.lng }));
}
