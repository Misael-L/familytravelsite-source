import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { day, item, itineraryFixture, place } from '../../../tests/helpers/controllerItineraryFixture';
import * as actions from './legacy/pages/familyTripWorkspace/controllerItineraryActions';
const io = vi.hoisted(() => ({
  deletePlace: vi.fn(),
  addPlace: vi.fn(),
  deleteTrack: vi.fn(),
  insert: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
  title: vi.fn(),
  saveNote: vi.fn(),
  deleteNote: vi.fn(),
}));
vi.mock('./legacy/data/supabase/tripPlaces', async (original) => ({
  ...(await original<typeof import('./legacy/data/supabase/tripPlaces')>()),
  deleteTripPlace: io.deletePlace,
  upsertTripPlace: io.addPlace,
}));
vi.mock('./legacy/data/supabase/tripTracks', async (original) => ({
  ...(await original<typeof import('./legacy/data/supabase/tripTracks')>()),
  deleteTripTrack: io.deleteTrack,
}));
vi.mock('./legacy/data/supabase/scheduleItems', async (original) => ({
  ...(await original<typeof import('./legacy/data/supabase/scheduleItems')>()),
  insertScheduleItem: io.insert,
  deleteScheduleItem: io.remove,
  updateScheduleSortOrders: io.reorder,
}));
vi.mock('./legacy/data/supabase/tripDays', async (original) => ({
  ...(await original<typeof import('./legacy/data/supabase/tripDays')>()),
  updateTripDayTitle: io.title,
}));
vi.mock('./legacy/data/supabase/dayNotes', async (original) => ({
  ...(await original<typeof import('./legacy/data/supabase/dayNotes')>()),
  upsertDayNote: io.saveNote,
  deleteDayNote: io.deleteNote,
}));
beforeEach(() => {
  for (const fn of Object.values(io)) {
    fn.mockReset();
    fn.mockResolvedValue(undefined);
  }
  io.addPlace.mockResolvedValue(place());
  io.insert.mockResolvedValue(item('new'));
  io.saveNote.mockResolvedValue({
    id: 'n1',
    tripId: 'trip',
    civilDay: '2026-08-12',
    body: 'new',
    icon: null,
    sortOrder: 0,
  });
});
afterEach(() => vi.restoreAllMocks());
const noIO = () => Object.values(io).forEach((fn) => expect(fn).not.toHaveBeenCalled());

describe('retained request gates and feedback', () => {
  it('constructs every retained callback without issuing requests or changing state', () => {
    const f = itineraryFixture();
    actions.retainConfirmDelete(f.ctx);
    actions.retainConfirmDeleteTrack(f.ctx);
    actions.retainHandlePickCatalog(f.ctx);
    actions.retainAssignPlaceToDay(f.ctx);
    actions.retainConfirmRemoveItem(f.ctx);
    actions.retainMoveItem(f.ctx);
    actions.retainSaveDayTitle(f.ctx);
    actions.retainSaveNote(f.ctx);
    actions.retainConfirmDeleteNote(f.ctx);
    noIO();
    expect(f.draft).not.toHaveBeenCalled();
    expect(f.cells.fit.value).toBe(0);
  });
  it.each([false, true])('preserves place, schedule and published request gates (allowed=%s)', (allowed) => {
    const f = itineraryFixture({ canUsePlaces: allowed, canUseSchedule: allowed, canEditPublished: allowed });
    actions.retainRequestDelete(f.ctx)('p2');
    actions.retainRequestRemoveItem(f.ctx)('s2');
    actions.retainRequestDeleteTrack(f.ctx)('track2');
    actions.retainOpenAddPlace(f.ctx)();
    actions.retainOpenTrackImport(f.ctx)();
    expect(f.cells.pendingPlace.value).toBe(allowed ? 'p2' : 'p1');
    expect(f.cells.pendingItem.value).toBe(allowed ? 's2' : 's1');
    expect(f.cells.picker.value).toBe(allowed);
    expect(f.cells.importTrack.value).toBe(allowed);
    expect(f.ctx.toastDenied).toHaveBeenCalledTimes(allowed ? 0 : 5);
    noIO();
  });
  it.each(['denied', 'empty', 'selected', 'picker'] as const)('keeps assignment request routing: %s', (kind) => {
    const f = itineraryFixture({
      canUseSchedule: kind !== 'denied',
      days: kind === 'empty' ? [] : [day()],
      selectedDayId: kind === 'selected' ? 'd1' : null,
    });
    const assign = vi.fn().mockResolvedValue(undefined);
    actions.retainRequestAssignToDay(f.ctx, assign)('p1');
    expect(assign).toHaveBeenCalledTimes(kind === 'selected' ? 1 : 0);
    expect(f.cells.dayPicker.value).toBe(kind === 'picker' ? 'p1' : null);
    noIO();
  });
  it.each(['import', 'export', 'reorder', 'edit', undefined] as const)(
    'retains the unavailable-action message for %s',
    (kind) => {
      const f = itineraryFixture();
      actions.retainToastWrite(f.toast, f.ctx.t)(kind);
      expect(f.toast.error).toHaveBeenCalledOnce();
      noIO();
    }
  );
  it('retains permission feedback defaults at invocation time and method receivers', () => {
    const f = itineraryFixture(),
      deny = actions.retainToastDenied(true, f.gov, f.toast, f.ctx.t);
    f.gov.layer = 'myDraft';
    deny('publishedOnly');
    expect(f.toast.info).toHaveBeenCalledWith('trip.governance.nudgePublished');
    deny('draftable', 'nudge');
    expect(f.toast.info).toHaveBeenLastCalledWith('trip.governance.nudgeDraft');
    deny();
    expect(f.toast.error).toHaveBeenCalledWith('trip.governance.denied');
    expect(f.toast.info.mock.contexts[0]).toBe(f.toast);
    noIO();
  });
});

