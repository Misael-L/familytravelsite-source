// organize-imports-ignore
// sort-imports-ignore
// Initialize the original hoisted SDK mocks before loading suite consumers.
import '../../../tests/helpers/familyPlannerCohort/state';
import { Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { canonicalPackingList } from '../../../tests/helpers/familyPacking';
import { bookingFixture } from '../../../tests/helpers/familyPlannerCohort/contents';
import {
  cohortCommand,
  context,
  expectVisibleRetained,
  form,
  heldCohortView,
  load,
  request,
  required,
  startupTaskGate,
} from '../../../tests/helpers/familyPlannerCohort/core';
import { NativeEditor } from '../../../tests/helpers/familyPlannerCohort/forms';
import '../../../tests/helpers/familyPlannerCohort/setup';
import { cohortState, db, family, trip, uuid, visit } from '../../../tests/helpers/familyPlannerCohort/state';
import { canonicalTask } from '../../../tests/helpers/familyTasks';
import { assertStartupAncillaryReadJoins } from '../../../tests/helpers/plannerStartupRead';
import { act, fireEvent, render, renderHook, screen, waitFor } from '../../../tests/helpers/render';
import { offlineNoticeKey } from '../../components/Settings/useOfflineSettings';
import { useTaskForm } from '../../components/Todo/useTaskForm';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { assignmentRepo } from '../../repo/assignmentRepo';
import { dayNoteRepo } from '../../repo/dayNoteRepo';
import { currentPlannerEditorPort } from '../../repo/plannerEditorPort';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { setForcedOffline } from '../../sync/networkMode';
import { tripSyncManager } from '../../sync/tripSyncManager';
import { captureWriteSession } from '../../sync/writeSession';
import { FamilyPlannerReadProblem } from './FamilyPlannerReadProblem';
import { retainPackingIntent } from './packingIntentQueue';
import { currentPlannerBoundaryOwner } from './plannerBoundaryOwner';
import { plannerCacheDb } from './plannerCache';
import type { VisitFormContext } from './visitFormContract';

describe('P04f native planner load, observed editor and queue cohort', () => {
  it('loads real Trip store from one new planner view without calling legacy core or populating generic caches', async () => {
    await load();
    const s = useTripStore.getState();
    expect(s.trip?.title).toBe('Mexico fixture');
    expect(s.places[0].description).toBe('Shared catalog description');
    expect(s.places[0].notes).toBeNull();
    expect(s.assignments[String(s.days[0].id)]).toHaveLength(2);
    expect(cohortState.repo.core).not.toHaveBeenCalled();
    expect(await offlineDb.places.count()).toBe(0);
    expect(await offlineDb.days.count()).toBe(0);
  });
  it('the HTTP bundle and actual store load use the same venue and explicit visit identities', async () => {
    await load();
    const b = (await cohortState.client.get(`/trips/${trip}/bundle`)).data,
      s = useTripStore.getState();
    expect(b.places).toEqual(s.places);
    expect(b.days).toEqual(s.days);
    expect(b.days[0].assignments[0].place_id).toBe(b.places[0].id);
    expect(b.days[0].assignments[1].place_id).toBe(b.places[0].id);
  });
  it('actual native opener and Update callback save location, chosen visit notes and clocks atomically', async () => {
    await load();
    render(<NativeEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Open native editor' }));
    await screen.findByRole('button', { name: /^Update$/i });
    await screen.findByDisplayValue('Actual cafe'); // Wait for the native form's initial values before editing.
    fireEvent.change(screen.getByPlaceholderText(/Personal notes/i), { target: { value: 'Saved venue note' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Notes for this day' }), {
      target: { value: 'Only selected occurrence' },
    });
    const start = screen.getByRole('textbox', { name: /^Start$/i });
    fireEvent.focus(start);
    fireEvent.change(start, { target: { value: '19:00' } });
    fireEvent.blur(start);
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(screen.queryByPlaceholderText(/Personal notes/i)).toBeNull());
    expect(db.rpc.mock.calls.filter((c) => c[0] === 'save_family_trip_visit_form_v1')).toHaveLength(1);
    expect(
      db.rpc.mock.calls.some((c) =>
        ['mutate_family_trip_location_v1', 'set_family_trip_visit_timing_v1'].includes(c[0])
      )
    ).toBe(false);
    expect(cohortState.published.notes).toBe('Saved venue note');
    const s = useTripStore.getState(),
      visits = s.assignments[String(s.days[0].id)];
    expect(s.places[0].notes).toBe('Saved venue note');
    expect(visits[0].notes).toBe('Only selected occurrence');
    expect(visits[0].assignment_time).toBe('19:00');
    expect(visits[1].notes).toBe('Independent repeat note');
    expect(visits[1].assignment_time).toBeNull();
    const { data } = await cohortState.client.get<VisitFormContext>(`/trips/${trip}/family/visits/${visit}/form`);
    expect(data.visit).toMatchObject({
      start_local: '2027-04-01T19:00:00.000000',
      starts_at: '2027-04-02T01:00:00.000Z',
      ends_at: null,
      time_zone: 'America/Mexico_City',
    });
  });
  it('native pool editor with repeated occurrences changes only the saved note', async () => {
    await load();
    render(<NativeEditor selected={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open native editor' }));
    await screen.findByRole('button', { name: /^Update$/i });
    expect(screen.queryByRole('textbox', { name: 'Notes for this day' })).toBeNull();
    await screen.findByDisplayValue('Actual cafe'); // Edit only once this opening has seeded its native form.
    fireEvent.change(screen.getByPlaceholderText(/Personal notes/i), { target: { value: 'Pool only' } });
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(screen.queryByPlaceholderText(/Personal notes/i)).toBeNull());
    expect(cohortState.published.notes).toBe('Pool only');
    expect(cohortState.publishedVisit.explanations).toBeNull();
    expect(db.rpc.mock.calls.filter((c) => c[0] === 'save_family_trip_visit_form_v1')).toHaveLength(0);
  });
  it('private save reloads the private store and switching to published never displays its notes', async () => {
    await load('myDraft');
    const r = request(),
      e = await cohortState.cohort.openEditor(r);
    await cohortState.cohort.saveForm(r, form(e, { notes: 'Private venue', assignment_notes: 'Private visit' }));
    expect(useTripStore.getState().places[0].notes).toBe('Private venue');
    expect(cohortState.published.notes).toBeNull();
    expect(cohortState.publishedVisit.explanations).toBeNull();
    await load('published');
    expect(useTripStore.getState().places[0].notes).toBeNull();
    expect(await offlineDb.places.count()).toBe(0);
    expect(await offlineDb.days.count()).toBe(0);
  });
  it.each([
    ['published', true],
    ['published', false],
    ['myDraft', true],
    ['myDraft', false],
  ] as const)('restores the catalog name in %s when clearing a label (selected visit: %s)', async (layer, selected) => {
    cohortState.published.name = 'Saved cafe label';
    await load(layer);
    const r = request(selected);
    const editor = await cohortState.cohort.openEditor(r);
    expect(editor.place.name).toBe('Saved cafe label');
    await cohortState.cohort.saveForm(r, form(editor, { name: '' }));
    expect(useTripStore.getState().places[0].name).toBe('Actual cafe');
    expect((await cohortState.cohort.openEditor(request(selected))).place.name).toBe('Actual cafe');
    await load('published');
    expect(useTripStore.getState().places[0].name).toBe(layer === 'published' ? 'Actual cafe' : 'Saved cafe label');
  });
  it('keeps existing draft location and visit notes when editing only the visit time', async () => {
    await load('myDraft');
    const r = request();
    const editor = await cohortState.cohort.openEditor(r);
    await cohortState.cohort.saveForm(
      r,
      form(editor, { notes: 'Keep venue note', assignment_notes: 'Keep visit note' })
    );
    const reopenedRequest = request();
    const reopened = await cohortState.cohort.openEditor(reopenedRequest);
    await cohortState.cohort.saveForm(reopenedRequest, form(reopened, { place_time: '19:30' }));

    const saved = useTripStore.getState();
    const visits = saved.assignments[String(saved.days[0].id)];
    expect(saved.places[0]).toMatchObject({ notes: 'Keep venue note', description: 'Shared catalog description' });
    expect(visits[0]).toMatchObject({ notes: 'Keep visit note', assignment_time: '19:30' });
    expect(visits[1]).toMatchObject({ notes: 'Independent repeat note', assignment_time: null });
    await load('published');
    const published = useTripStore.getState();
    expect(published.places[0].notes).toBeNull();
    expect(published.assignments[String(published.days[0].id)][0]).toMatchObject({
      notes: null,
      assignment_time: null,
    });
  });
  it('a current full load is published atomically and never exposes mixed Trip/planner state', async () => {
    const seen: unknown[] = [];
    const off = useTripStore.subscribe((s) => {
      if (!s.isLoading && s.trip)
        seen.push([s.trip.id, s.places.length, s.days.length, Object.values(s.assignments).flat().length]);
    });
    await load();
    off();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([required(useTripStore.getState().trip).id, 1, 1, 2]);
  });
  it('a required ancillary failure does not become an empty successful Trip', async () => {
    cohortState.readonlyFailure = true;
    await expect(load()).rejects.toThrow('Required tab read failed');
    expect(useTripStore.getState().trip).toBe(cohortState.tripBeforeLoad);
    expect(useTripStore.getState().error).toBe('Required tab read failed');
  });
  it('a malformed ancillary response refuses the complete HTTP bundle', async () => {
    cohortState.malformed = true;
    await expect(cohortState.client.get(`/trips/${trip}/bundle`)).rejects.toMatchObject({ response: { status: 502 } });
  });
  it.each(['account', 'family', 'person', 'layer', 'source'])(
    'refuses an open/save after original %s changes without rebinding it',
    async (kind) => {
      await load();
      const r = request(),
        e = await cohortState.cohort.openEditor(r);
      if (kind === 'account') cohortState.session = { ...cohortState.session, userId: uuid(98) };
      if (kind === 'family') cohortState.session = { ...cohortState.session, familyId: uuid(96) };
      if (kind === 'person') cohortState.session = { ...cohortState.session, personId: uuid(97) };
      if (kind === 'layer') cohortState.repo.setLayer(trip, 'myDraft');
      if (kind === 'source') cohortState.source = 'https://other.supabase.invalid';
      cohortState.repo.acceptSession(cohortState.session);
      await expect(cohortState.cohort.saveForm(r, form(e, { notes: 'Must not write' }))).rejects.toBeDefined();
      expect(cohortState.published.notes).toBeNull();
      expect(db.rpc.mock.calls.some((c) => c[0] === 'save_family_trip_visit_form_v1')).toBe(false);
    }
  );
  it('cancelled native opens cannot publish an editor after asynchronous reads finish', async () => {
    await load();
    const originalRpc = required(db.rpc.getMockImplementation());
    let finish!: (v: unknown) => void;
    db.rpc.mockImplementation((name, args) =>
      name === 'get_family_trip_visit_form_v1'
        ? new Promise((r) => {
            finish = r;
          })
        : originalRpc(name, args)
    );
    const opening = cohortState.cohort.openEditor(request());
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    required(currentPlannerEditorPort()).cancelEditor();
    const fail = expect(opening).rejects.toMatchObject({ status: 409 });
    finish({ data: context('published'), error: null });
    await fail;
  });
  it('refuses upload fields before mutating or stripping their original form values', async () => {
    await load();
    const r = request(),
      e = await cohortState.cohort.openEditor(r),
      files = [new File(['x'], 'keep.pdf')],
      data = form(e, { notes: 'Must not partially save', _pendingFiles: files });
    await expect(cohortState.cohort.saveForm(r, data)).rejects.toMatchObject({ status: 409 });
    expect(data._pendingFiles).toBe(files);
    expect(cohortState.published.notes).toBeNull();
  });
  it('an offline save leaves form values, native queue and all published records intact', async () => {
    await load();
    const r = request(),
      e = await cohortState.cohort.openEditor(r),
      data = form(e, { assignment_notes: 'Keep this' });
    setForcedOffline(true);
    await expect(cohortState.cohort.saveForm(r, data)).rejects.toMatchObject({ status: 409 });
    expect(data.assignment_notes).toBe('Keep this');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(cohortState.publishedVisit.explanations).toBeNull();
  });
  it('lost acknowledgement checks the original receipt without replaying or overwriting a newer visit', async () => {
    await load();
    const r = request(),
      e = await cohortState.cohort.openEditor(r),
      data = form(e, { assignment_notes: 'First intended note' });
    cohortState.loseAck = true;
    await expect(cohortState.cohort.saveForm(r, data)).rejects.toBeDefined();
    cohortState.publishedVisit = {
      ...cohortState.publishedVisit,
      revision: cohortState.publishedVisit.revision + 1,
      explanations: 'Newer edit',
    };
    await cohortState.cohort.saveForm(r, data);
    const calls = db.rpc.mock.calls.filter((c) => c[0] === 'save_family_trip_visit_form_v1');
    expect(calls).toHaveLength(1);
    expect(db.rpc.mock.calls.some((c) => c[0] === 'get_family_trip_visit_form_receipt_v1')).toBe(true);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(cohortState.publishedVisit.explanations).toBe('Newer edit');
  });
  it('parks the exact old native request and refuses a conflicting new observed edit', async () => {
    await load();
    const r = request(),
      e = await cohortState.cohort.openEditor(r);
    const body = { notes: 'Original legacy intent' };
    await mutationQueue.enqueue({
      id: uuid(77),
      tripId: r.tripId,
      method: 'PUT',
      url: `/trips/${r.tripId}/places/${r.place.id}`,
      body,
      resource: 'places',
      entityId: r.place.id,
    });
    const before = await offlineDb.mutationQueue.toArray();
    await expect(cohortState.cohort.saveForm(r, form(e, { notes: 'New' }))).rejects.toMatchObject({
      code: 'planner_pending_legacy_work',
    });
    expect(await offlineDb.mutationQueue.toArray()).toEqual(before);
    await mutationQueue.flush();
    const parked = await offlineDb.mutationQueue.get(uuid(77));
    expect(parked?.status).toBe('conflict');
    expect(parked?.body).toEqual(body);
    expect(cohortState.published.notes).toBeNull();
  });
  it('an older resource-bearing editor row remains protected instead of bypassing verified native recovery', async () => {
    await load();
    const r = request(),
      e = await cohortState.cohort.openEditor(r),
      prepared = await cohortState.cohort.prepare(r, form(e, { assignment_notes: 'Queued typed intent' }));
    await mutationQueue.enqueue({
      id: prepared.body.operation_id,
      tripId: r.tripId,
      method: 'POST',
      url: prepared.url,
      body: prepared.body,
      resource: 'assignments',
      entityId: required(r.assignmentId),
    });
    await mutationQueue.flush();
    const retained = await offlineDb.mutationQueue.get(prepared.body.operation_id);
    expect(retained?.body).toEqual(prepared.body);
    expect(retained?.status).toBe('conflict');
    expect(cohortState.publishedVisit.explanations).toBeNull();
    expect(db.rpc.mock.calls.some((c) => c[0] === 'save_family_trip_visit_form_v1')).toBe(false);
  });
  it('a new form queued in another original person scope remains parked without a save RPC', async () => {
    await load();
    const r = request(),
      e = await cohortState.cohort.openEditor(r),
      prepared = await cohortState.cohort.prepare(r, form(e, { assignment_notes: 'Retained original scope' }));
    await mutationQueue.enqueue({
      id: prepared.body.operation_id,
      tripId: r.tripId,
      method: 'POST',
      url: prepared.url,
      body: prepared.body,
      resource: 'assignments',
      entityId: required(r.assignmentId),
    });
    cohortState.session = { ...cohortState.session, personId: uuid(97) };
    cohortState.repo.acceptSession(cohortState.session);
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(prepared.body.operation_id))?.body).toEqual(prepared.body);
    expect(cohortState.publishedVisit.explanations).toBeNull();
  });
  it('native assignment/day-note offline paths stop before optimistic cache or queue mutation', async () => {
    await load();
    const r = request();
    setForcedOffline(true);
    await expect(assignmentRepo.create(r.tripId, useTripStore.getState().days[0].id, r.place)).rejects.toThrow(
      'not cut over'
    );
    await expect(
      dayNoteRepo.create(r.tripId, useTripStore.getState().days[0].id, { text: 'No partial note' })
    ).rejects.toThrow('not cut over');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(await offlineDb.days.count()).toBe(0);
  });
  it('unsupported native mutators are refused before the legacy application can act on new IDs', async () => {
    for (const route of ['places', 'days', 'assignments', 'reservations', 'budget', 'files'])
      await expect(cohortState.client.post(`/trips/${trip}/${route}`, {})).rejects.toMatchObject({
        response: { status: 409 },
      });
    expect(db.rpc.mock.calls.some((c) => String(c[0]).startsWith('save_'))).toBe(false);
  });
  it('scoped refresh works offline for an already open Trip, but full Trip reload refuses to fake missing resources', async () => {
    await load();
    const before = useTripStore.getState().places;
    setForcedOffline(true);
    await useTripStore.getState().refreshDays(trip);
    expect(useTripStore.getState().places).toEqual(before);
    await expect(useTripStore.getState().loadTrip(trip)).rejects.toMatchObject({ status: 503 });
    expect(useTripStore.getState().trip).toBe(cohortState.tripBeforeLoad);
  });
  it('queued editor packets cannot switch API source even when cloned IDs match', async () => {
    await load();
    const r = request(),
      e = await cohortState.cohort.openEditor(r),
      p = await cohortState.cohort.prepare(r, form(e, { assignment_notes: 'Preserve original' }));
    p.body.source_url = 'https://other.supabase.invalid';
    await mutationQueue.enqueue({
      id: p.body.operation_id,
      tripId: r.tripId,
      method: 'POST',
      url: p.url,
      body: p.body,
      resource: 'assignments',
      entityId: required(r.assignmentId),
    });
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(p.body.operation_id))?.body).toEqual(p.body);
    expect(cohortState.publishedVisit.explanations).toBeNull();
  });
  it('tampered operation identity in a command envelope is refused before RPC', async () => {
    await load();
    const r = request(),
      e = await cohortState.cohort.openEditor(r),
      p = await cohortState.cohort.prepare(r, form(e, { notes: 'No write' }));
    p.body.operation_id = uuid(333);
    await expect(cohortState.client.post(p.url, p.body)).rejects.toMatchObject({ response: { status: 409 } });
    expect(cohortState.published.notes).toBeNull();
  });
  it('retained booking catalog selectors are bridged to the saved location without altering source records', async () => {
    cohortState.published.source = { kind: 'place', id: uuid(444) };
    const ids = (await cohortState.repo.views()).ids,
      old = ids.register('place', uuid(444));
    cohortState.bookingRows = [bookingFixture({ place_id: uuid(444) })];
    await load();
    const saved = useTripStore.getState().places[0].id;
    expect(useTripStore.getState().reservations[0].place_id).toBe(saved);
    expect(cohortState.bookingRows[0].record.place_id).toBe(uuid(444));
    expect(saved).not.toBe(old);
  });
  it('a retained booking with an unresolved venue refuses the bundle instead of borrowing a city', async () => {
    cohortState.bookingRows = [bookingFixture({ place_id: uuid(555) })];
    await expect(load()).rejects.toMatchObject({ code: 'planner_resource_identity' });
    expect(useTripStore.getState().trip).toBe(cohortState.tripBeforeLoad);
  });
  it('a retained row from another Trip cannot enter the coherent native bundle', async () => {
    cohortState.bookingRows = [bookingFixture({ trip_id: uuid(999) })];
    await expect(load()).rejects.toMatchObject({ code: 'booking_view_identity' });
  });
  it('a late failed older load cannot erase the newer successful Trip state', async () => {
    let finish!: (value: unknown) => void;
    const original = cohortState.repo.readers.trips.fetchTripById;
    vi.mocked(original).mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r as typeof finish;
        })
    );
    const older = useTripStore.getState().loadTrip(trip);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await load();
    const before = useTripStore.getState().trip;
    const failed = expect(older).rejects.toMatchObject({ code: 'planner_load_superseded' });
    finish(await original(trip));
    await failed;
    expect(useTripStore.getState().trip).toEqual(before);
    expect(useTripStore.getState().error).toBeNull();
  });
  it('the editor uses its served assignment notes even if a stale native day copy differs', async () => {
    await load();
    cohortState.publishedVisit = {
      ...cohortState.publishedVisit,
      revision: cohortState.publishedVisit.revision + 1,
      explanations: 'Fresh observed note',
    };
    render(<NativeEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Open native editor' }));
    await screen.findByRole('button', { name: /^Update$/i });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Notes for this day' })).toHaveValue('Fresh observed note')
    );
  });
  it('preserves canonical task metadata and normalizes legacy file nulls without changing original records', async () => {
    const id = (await cohortState.repo.views()).ids.register('trip', trip);
    cohortState.taskRows = [
      canonicalTask({
        id: uuid(789),
        trip_id: trip,
        name: 'Later task',
        checked: false,
        priority: 0,
        category: '',
        assigned_person_id: null,
      }),
    ];
    cohortState.extras.files = [
      {
        id: 790,
        trip_id: id,
        place_id: null,
        reservation_id: null,
        note_id: null,
        uploaded_by: null,
        filename: 'fixture.bin',
        original_name: 'fixture.bin',
        file_size: null,
        mime_type: null,
        description: null,
        created_at: null,
        starred: null,
        deleted_at: null,
        message_id: null,
        reservation_title: null,
        uploaded_by_name: null,
        uploaded_by_avatar: null,
        url: 'https://fixture.invalid/original',
      },
    ];
    await load();
    const s = useTripStore.getState();
    expect(s.todoItems[0]).toMatchObject({
      checked: 0,
      priority: 0,
      category: '',
      created_at: cohortState.taskRows[0].created_at,
      updated_at: cohortState.taskRows[0].updated_at,
      family_task: { id: uuid(789), revision: 3, scope: { layer: 'published' } },
    });
    expect(s.files[0]).toMatchObject({ mime_type: '', created_at: '' });
    expect((cohortState.extras.files[0] as { mime_type: null }).mime_type).toBeNull();
  });
  it('a source change after the planner read but before the header finishes refuses the full store publication', async () => {
    let finish!: (v: unknown) => void;
    const original = cohortState.repo.readers.trips.fetchTripById;
    vi.mocked(original).mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r as typeof finish;
        })
    );
    const task = useTripStore.getState().loadTrip(trip);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    cohortState.source = 'https://another.supabase.invalid';
    // The source can retire the in-flight planner before the outer header join.
    // Both explicit fences must refuse; neither may publish or replace this Trip.
    const failure = expect(task).rejects.toMatchObject({
      status: 409,
      code: expect.stringMatching(/^(planner_bundle_changed|stale_planner_view)$/),
    });
    finish(await original(trip));
    await failure;
    expect(useTripStore.getState().trip).toBe(cohortState.tripBeforeLoad);
  });
  it('reconnect hydration refreshes required ancillary tabs together with the planner without resetting selection', async () => {
    await load();
    const dayId = useTripStore.getState().days[0].id;
    useTripStore.setState({ selectedDayId: dayId });
    cohortState.taskRows = [
      canonicalTask({ id: uuid(789), trip_id: trip, name: 'Reconnected task', assigned_person_id: null }),
    ];
    cohortState.published.notes = 'Reconnected venue note';
    await useTripStore.getState().hydrateActiveTrip(trip);
    expect(useTripStore.getState().todoItems[0].name).toBe('Reconnected task');
    expect(useTripStore.getState().places[0].notes).toBe('Reconnected venue note');
    expect(useTripStore.getState().selectedDayId).toBe(dayId);
  });
});

