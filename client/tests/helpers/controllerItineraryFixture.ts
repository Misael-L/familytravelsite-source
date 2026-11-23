import type { SetStateAction } from 'react';
import { vi } from 'vitest';
import { projectFamilyDayTimeline } from '../../src/integrations/family/legacy/components/Planner/family/familyDayTimeline';
import type { FamilyDayNote } from '../../src/integrations/family/legacy/data/supabase/dayNotes';
import type { FamilyScheduleItem } from '../../src/integrations/family/legacy/data/supabase/scheduleItems';
import type { FamilyTripDay } from '../../src/integrations/family/legacy/data/supabase/tripDays';
import type { FamilyTripPlace } from '../../src/integrations/family/legacy/data/supabase/tripPlaces';
import type { FamilyTripTrack } from '../../src/integrations/family/legacy/data/supabase/tripTracks';
import type { RetainedItineraryContext } from '../../src/integrations/family/legacy/pages/familyTripWorkspace/controllerItineraryActions';

export const day = (id = 'd1', dayIndex = 0): FamilyTripDay => ({
  id,
  tripId: 'trip',
  civilDay: '2026-08-12',
  dayIndex,
  title: null,
});
export function place(id = 'p1'): FamilyTripPlace {
  return {
    id,
    name: id,
    lat: 0,
    lng: 0,
    notes: null,
    timeZone: 'America/Mexico_City',
    countryId: null,
    placeTypeId: null,
    isPrimary: false,
    imageUrl: '/catalog/variants/v1/thumb.webp',
    familyPlaceCategoryId: 'category',
    familyPlaceCategoryName: 'City',
    familyPlaceCategoryColor: '#123456',
    familyPlaceCategoryIcon: 'map',
  };
}
export function item(id = 's1', sortOrder = 0): FamilyScheduleItem {
  return {
    id,
    tripId: 'trip',
    activity: id,
    placeId: 'p1',
    startsAt: '2026-08-12T00:00:00.000Z',
    endsAt: null,
    address: 'address',
    timeZone: 'America/Mexico_City',
    sortOrder,
    experienceId: null,
    foodId: null,
    linkUrl: 'https://example.invalid',
  };
}
function cell<T>(initial: T) {
  let value = initial;
  const set = vi.fn((next: SetStateAction<T>) => {
    value = typeof next === 'function' ? (next as (previous: T) => T)(value) : next;
  });
  return {
    get value() {
      return value;
    },
    set,
  };
}
export function itineraryFixture(over: Partial<RetainedItineraryContext> = {}) {
  const cells = {
    places: cell([place(), place('p2')]),
    schedule: cell([item(), item('s2', 1)]),
    tracks: cell<FamilyTripTrack[]>([]),
    days: cell([day()]),
    notes: cell<FamilyDayNote[]>([]),
    selectedPlace: cell<string | null>('p1'),
    selectedDay: cell<string | null>(null),
    fit: cell(0),
    picker: cell(false),
    mobile: cell<'left' | 'right' | null>(null),
    dayPicker: cell<string | null>(null),
    noteDay: cell<string | null>(null),
    pendingPlace: cell<string | null>('p1'),
    pendingTrack: cell<string | null>('track'),
    pendingItem: cell<string | null>('s1'),
    pendingNote: cell<string | null>('n1'),
    importTrack: cell(false),
  };
  const undos: (() => Promise<void> | void)[] = [];
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
  const draft = vi.fn<RetainedItineraryContext['gov']['addDraftOp']>().mockResolvedValue(true);
  const gov = {
    layer: 'published',
    canMutate: true,
    writeMode: 'direct',
    nextSortOrder: 20,
    addDraftOp: draft,
  } as unknown as RetainedItineraryContext['gov'];
  const ctx: RetainedItineraryContext = {
    tripId: 'trip',
    gov,
    toast,
    t: (key: string) => key,
    placesMode: 'direct',
    scheduleMode: 'direct',
    canUsePlaces: true,
    canUseSchedule: true,
    canEditPublished: true,
    places: cells.places.value,
    days: cells.days.value,
    scheduleItems: cells.schedule.value,
    itemsByDayId: new Map([['d1', []]]),
    timeline: projectFamilyDayTimeline({
      days: cells.days.value,
      scheduleItems: cells.schedule.value,
      notes: [],
      bookings: [],
      transports: [],
    }),
    noteDay: day(),
    noteExisting: null,
    selectedDayId: null,
    selectedPlaceId: 'p1',
    pendingDeleteId: 'p1',
    pendingDeleteTrackId: 'track',
    pendingRemoveItemId: 's1',
    pendingDeleteNoteId: 'n1',
    pushUndo: vi.fn((_label, undo) => {
      undos.push(undo);
    }),
    reloadPlaces: vi.fn().mockResolvedValue(undefined),
    toastDenied: vi.fn(),
    setPlaces: cells.places.set,
    setScheduleItems: cells.schedule.set,
    setTracks: cells.tracks.set,
    setDays: cells.days.set,
    setDayNotes: cells.notes.set,
    setSelectedPlaceId: cells.selectedPlace.set,
    setSelectedDayId: cells.selectedDay.set,
    setFitKey: cells.fit.set,
    setPickerOpen: cells.picker.set,
    setMobileSidebarOpen: cells.mobile.set,
    setDayPickerPlaceId: cells.dayPicker.set,
    setNoteDayId: cells.noteDay.set,
    setPendingDeleteId: cells.pendingPlace.set,
    setPendingDeleteTrackId: cells.pendingTrack.set,
    setPendingRemoveItemId: cells.pendingItem.set,
    setPendingDeleteNoteId: cells.pendingNote.set,
    setTrackImportOpen: cells.importTrack.set,
    ...over,
  };
  return { ctx, cells, toast, gov, draft, undos };
}