describe('retained place and track actions', () => {
  it.each(['direct', 'draft'] as const)('keeps %s removal payloads and catalog separation', async (mode) => {
    const f = itineraryFixture({ placesMode: mode });
    await actions.retainConfirmDelete(f.ctx)();
    if (mode === 'draft') {
      expect(f.draft).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'trip_place',
          op: 'remove',
          targetId: 'p1',
          payload: { schema_version: 1, place_id: 'p1' },
        })
      );
      noIO();
      expect(f.cells.places.value).toHaveLength(2);
    } else {
      expect(io.deletePlace).toHaveBeenCalledWith('trip', 'p1');
      expect(f.cells.places.value.map((p) => p.id)).toEqual(['p2']);
      expect(f.cells.schedule.value).toEqual([]);
      expect(f.cells.selectedPlace.value).toBeNull();
    }
    expect(f.cells.pendingPlace.value).toBeNull();
  });
  it.each(['missing', 'failed'] as const)('keeps removal no-op/failure cleanup: %s', async (kind) => {
    const f = itineraryFixture({ pendingDeleteId: kind === 'missing' ? null : 'p1' });
    io.deletePlace.mockRejectedValueOnce(new Error('failed'));
    await actions.retainConfirmDelete(f.ctx)();
    if (kind === 'missing') noIO();
    else expect(f.toast.error).toHaveBeenCalledOnce();
    expect(f.cells.places.value).toHaveLength(2);
  });
  it.each(['direct', 'draft', 'duplicate', 'denied', 'failed', 'draft-refused'] as const)(
    'preserves catalog addition %s',
    async (kind) => {
      const f = itineraryFixture({
        placesMode: kind.startsWith('draft') ? 'draft' : 'direct',
        canUsePlaces: kind !== 'denied',
      });
      if (kind === 'duplicate') io.addPlace.mockResolvedValueOnce(null);
      if (kind === 'failed') io.addPlace.mockRejectedValueOnce(new Error('offline'));
      if (kind === 'draft-refused') f.draft.mockResolvedValueOnce(false);
      await actions.retainHandlePickCatalog(f.ctx)('p2');
      if (kind.startsWith('draft')) {
        noIO();
        expect(f.draft).toHaveBeenCalledWith(
          expect.objectContaining({
            module: 'trip_place',
            op: 'add',
            payload: { schema_version: 1, place_id: 'p2', is_primary: false },
          })
        );
      }
      if (kind === 'direct') {
        expect(f.ctx.reloadPlaces).toHaveBeenCalledOnce();
        expect(f.cells.selectedPlace.value).toBe('p2');
      }
      if (kind === 'denied') {
        noIO();
        expect(f.ctx.toastDenied).toHaveBeenCalledOnce();
      }
      if (kind === 'failed') expect(f.toast.error).toHaveBeenCalledOnce();
    }
  );
  it.each(['saved', 'failed', 'missing'] as const)('keeps track removal behavior: %s', async (kind) => {
    const f = itineraryFixture({ pendingDeleteTrackId: kind === 'missing' ? null : 'track' });
    if (kind === 'failed') io.deleteTrack.mockRejectedValueOnce(new Error('offline'));
    await actions.retainConfirmDeleteTrack(f.ctx)();
    expect(io.deleteTrack).toHaveBeenCalledTimes(kind === 'missing' ? 0 : 1);
    expect(f.cells.fit.value).toBe(kind === 'saved' ? 1 : 0);
    if (kind !== 'missing') expect(f.cells.pendingTrack.value).toBeNull();
  });
});