describe('P04s installed cohort retains original native queue refusals', () => {
  it('its old writer is parked through the real application and stays protected after disposal', async () => {
    const { setConflictStrategy } = await import('../../sync/offlinePrefs');
    setConflictStrategy('server');
    try {
      await load();
      const body = { name: 'Unresolved original native point' },
        id = crypto.randomUUID();
      await mutationQueue.enqueue({
        id,
        tripId: required(useTripStore.getState().trip).id,
        method: 'POST',
        url: `/trips/${trip}/places`,
        body,
      });
      await mutationQueue.flush();
      const retained = await offlineDb.mutationQueue.get(id);
      expect(retained?.status).toBe('conflict');
      expect(retained?.body).toEqual(body);
      expect(retained?.retentionPolicy).toBe('family-original-v1');
      cohortState.release();
      await expect(mutationQueue.resolveKeepServer(id)).rejects.toThrow('original Family command is retained');
      expect(await offlineDb.mutationQueue.get(id)).toEqual(retained);
    } finally {
      setConflictStrategy('ask');
    }
  });
});

describe('P04t installed governance/controller handoff', () => {
  it('the real cohort reads governance through the checked application handler', async () => {
    await load();
    const prior = db.rpc.getMockImplementation();
    db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) =>
      name === 'get_family_plan_governance_v1'
        ? {
            data: {
              version: 1,
              scope: {
                version: 1,
                trip_id: trip,
                family_id: family,
                user_id: cohortState.session.userId,
                person_id: cohortState.session.personId,
                layer: args.p_layer,
              },
              permissions: { can_mutate: true, can_draft: true, outcomes: { 'trip.places.manage': 'direct' } },
              draft: null,
              requests: [],
            },
            error: null,
          }
        : prior?.(name, args)
    );
    const view = await cohortState.cohort.governance.read(trip);
    expect(view.scope.layer).toBe('published');
    expect(view.source_url).toBe('https://fixture.supabase.invalid');
    expect(view.requests).toEqual([]);
  });
  it('a governance layer change cancels an already-open native editor before saving', async () => {
    await load();
    const original = request(),
      opened = await cohortState.cohort.openEditor(original);
    const before = db.rpc.mock.calls.filter(([name]) => String(name).startsWith('save_family')).length;
    await cohortState.cohort.governance.setLayer(trip, 'myDraft');
    expect(cohortState.repo.getLayer(trip)).toBe('myDraft');
    await expect(cohortState.cohort.saveForm(original, form(opened))).rejects.toThrow();
    expect(db.rpc.mock.calls.filter(([name]) => String(name).startsWith('save_family'))).toHaveLength(before);
  });
  it('legacy controller attachment cannot replace the cohort layer or install a stale setter', async () => {
    await load();
    const stale = vi.fn();
    const core = {
      trip: required(await cohortState.repo.readers.trips.fetchTripById(trip)),
      days: [],
      places: [],
      schedule: [],
      notes: [],
    };
    cohortState.repo.attachController(core, { canMutate: false, outcomes: {} }, 'myDraft', stale);
    expect(cohortState.repo.getLayer(trip)).toBe('published');
    await cohortState.cohort.governance.setLayer(trip, 'myDraft');
    expect(stale).not.toHaveBeenCalled();
  });
});

