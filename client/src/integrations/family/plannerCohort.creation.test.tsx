// organize-imports-ignore
// sort-imports-ignore
// Initialize the original hoisted SDK mocks before loading suite consumers.
import '../../../tests/helpers/familyPlannerCohort/state';
import * as catalogDiscovery from '@family/backend/supabase/catalogDiscovery';
import { describe, expect, it, vi } from 'vitest';
import { load, required } from '../../../tests/helpers/familyPlannerCohort/core';
import { beginNew, newData } from '../../../tests/helpers/familyPlannerCohort/formActions';
import { NativeCreationForm } from '../../../tests/helpers/familyPlannerCohort/forms';
import '../../../tests/helpers/familyPlannerCohort/setup';
import { cohortState, db, toast, trip, uuid } from '../../../tests/helpers/familyPlannerCohort/state';
import { act, fireEvent, render, renderHook, screen, waitFor } from '../../../tests/helpers/render';
import { offlineDb } from '../../db/offlineDb';
import { useDayPlanEdits } from '../../pages/tripPlanner/useDayPlanEdits';
import { currentPlannerCreationPort } from '../../repo/plannerCreationPort';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { setForcedOffline } from '../../sync/networkMode';

describe('P04g actual native creation, scheduling and retry cohort', () => {
  it('concurrent differing submissions from one form cannot create two locations', async () => {
    const c = await beginNew(true);
    const replies = await Promise.allSettled([
      cohortState.cohort.creation.createForm(c, newData()),
      cohortState.cohort.creation.createForm(c, newData({ name: 'Competing form' })),
    ]);
    expect(replies.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(cohortState.creationRows).toHaveLength(1);
  });
  it('another original creation pending in the native queue blocks a fresh form save', async () => {
    const c = await beginNew(),
      { packet } = await cohortState.cohort.creation.prepareForm(c, newData());
    await mutationQueue.enqueue({
      id: packet.operation_id,
      tripId: c.tripId,
      resource: 'places',
      entityId: 1,
      method: 'POST',
      url: `/trips/${trip}/family/planner-create-command`,
      body: packet,
    });
    await expect(
      cohortState.cohort.creation.createForm(c, newData({ name: 'Competing queued create' }))
    ).rejects.toThrow();
    expect(cohortState.creationRows).toHaveLength(0);
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });

  it('changed fields after a lost acknowledgement cannot create a second location', async () => {
    const c = await beginNew(true);
    cohortState.loseAck = true;
    await expect(cohortState.cohort.creation.createForm(c, newData())).rejects.toThrow();
    await expect(
      cohortState.cohort.creation.createForm(c, newData({ name: 'Edited after interruption' }))
    ).rejects.toThrow();
    expect(cohortState.creationRows).toHaveLength(1);
    await cohortState.cohort.creation.createForm(c, newData());
    expect(cohortState.creationRows).toHaveLength(1);
  });
  it('an explicit validation rejection lets the user correct and resubmit the same open form', async () => {
    const c = await beginNew(true);
    await expect(cohortState.cohort.creation.createForm(c, newData({ place_time: '19:00' }))).rejects.toThrow();
    await cohortState.cohort.creation.createForm(c, newData());
    expect(cohortState.creationRows).toHaveLength(1);
  });

  it.each([false, true])('New place native modal (day=%s) saves then closes and reloads', async (onDay) => {
    await load();
    const mounted = render(<NativeCreationForm onDay={onDay} />);
    fireEvent.click(screen.getByText('New native place'));
    await screen.findByPlaceholderText(/Personal notes/i);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name *' }), { target: { value: 'New native location' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));
    await waitFor(() =>
      expect(useTripStore.getState().places.some((p) => p.name === 'New native location')).toBe(true)
    );
    await waitFor(() => expect(screen.queryByPlaceholderText(/Personal notes/i)).not.toBeInTheDocument());
    mounted.unmount();
    expect(cohortState.creationRows[0].visit === null).toBe(!onDay);
    expect(cohortState.creationRows).toHaveLength(1);
    await load();
    expect(useTripStore.getState().places).toHaveLength(2);
  });
  it.each([false, true])(
    'an open form retains its original day when the caller changes its context (scheduled=%s)',
    async (scheduled) => {
      await load();
      const state = useTripStore.getState();
      const selected = state.days[0];
      const port = required(currentPlannerCreationPort());
      const original = {
        tripId: required(state.trip).id,
        dayId: scheduled ? selected.id : null,
        position: null,
      };
      const context = { ...original };
      const ready = port.beginForm(context);
      context.dayId = scheduled ? null : selected.id;
      await ready;

      await expect(port.createForm(context, newData())).rejects.toMatchObject({ code: 'creation_context_changed' });
      expect(db.rpc.mock.calls.filter(([name]) => name === 'create_family_native_plan_v1')).toEqual([]);
      expect(await offlineDb.mutationQueue.count()).toBe(0);

      await port.createForm(original, newData());
      const calls = db.rpc.mock.calls.filter(([name]) => name === 'create_family_native_plan_v1');
      const canonicalDay = (await cohortState.repo.views()).ids.uuid('day', selected.id);
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toMatchObject({
        p_form: { day: scheduled ? { id: canonicalDay, civil_day: selected.date } : null },
      });
      expect(cohortState.creationRows).toHaveLength(1);
      expect(cohortState.creationRows[0].visit === null).toBe(!scheduled);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it('a mismatched submit context cannot become valid by changing it while the form resolves', async () => {
    const original = await beginNew();
    const port = required(currentPlannerCreationPort());
    const context = { ...original, dayId: useTripStore.getState().days[0].id };
    const saving = port.createForm(context, newData());
    Object.assign(context, original);

    await expect(saving).rejects.toMatchObject({ code: 'creation_context_changed' });
    expect(db.rpc.mock.calls.filter(([name]) => name === 'create_family_native_plan_v1')).toEqual([]);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('day-scoped creation saves pool and visit in one HTTP/RPC then reloads', async () => {
    const c = await beginNew(true);
    await required(currentPlannerCreationPort()).createForm(c, newData());
    expect(cohortState.creationRows).toHaveLength(1);
    expect(cohortState.creationRows[0].visit).not.toBeNull();
    expect(db.rpc.mock.calls.filter(([n]) => n === 'create_family_native_plan_v1')).toHaveLength(1);
    expect(useTripStore.getState().assignments[useTripStore.getState().days[0].id]).toHaveLength(3);
  });
  it('actual native Add to day hook and store support deliberate repeat visits without legacy undo or routing writes', async () => {
    await load();
    const st = useTripStore.getState(),
      undo = vi.fn(),
      reanchor = vi.fn(),
      route = vi.fn();
    const { result } = renderHook(() =>
      useDayPlanEdits({
        tripId: required(st.trip).id,
        tripActions: useTripStore.getState(),
        toast,
        t: (k: string) => k,
        selectedDayId: st.days[0].id,
        storedAssignments: st.assignments,
        places: st.places,
        tripAccommodations: [],
        isTourPlace: () => false,
        pushUndo: undo,
        reloadTourPlaceIds: vi.fn(),
        updateRouteForDay: route,
        roadtripVias: { byDay: {}, reanchor },
        roadtripStopsOf: () => [],
        viasAfterInsert: vi.fn(),
      } as unknown as Parameters<typeof useDayPlanEdits>[0])
    );
    await act(async () => {
      expect(await result.current.handleAssignToDay(st.places[0].id)).toBe(true);
      expect(await result.current.handleAssignToDay(st.places[0].id)).toBe(true);
    });
    expect(cohortState.creationRows).toHaveLength(2);
    expect(new Set(cohortState.creationRows.map((r) => required(r.visit).id)).size).toBe(2);
    expect(undo).not.toHaveBeenCalled();
    expect(reanchor).not.toHaveBeenCalled();
    expect(route).not.toHaveBeenCalled();
  });
  it('lost acknowledgement retries the identical new-form operation without another location or visit', async () => {
    const c = await beginNew(true);
    cohortState.loseAck = true;
    await expect(cohortState.cohort.creation.createForm(c, newData())).rejects.toThrow();
    await cohortState.cohort.creation.createForm(c, newData());
    expect(cohortState.creationRows).toHaveLength(1);
    const calls = db.rpc.mock.calls.filter(([n]) => n === 'create_family_native_plan_v1');
    expect(calls[0][1]).toEqual(calls[1][1]);
  });
  it('failed Add to day keeps original intent, successful next click creates another visit', async () => {
    await load();
    const s = useTripStore.getState(),
      args = [required(s.trip).id, s.days[0].id, s.places[0].id] as const;
    cohortState.loseAck = true;
    await expect(s.assignPlaceToDay(...args)).rejects.toThrow();
    await s.assignPlaceToDay(...args);
    expect(cohortState.creationRows).toHaveLength(1);
    await s.assignPlaceToDay(...args);
    expect(cohortState.creationRows).toHaveLength(2);
  });
  it('private new-day intent is visible only in My draft and never generic offline tables', async () => {
    await load('myDraft');
    const c = {
      tripId: required(useTripStore.getState().trip).id,
      dayId: useTripStore.getState().days[0].id,
      position: null,
    };
    await cohortState.cohort.creation.beginForm(c);
    const r = await cohortState.cohort.creation.createForm(c, newData());
    expect(r.state).toBe('draft');
    expect(cohortState.creationRows[0].private).toBe(true);
    expect(await offlineDb.places.count()).toBe(0);
    await load('published');
    expect(useTripStore.getState().places).toHaveLength(1);
  });
  it.each(['_pendingFiles', '_pendingImage', 'google_place_id', 'image_url', '_serviceStop'])(
    'refuses unsupported %s before any partial save or payload mutation',
    async (key) => {
      const c = await beginNew(),
        data = newData({
          [key]:
            key === '_pendingFiles'
              ? [new File(['x'], 'original.pdf')]
              : key === '_pendingImage'
                ? { fileId: 1 }
                : key === '_serviceStop'
                  ? { dayId: 1, position: 0 }
                  : 'provider-value',
        }),
        copy = { ...data };
      await expect(cohortState.cohort.creation.createForm(c, data)).rejects.toThrow();
      expect(data).toEqual(copy);
      expect(cohortState.creationRows).toHaveLength(0);
    }
  );
  it('offline refusal preserves the open form and sends nothing', async () => {
    const c = await beginNew();
    setForcedOffline(true);
    await expect(cohortState.cohort.creation.createForm(c, newData())).rejects.toThrow();
    expect(cohortState.creationRows).toHaveLength(0);
  });
  it('pool times are refused before the RPC, not discarded', async () => {
    const c = await beginNew();
    await expect(cohortState.cohort.creation.createForm(c, newData({ place_time: '19:00' }))).rejects.toThrow();
    expect(cohortState.creationRows).toHaveLength(0);
  });
  it('manual timed day creation is refused atomically at the real coordinator boundary', async () => {
    const c = await beginNew(true);
    await expect(cohortState.cohort.creation.createForm(c, newData({ place_time: '19:00' }))).rejects.toThrow();
    expect(cohortState.creationRows).toHaveLength(0);
  });
  it.each(['account', 'person', 'family', 'layer', 'source', 'close'])(
    'a changed %s cannot rebind the original new form',
    async (kind) => {
      const c = await beginNew();
      if (kind === 'account') cohortState.session = { ...cohortState.session, userId: uuid(997) };
      if (kind === 'person') cohortState.session = { ...cohortState.session, personId: uuid(998) };
      if (kind === 'family') cohortState.session = { ...cohortState.session, familyId: uuid(999) };
      if (['account', 'person', 'family'].includes(kind)) cohortState.repo.acceptSession(cohortState.session);
      if (kind === 'layer') cohortState.repo.setLayer(trip, 'myDraft');
      if (kind === 'source') cohortState.source = 'https://other.supabase.invalid';
      if (kind === 'close') cohortState.cohort.creation.cancelForm();
      await expect(cohortState.cohort.creation.createForm(c, newData())).rejects.toThrow();
      expect(cohortState.creationRows).toHaveLength(0);
    }
  );
  it('permission rejection preserves original form and retry identity', async () => {
    const c = await beginNew();
    cohortState.deny = { code: '42501' };
    await expect(cohortState.cohort.creation.createForm(c, newData())).rejects.toThrow();
    cohortState.deny = null;
    await cohortState.cohort.creation.createForm(c, newData());
    expect(cohortState.creationRows).toHaveLength(1);
  });
  it('nonappend insertion is refused before native optimistic state or writes', async () => {
    await load();
    const st = useTripStore.getState(),
      before = JSON.stringify(st.assignments);
    await expect(st.assignPlaceToDay(required(st.trip).id, st.days[0].id, st.places[0].id, 0)).rejects.toThrow();
    expect(JSON.stringify(useTripStore.getState().assignments)).toBe(before);
    expect(cohortState.creationRows).toHaveLength(0);
  });
  it('generic IndexedDB flush holds legacy creation rows for dedicated recovery', async () => {
    const c = await beginNew(true),
      { packet } = await cohortState.cohort.creation.prepareForm(c, newData());
    setAuthed(true);
    await mutationQueue.enqueue({
      id: packet.operation_id,
      tripId: required(useTripStore.getState().trip).id,
      resource: 'places',
      entityId: 1,
      method: 'POST',
      url: `/trips/${trip}/family/planner-create-command`,
      body: packet,
    });
    await mutationQueue.flush();
    expect(cohortState.creationRows).toHaveLength(0);
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it('foreign-source queue intent is parked without contacting another API', async () => {
    const c = await beginNew(),
      { packet } = await cohortState.cohort.creation.prepareForm(c, newData());
    packet.source_url = 'https://foreign.supabase.invalid';
    setAuthed(true);
    await mutationQueue.enqueue({
      id: packet.operation_id,
      tripId: required(useTripStore.getState().trip).id,
      resource: 'places',
      entityId: 1,
      method: 'POST',
      url: `/trips/${trip}/family/planner-create-command`,
      body: packet,
    });
    await mutationQueue.flush();
    expect(cohortState.creationRows).toHaveLength(0);
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
});

describe('F5 typed catalog creation through the native observed cohort', () => {
  const picked = (): catalogDiscovery.CatalogHit => ({
    kind: 'food',
    id: uuid(900),
    name: 'Catalog venue',
    latitude: 19.4,
    longitude: -99.1,
    address: 'Venue address',
    website: null,
    phone: null,
    description: 'Catalog reference description',
    contextPlaceId: uuid(901),
    countryId: uuid(902),
    typeLabel: 'Restaurant',
    thumbUrl: null,
    heroUrl: null,
  });
  const catalogData = () =>
    newData({
      name: 'Catalog venue',
      lat: 19.4,
      lng: -99.1,
      address: 'Venue address',
      osm_id: 'catalog:food:' + uuid(900),
    });
  it('retains the venue identity rather than saving a manual copy or its parent city', async () => {
    vi.spyOn(catalogDiscovery, 'catalogDetail').mockResolvedValue(picked());
    const c = await beginNew();
    await cohortState.cohort.creation.createForm(c, catalogData());
    const calls = db.rpc.mock.calls.filter(([name]) => name === 'create_family_native_plan_v1');
    expect(calls).toHaveLength(1);
    expect(calls[0][1].p_form.location.create).toEqual({
      source: { kind: 'food', id: uuid(900) },
      notes: null,
      family_place_category_id: null,
    });
    expect(cohortState.creationRows[0].location.source).toEqual({ kind: 'food', id: uuid(900) });
    expect(useTripStore.getState().places.find((p) => p.name === 'Catalog venue')?.osm_id).toBe(
      'catalog:food:' + uuid(900)
    );
  });
  it('freezes the catalog observation and reuses an original after an acknowledgement is lost', async () => {
    const detail = vi.spyOn(catalogDiscovery, 'catalogDetail').mockResolvedValue(picked());
    const c = await beginNew(true);
    cohortState.loseAck = true;
    await expect(cohortState.cohort.creation.createForm(c, catalogData())).rejects.toThrow();
    detail.mockResolvedValue({ ...picked(), name: 'Changed catalog title' });
    await cohortState.cohort.creation.createForm(c, catalogData());
    const calls = db.rpc.mock.calls.filter(([name]) => name === 'create_family_native_plan_v1');
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toEqual(calls[1][1]);
    expect(cohortState.creationRows).toHaveLength(1);
    expect(detail).toHaveBeenCalledTimes(1);
  });
  it('does not duplicate a catalog venue already in the pool; repeat visits use the existing location', async () => {
    const c = await beginNew();
    await expect(
      cohortState.cohort.creation.createForm(c, newData({ osm_id: 'catalog:food:' + uuid(4) }))
    ).rejects.toMatchObject({
      code: 'catalog_already_saved',
    });
    expect(db.rpc.mock.calls.filter(([name]) => name === 'create_family_native_plan_v1')).toHaveLength(0);
    const st = useTripStore.getState();
    await st.assignPlaceToDay(required(st.trip).id, st.days[0].id, st.places[0].id);
    await st.assignPlaceToDay(required(st.trip).id, st.days[0].id, st.places[0].id);
    expect(cohortState.creationRows).toHaveLength(2);
    expect(new Set(cohortState.creationRows.map((r) => r.location.id)).size).toBe(1);
    expect(new Set(cohortState.creationRows.map((r) => required(r.visit).id)).size).toBe(2);
  });
  it('rejects a retired catalog observation before issuing a save', async () => {
    let finish!: (hit: catalogDiscovery.CatalogHit) => void;
    vi.spyOn(catalogDiscovery, 'catalogDetail').mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const c = await beginNew();
    const pending = cohortState.cohort.creation.createForm(c, catalogData());
    await waitFor(() => expect(finish).toBeDefined());
    cohortState.cohort.creation.cancelForm();
    finish(picked());
    await expect(pending).rejects.toThrow();
    expect(db.rpc.mock.calls.filter(([name]) => name === 'create_family_native_plan_v1')).toHaveLength(0);
  });
});