describe('retained day assignment and undo', () => {
  it.each(['no-trip', 'denied', 'missing-place', 'missing-day', 'duplicate'] as const)(
    'preserves assignment refusal: %s',
    async (kind) => {
      const f = itineraryFixture({
        tripId: kind === 'no-trip' ? '' : 'trip',
        canUseSchedule: kind !== 'denied',
        places: kind === 'missing-place' ? [] : [place()],
        days: kind === 'missing-day' ? [] : [day()],
        itemsByDayId: new Map([['d1', kind === 'duplicate' ? [item()] : []]]),
      });
      await actions.retainAssignPlaceToDay(f.ctx)('p1', 'd1');
      noIO();
    }
  );
  it('keeps the retained compatibility midnight payload and the original undo identity', async () => {
    const f = itineraryFixture();
    await actions.retainAssignPlaceToDay(f.ctx)('p1', 'd1');
    expect(io.insert).toHaveBeenCalledWith({
      tripId: 'trip',
      activity: 'p1',
      placeId: 'p1',
      startsAt: '2026-08-12T00:00:00.000Z',
      sortOrder: 0,
    });
    expect(f.cells.selectedDay.value).toBe('d1');
    expect(f.cells.schedule.value.map((r) => r.id)).toContain('new');
    await f.undos[0]();
    expect(io.remove).toHaveBeenCalledWith('new');
    expect(f.cells.schedule.value.map((r) => r.id)).not.toContain('new');
  });
  it.each([true, false])('keeps draft assignment staging without direct IO (accepted=%s)', async (accepted) => {
    const f = itineraryFixture({ scheduleMode: 'draft' });
    f.draft.mockResolvedValueOnce(accepted);
    await actions.retainAssignPlaceToDay(f.ctx)('p1', 'd1');
    noIO();
    expect(f.draft).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'plan_item',
        op: 'add',
        tripDayId: 'd1',
        civilDate: '2026-08-12',
        sortOrder: 20,
      })
    );
    expect(f.toast.success).toHaveBeenCalledTimes(accepted ? 1 : 0);
  });
  it.each(['direct', 'draft', 'missing', 'failed'] as const)('keeps visit removal and undo: %s', async (kind) => {
    const f = itineraryFixture({
      scheduleMode: kind === 'draft' ? 'draft' : 'direct',
      pendingRemoveItemId: kind === 'missing' ? 'absent' : 's1',
    });
    if (kind === 'failed') io.remove.mockRejectedValueOnce(new Error('offline'));
    await actions.retainConfirmRemoveItem(f.ctx)();
    if (kind === 'draft') {
      noIO();
      expect(f.draft).toHaveBeenCalledWith(expect.objectContaining({ targetId: 's1', op: 'remove' }));
    }
    if (kind === 'missing') noIO();
    if (kind === 'direct') {
      expect(f.cells.schedule.value.map((r) => r.id)).toEqual(['s2']);
      await f.undos[0]();
      expect(io.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          activity: 's1',
          placeId: 'p1',
          address: 'address',
          linkUrl: 'https://example.invalid',
        })
      );
    }
    if (kind === 'failed') expect(f.toast.error).toHaveBeenCalledOnce();
    expect(f.cells.pendingItem.value).toBeNull();
  });
  it.each(['direct', 'draft', 'refused', 'denied', 'missing', 'failed'] as const)(
    'keeps reorder and reverse-order undo: %s',
    async (kind) => {
      const f = itineraryFixture({
        scheduleMode: kind === 'draft' || kind === 'refused' ? 'draft' : 'direct',
        canUseSchedule: kind !== 'denied',
      });
      if (kind === 'refused') f.draft.mockResolvedValueOnce(false);
      if (kind === 'failed') io.reorder.mockRejectedValueOnce(new Error('failed'));
      await actions.retainMoveItem(f.ctx)('d1', kind === 'missing' ? 'absent' : 's1', 1);
      if (kind === 'draft' || kind === 'refused') {
        noIO();
        expect(f.draft).toHaveBeenCalledTimes(kind === 'draft' ? 2 : 1);
      }
      if (kind === 'direct') {
        expect(f.cells.schedule.value.map((r) => r.sortOrder)).toEqual([1, 0]);
        await f.undos[0]();
        expect(f.cells.schedule.value.map((r) => r.sortOrder)).toEqual([0, 1]);
      }
      if (kind === 'denied' || kind === 'missing') noIO();
      if (kind === 'failed') expect(f.toast.error).toHaveBeenCalledOnce();
    }
  );
});