describe('P04ar installed cohort read/cache/publish protection', () => {
  it.each(['pending', 'syncing', 'failed', 'conflict'] as const)(
    'a full reload retains the open Trip and scoped cache for %s work',
    async (status) => {
      await load();
      const before = useTripStore.getState(),
        cached = await plannerCacheDb.snapshots.toArray(),
        original = await cohortCommand(status);
      db.rpc.mockClear();
      await expect(useTripStore.getState().loadTrip(trip)).rejects.toMatchObject({ code: 'planner_local_work' });
      expectVisibleRetained(before);
      expect(await plannerCacheDb.snapshots.toArray()).toEqual(cached);
      expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
      expect(db.rpc).not.toHaveBeenCalled();
      expect(useTripStore.getState().isLoading).toBe(false);
    }
  );
  it.each(['hydrate', 'refresh', 'bundle'] as const)(
    '%s refuses retained work without publishing a canonical replacement',
    async (method) => {
      await load();
      const before = useTripStore.getState(),
        original = await cohortCommand('conflict');
      const run =
        method === 'hydrate'
          ? useTripStore.getState().hydrateActiveTrip(trip)
          : method === 'refresh'
            ? useTripStore.getState().refreshDays(trip)
            : cohortState.client.get(`/trips/${trip}/bundle`);
      await expect(run).rejects.toThrow();
      expectVisibleRetained(before);
      expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
    }
  );
  it('a command arriving during a full hydration preserves both the view and the cached snapshot', async () => {
    await load();
    const before = useTripStore.getState(),
      cached = await plannerCacheDb.snapshots.toArray(),
      gate = await heldCohortView();
    const run = useTripStore
      .getState()
      .hydrateActiveTrip(trip)
      .catch((error) => error);
    await waitFor(() => expect(gate.entered()).toBe(true));
    const original = await cohortCommand();
    gate.finish();
    expect(await run).toMatchObject({ code: 'planner_local_work' });
    expectVisibleRetained(before);
    expect(await plannerCacheDb.snapshots.toArray()).toEqual(cached);
    expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
  });
  it.each(['places', 'assignments', 'dayNotes', 'budgetItems', 'files'] as const)(
    'a delayed hydration cannot replace a locally edited %s slice',
    async (key) => {
      await load();
      const gate = await heldCohortView(),
        run = useTripStore
          .getState()
          .hydrateActiveTrip(trip)
          .catch((error) => error);
      await waitFor(() => expect(gate.entered()).toBe(true));
      const edited = key === 'assignments' || key === 'dayNotes' ? {} : [];
      useTripStore.setState({ [key]: edited });
      gate.finish();
      expect(await run).toMatchObject({ code: 'planner_local_work' });
      expect(useTripStore.getState()[key]).toBe(edited);
    }
  );
  it.each(['syncAll', 'prepareForOffline'] as const)(
    '%s cannot store private-layer cohort projections in generic native tables',
    async (method) => {
      await load('myDraft');
      const before = useTripStore.getState();
      db.rpc.mockClear();
      expect(await tripSyncManager[method]()).toEqual({ status: 'skipped', reason: 'planner-scope' });
      expect(offlineNoticeKey({ kind: 'skipped', reason: 'planner-scope' })).toBe(
        'settings.offline.notice.plannerScope'
      );
      expect(await offlineDb.places.count()).toBe(0);
      expect(await offlineDb.days.count()).toBe(0);
      expect(db.rpc).not.toHaveBeenCalled();
      expectVisibleRetained(before);
    }
  );
});