describe('retained day metadata and map projections', () => {
  it.each(['direct', 'denied', 'failed'] as const)('preserves day-title behavior: %s', async (kind) => {
    const f = itineraryFixture({ canEditPublished: kind !== 'denied' });
    if (kind === 'failed') io.title.mockRejectedValueOnce(new Error('failed'));
    await actions.retainSaveDayTitle(f.ctx)('d1', 'Tuesday');
    expect(f.cells.days.value[0].title).toBe(kind === 'direct' ? 'Tuesday' : null);
    if (kind === 'denied') noIO();
  });
  it.each(['new', 'existing', 'draft', 'denied', 'missing', 'failed'] as const)(
    'keeps note ownership and staging: %s',
    async (kind) => {
      const existing = { id: 'n0', tripId: 'trip', civilDay: '2026-08-12', body: 'old', icon: 'pin', sortOrder: 3 };
      const f = itineraryFixture({
        noteExisting: kind === 'existing' || kind === 'draft' ? existing : null,
        scheduleMode: kind === 'draft' ? 'draft' : 'direct',
        canUseSchedule: kind !== 'denied',
        noteDay: kind === 'missing' ? null : day(),
      });
      if (kind === 'failed') io.saveNote.mockRejectedValueOnce(new Error('failed'));
      await actions.retainSaveNote(f.ctx)('new');
      if (kind === 'draft') {
        noIO();
        expect(f.draft).toHaveBeenCalledWith(
          expect.objectContaining({
            module: 'day_note',
            op: 'update',
            targetId: 'n0',
            payload: { schema_version: 1, body: 'new', icon: 'pin', sort_order: 3 },
          })
        );
      }
      if (kind === 'new' || kind === 'existing')
        expect(io.saveNote).toHaveBeenCalledWith(
          expect.objectContaining({ tripId: 'trip', civilDay: '2026-08-12', noteId: kind === 'existing' ? 'n0' : null })
        );
      if (kind === 'denied' || kind === 'missing') noIO();
    }
  );
  it.each(['direct', 'draft', 'missing', 'failed'] as const)('keeps note removal cleanup: %s', async (kind) => {
    const f = itineraryFixture({
      scheduleMode: kind === 'draft' ? 'draft' : 'direct',
      pendingDeleteNoteId: kind === 'missing' ? null : 'n1',
    });
    if (kind === 'failed') io.deleteNote.mockRejectedValueOnce(new Error('failed'));
    await actions.retainConfirmDeleteNote(f.ctx)();
    if (kind === 'draft') {
      noIO();
      expect(f.draft).toHaveBeenCalledWith(
        expect.objectContaining({ module: 'day_note', op: 'remove', targetId: 'n1' })
      );
    }
    if (kind === 'direct') expect(io.deleteNote).toHaveBeenCalledWith('n1');
    if (kind === 'missing') noIO();
    else expect(f.cells.pendingNote.value).toBeNull();
  });
  it('keeps day labels independent of input order and missing identities', () => {
    const days = [day('later', 4), day('first', 0)];
    expect(actions.retainedDayIndex(days, days[0])).toBe(2);
    expect(actions.retainedDayIndex(days, null)).toBe(1);
    expect(actions.retainedDayIndex([], day('missing', 9))).toBe(10);
  });
  it('preserves repeated map pins, empty/missing locations, categories and stored media URLs', () => {
    const p = place(),
      missing = place('missing');
    missing.lat = null;
    const map = new Map([
      ['d1', [item(), item('again'), { ...item('missing'), placeId: 'missing' }, { ...item('none'), placeId: null }]],
    ]);
    const markers = actions.retainedDayPlaces(
      'd1',
      map,
      new Map([
        ['p1', p],
        ['missing', missing],
      ]),
      true
    );
    expect(markers.map((m) => m.id)).toEqual(['p1', 'p1']);
    expect(markers[0].image_url).toBe(p.imageUrl);
    expect(markers[0].category_color).toBe('#123456');
    expect(actions.retainedDayPlaces(null, map, new Map(), true)).toEqual([]);
    expect(actions.retainedDayPlaces('absent', map, new Map(), true)).toEqual([]);
    expect(actions.retainedDayPlaces('d1', map, new Map([['p1', p]]), false)[0].category_color).toBeNull();
    expect(actions.retainedDayOrder('d1', map).p1).toEqual([1, 2]);
    expect(actions.retainedDayOrder(null, map)).toEqual({});
  });
  it('retains finite-coordinate filtering and zero coordinates without rewriting data', () => {
    const a = place(),
      b = place('bad');
    b.lng = Number.NaN;
    expect(actions.retainedPlaceCentroids([a, b, { ...place('none'), lat: null }])).toEqual([{ lat: 0, lng: 0 }]);
    expect(a.imageUrl).toBe('/catalog/variants/v1/thumb.webp');
  });
});