it('P04az startup reservation refresh joins the original full bundle without partial publication', async () => {
  useTripStore.getState().resetTrip();
  const original = required(db.rpc.getMockImplementation());
  let finish!: () => void,
    entered = false;
  const hold = new Promise<void>((resolve) => {
    finish = resolve;
  });
  db.rpc.mockImplementation(async (name, args) => {
    if (name === 'get_family_trip_tasks_v1') {
      entered = true;
      await hold;
    }
    return original(name, args);
  });
  const before = useTripStore.getState().reservations;
  const full = useTripStore.getState().loadTrip(trip);
  await waitFor(() => expect(entered).toBe(true));
  const native = (await cohortState.repo.views()).ids.register('trip', trip);
  const reservations = useTripStore.getState().loadReservations(native);
  expect(useTripStore.getState().reservations).toBe(before);
  expect(useTripStore.getState().trip).toBeNull();
  finish();
  await Promise.all([full, reservations]);
  expect(useTripStore.getState().trip?.id).toBe(native);
  expect(useTripStore.getState().error).toBeNull();
  expect(db.rpc.mock.calls.filter(([name]) => name === 'get_family_trip_booking_view_v1')).toHaveLength(1);
  expect(await offlineDb.reservations.count()).toBe(0);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});

describe('P04az startup/reconnect coordination and owned failure recovery', () => {
  it.each(['files', 'budget'] as const)(
    'native %s refresh joins complete startup without competing legacy publication',
    async (resource) => {
      await assertStartupAncillaryReadJoins(
        resource,
        trip,
        async () => (await cohortState.repo.views()).ids.register('trip', trip),
        startupTaskGate
      );
    }
  );

  it('reconnect hydration and reservations join the current complete read while planner refresh does not race it', async () => {
    await load();
    const before = useTripStore.getState(),
      gate = await startupTaskGate();
    db.rpc.mockClear();
    const root = useTripStore.getState().hydrateActiveTrip(trip);
    await waitFor(() => expect(gate.entered()).toBe(true));
    const requests = [
      useTripStore.getState().hydrateActiveTrip(trip),
      useTripStore.getState().loadReservations(required(before.trip).id),
      useTripStore.getState().refreshDays(trip),
    ];
    expectVisibleRetained(before);
    gate.finish();
    await Promise.all([root, ...requests]);
    expect(db.rpc.mock.calls.filter(([name]) => name === 'get_family_trip_tasks_v1')).toHaveLength(1);
    expect(db.rpc.mock.calls.filter(([name]) => name === 'get_family_trip_booking_view_v1')).toHaveLength(1);
    expect(await offlineDb.reservations.count()).toBe(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('a stale background request for another Trip cannot displace the current full flight', async () => {
    useTripStore.getState().resetTrip();
    const gate = await startupTaskGate();
    const root = useTripStore.getState().loadTrip(trip);
    await waitFor(() => expect(gate.entered()).toBe(true));
    await expect(useTripStore.getState().loadReservations(uuid(999))).resolves.toBeUndefined();
    const shared = useTripStore
      .getState()
      .loadReservations((await cohortState.repo.views()).ids.register('trip', trip));
    gate.finish();
    await Promise.all([root, shared]);
    expect(useTripStore.getState().trip).not.toBeNull();
    expect(db.rpc.mock.calls.filter(([name]) => name === 'get_family_trip_booking_view_v1')).toHaveLength(1);
  });
  it.each(['packingItems', 'todoItems', 'reservations', 'budgetItems', 'files'] as const)(
    'a genuine local %s replacement is still protected during the shared full read',
    async (key) => {
      await load();
      const before = useTripStore.getState(),
        gate = await startupTaskGate();
      const root = useTripStore
        .getState()
        .hydrateActiveTrip(trip)
        .catch((error) => error);
      await waitFor(() => expect(gate.entered()).toBe(true));
      const shared = useTripStore
        .getState()
        .loadReservations(required(before.trip).id)
        .catch((error) => error);
      const edited: (typeof before)[typeof key] = [];
      useTripStore.setState({ [key]: edited });
      gate.finish();
      expect(await root).toMatchObject({ code: 'planner_local_work' });
      expect(await shared).toBeUndefined();
      expect(useTripStore.getState()[key]).toBe(edited);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it.each(['pending', 'syncing', 'failed', 'conflict'] as const)(
    'a cold start and its Retry preserve the original %s command without RPC',
    async (status) => {
      await load();
      const original = await cohortCommand(status);
      useTripStore.getState().resetTrip();
      db.rpc.mockClear();
      await expect(useTripStore.getState().loadTrip(trip)).rejects.toMatchObject({ code: 'planner_local_work' });
      const owner = currentPlannerBoundaryOwner(),
        failure = owner?.getProblem();
      expect(failure?.message).toMatch(/preserve local work/);
      await expect(failure?.retry()).rejects.toMatchObject({ code: 'planner_local_work' });
      expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
      expect(useTripStore.getState().trip).toBeNull();
      expect(db.rpc).not.toHaveBeenCalled();
    }
  );
  it('Retry starts a fresh read after a genuine startup failure and retires the old callback', async () => {
    useTripStore.getState().resetTrip();
    cohortState.readonlyFailure = true;
    await expect(useTripStore.getState().loadTrip(trip)).rejects.toThrow('Required tab read failed');
    const failure = currentPlannerBoundaryOwner()?.getProblem();
    expect(failure).toBeTruthy();
    cohortState.readonlyFailure = false;
    await failure?.retry();
    expect(useTripStore.getState().trip).not.toBeNull();
    expect(currentPlannerBoundaryOwner()?.getProblem()).toBeNull();
    db.rpc.mockClear();
    await expect(failure?.retry()).rejects.toBeDefined();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it.each(['source', 'actor', 'family', 'person', 'layerABA', 'logout', 'privateEpoch', 'dispose'] as const)(
    'a %s change retires the original failure and Retry before RPC',
    async (change) => {
      cohortState.readonlyFailure = true;
      await expect(useTripStore.getState().loadTrip(trip)).rejects.toThrow();
      const failure = currentPlannerBoundaryOwner()?.getProblem();
      expect(failure).toBeTruthy();
      cohortState.readonlyFailure = false;
      if (change === 'source') cohortState.source = 'https://another.supabase.invalid';
      if (change === 'actor') cohortState.repo.acceptSession({ ...cohortState.session, userId: uuid(999) });
      if (change === 'family') cohortState.repo.acceptSession({ ...cohortState.session, familyId: uuid(999) });
      if (change === 'person') cohortState.repo.acceptSession({ ...cohortState.session, personId: uuid(999) });
      if (change === 'layerABA') {
        cohortState.repo.setLayer(trip, 'myDraft');
        cohortState.repo.setLayer(trip, 'published');
      }
      if (change === 'logout') setAuthed(false);
      if (change === 'privateEpoch') invalidateOfflineSession();
      if (change === 'dispose') {
        cohortState.release();
        cohortState.release = () => {};
      }
      db.rpc.mockClear();
      await expect(failure?.retry()).rejects.toBeDefined();
      expect(db.rpc).not.toHaveBeenCalled();
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
});

it('P04az a stale background read cannot pause a different already published Trip', async () => {
  await load();
  const owner = currentPlannerBoundaryOwner(),
    publication = owner?.get();
  db.rpc.mockClear();
  await expect(cohortState.cohort.refreshPlanner(uuid(999))).rejects.toMatchObject({ code: 'planner_local_work' });
  await expect(useTripStore.getState().hydrateActiveTrip(uuid(999))).rejects.toMatchObject({
    code: 'planner_local_work',
  });
  expect(owner?.get()).toBe(publication);
  expect(owner?.getProblem()).toBeNull();
  expect(db.rpc).not.toHaveBeenCalled();
});

it('P04az an older partial refresh cannot publish its failure over a newer successful refresh', async () => {
  await load();
  const gate = await heldCohortView(),
    older = cohortState.cohort.refreshPlanner(trip).catch((error) => error);
  await waitFor(() => expect(gate.entered()).toBe(true));
  const newer = cohortState.cohort.refreshPlanner(trip);
  gate.finish();
  expect(await older).toMatchObject({ code: 'planner_local_work' });
  await newer;
  expect(currentPlannerBoundaryOwner()?.getProblem()).toBeNull();
  expect(currentPlannerBoundaryOwner()?.get()).not.toBeNull();
});

describe('U03-D12 warm native full-load ownership', () => {
  it('keeps an already opened native Trip mounted while a complete reload is pending and after it publishes', async () => {
    await load();
    useTripStore.setState({ selectedDayId: required(useTripStore.getState().days[0]).id });
    const before = useTripStore.getState(),
      gate = await startupTaskGate();
    const reload = useTripStore
      .getState()
      .loadTrip(trip)
      .catch((error) => error);
    const loadingDuringReload = useTripStore.getState().isLoading;
    await waitFor(() => expect(gate.entered()).toBe(true));
    expectVisibleRetained(before);
    gate.finish();
    expect(await reload).toBeUndefined();
    expect(loadingDuringReload).toBe(false);
    expect(useTripStore.getState().selectedDayId).toBe(before.selectedDayId);
    expect(useTripStore.getState().isLoading).toBe(false);
  });
  it('an offline complete reload reports refusal without toggling native mount state or clearing selection', async () => {
    await load();
    const before = useTripStore.getState(),
      loading: boolean[] = [];
    const stop = useTripStore.subscribe((state) => loading.push(state.isLoading));
    setForcedOffline(true);
    await expect(useTripStore.getState().loadTrip(trip)).rejects.toMatchObject({
      code: 'planner_full_load_needs_connection',
    });
    stop();
    expect(loading).not.toContain(true);
    expectVisibleRetained(before);
    expect(currentPlannerBoundaryOwner()?.getProblem()?.message).toMatch(/needs a connection/);
    expect(currentPlannerBoundaryOwner()?.get()).toBeNull();
  });
  it('a newer explicit warm load still supersedes the old observation without a cold-start mount toggle', async () => {
    await load();
    const gate = await startupTaskGate();
    const first = useTripStore
      .getState()
      .loadTrip(trip)
      .catch((error) => error);
    await waitFor(() => expect(gate.entered()).toBe(true));
    const next = useTripStore
      .getState()
      .loadTrip(trip)
      .catch((error) => error);
    const loadingDuringReload = useTripStore.getState().isLoading;
    gate.finish();
    const [older, newer] = await Promise.all([first, next]);
    expect(older).toMatchObject({ code: 'planner_load_superseded' });
    expect(newer).toBeUndefined();
    expect(loadingDuringReload).toBe(false);
    expect(useTripStore.getState().trip).not.toBeNull();
  });
  it.each(['source', 'actorABA', 'familyABA', 'personABA', 'layerABA', 'emptyStore'] as const)(
    'a changed %s cannot borrow the previous private scope for warm display',
    async (change) => {
      await load();
      const originalSession = { ...cohortState.session };
      if (change === 'source') cohortState.source = 'https://other.supabase.invalid';
      if (change === 'actorABA') {
        cohortState.repo.acceptSession({ ...cohortState.session, userId: uuid(999) });
        cohortState.repo.acceptSession(originalSession);
      }
      if (change === 'familyABA') {
        cohortState.repo.acceptSession({ ...cohortState.session, familyId: uuid(999) });
        cohortState.repo.acceptSession(originalSession);
      }
      if (change === 'personABA') {
        cohortState.repo.acceptSession({ ...cohortState.session, personId: uuid(999) });
        cohortState.repo.acceptSession(originalSession);
      }
      if (change === 'layerABA') {
        cohortState.repo.setLayer(trip, 'myDraft');
        cohortState.repo.setLayer(trip, 'published');
      }
      if (change === 'emptyStore') useTripStore.getState().resetTrip();
      const request = useTripStore
        .getState()
        .loadTrip(trip)
        .catch((error) => error);
      const cold = useTripStore.getState().isLoading;
      await request;
      expect(cold).toBe(true);
    }
  );
  it.each([false, true])(
    'typed native form fields and original observation survive a full read (refusal=%s)',
    async (refused) => {
      await load();
      const form = renderHook(() => useTaskForm(null));
      act(() => {
        form.result.current.setName('Second task typed immediately');
        form.result.current.patchFields({ desc: 'Keep my description', priority: 2, category: 'Travel' });
      });
      const fields = form.result.current.fields,
        origin = form.result.current.taskOrigin;
      const loading: boolean[] = [];
      const stop = useTripStore.subscribe((state) => loading.push(state.isLoading));
      cohortState.readonlyFailure = refused;
      const result = await useTripStore
        .getState()
        .loadTrip(trip)
        .catch((error) => error);
      stop();
      expect(loading).not.toContain(true);
      expect(form.result.current.name).toBe('Second task typed immediately');
      expect(form.result.current.fields).toBe(fields);
      expect(form.result.current.taskOrigin).toBe(origin);
      if (refused) {
        expect(result).toBeInstanceOf(Error);
        const failure = currentPlannerBoundaryOwner()?.getProblem();
        expect(failure).toBeTruthy();
        cohortState.readonlyFailure = false;
        await failure?.retry();
        expect(form.result.current.name).toBe('Second task typed immediately');
        expect(form.result.current.taskOrigin).toBe(origin);
      } else expect(result).toBeUndefined();
      db.rpc.mockClear();
      await expect(origin?.save({ name: form.result.current.name })).rejects.toMatchObject({
        code: 'task_observation_changed',
      });
      expect(db.rpc).not.toHaveBeenCalled();
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
});

it('U04-B cold planner failure routes packing recovery, preserving unknown work until a fresh canonical read', async () => {
  const ids = (await cohortState.repo.views()).ids,
    native = ids.register('trip', trip),
    scope = canonicalPackingList(
      {
        trip_id: trip,
        family_id: family,
        user_id: cohortState.session.userId,
        person_id: cohortState.session.personId,
      },
      true
    ).scope;
  const packet = {
    version: 1 as const,
    source_url: cohortState.source,
    view_layer: 'published' as const,
    command: {
      version: 1 as const,
      scope,
      operation_id: uuid(9871),
      action: 'create' as const,
      target_id: uuid(9872),
      expected_revision: null,
      expected_collection_revision: null,
      values: { name: 'Retained packing original' },
    },
  };
  await retainPackingIntent(captureWriteSession(), packet, native);
  const row = await offlineDb.mutationQueue.get(packet.command.operation_id);
  useTripStore.getState().resetTrip();
  await expect(useTripStore.getState().loadTrip(trip)).rejects.toMatchObject({ code: 'planner_local_work' });
  const owner = required(currentPlannerBoundaryOwner()),
    failure = required(owner.getProblem());
  expect((await failure.taskRecovery?.inspect())?.domain).toBe('packing');
  let committed = false;
  const previous = required(db.rpc.getMockImplementation());
  db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_family_trip_packing_receipt_v1')
      return {
        data: {
          version: 1,
          trip_id: trip,
          operation_id: args.p_operation_id,
          scope,
          status: committed ? 'committed' : 'unknown',
          result_redacted: committed,
          result: null,
        },
        error: null,
      };
    return previous(name, args);
  });
  render(
    <Routes>
      <Route path="/trips/:id" element={<FamilyPlannerReadProblem owner={owner} />} />
    </Routes>,
    { initialEntries: ['/trips/' + native] }
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Check retained packing save' }));
  await screen.findByText(/original save is still unresolved/);
  expect(await offlineDb.mutationQueue.get(packet.command.operation_id)).toEqual(row);
  expect(useTripStore.getState().trip).toBeNull();
  committed = true;
  fireEvent.click(screen.getByRole('button', { name: 'Check retained packing save' }));
  await waitFor(() => expect(useTripStore.getState().trip?.id).toBe(native));
  expect(owner.getProblem()).toBeNull();
  expect(await offlineDb.mutationQueue.count()).toBe(0);
  expect(useTripStore.getState().packingItems).toEqual([]);
  expect(db.rpc.mock.calls.filter(([name]) => name === 'execute_family_trip_packing_v1')).toHaveLength(0);
  await expect(failure.retry()).rejects.toBeDefined();
});
