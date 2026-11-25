import 'fake-indexeddb/auto';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { placeFormProps, seedPlaceFormStores } from '../../../tests/helpers/placeFormSetup';
import { cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import PlaceFormModal, { type PlaceSubmitData } from '../../components/Planner/PlaceFormModal';
import { placeEditForm, placeFormPayload } from '../../components/Planner/PlaceFormModal.helpers';
import { offlineDb } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import type { FormValues } from './locationFormContract';
import { openFamilyLocationForm } from './nativeLocationForm';
import { openFamilyVisitForm } from './nativeVisitForm';
import type { PlanLocation } from './planLocationContract';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';
import type { VisitFormContext, VisitFormObservation, VisitFormReceipt, VisitFormValues } from './visitFormContract';

const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => db }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => db }));
const uuid = (n: number) => `d0400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = uuid(1),
  family = uuid(2),
  location = uuid(3),
  visit = uuid(7),
  day = uuid(8),
  at = '2026-11-05T00:00:00Z';
const catalogName = 'Actual cafe';
const planningDay = '2027-04-01';
const clockZone = 'America/Mexico_City';
let repo: FamilyFrontendRepository, session: FamilySession, published: PlanLocation;
let publishedVisit: ReturnType<typeof visitRecord>, privateValues: VisitFormValues | null;
let draftIndex: number, loseAck: boolean, switchScope: boolean, deny: { code: string } | null;
const receipts = new Map<string, { hash: string; result: VisitFormReceipt }>(),
  original = api.defaults.adapter;
function visitRecord(): VisitFormContext['visit'] {
  return {
    id: visit,
    trip_id: trip,
    activity: 'Actual cafe',
    starts_at: null,
    ends_at: null,
    time_zone: null,
    sort_order: 0,
    explanations: null,
    updated_at: at,
    plan_location_id: location,
    timing_kind: 'untimed',
    trip_day_id: day,
    planning_day: planningDay,
    revision: 1,
    duration_minutes: null,
    planned_duration_minutes: null,
    start_local: null,
    end_local: null,
    deleted_at: null,
    location: published,
  };
}
function fields(l: PlanLocation): FormValues {
  return {
    name: l.name,
    description: l.description,
    notes: l.notes,
    address: l.address,
    website: l.website,
    phone: l.phone,
    latitude: l.latitude,
    longitude: l.longitude,
    family_place_category_id: l.category?.id ?? null,
  };
}

function projectFixtureLocation(values: FormValues): PlanLocation {
  const { name, family_place_category_id: _categoryId, ...details } = values;
  return { ...published, ...details, name: name ?? catalogName };
}

function currentValues(layer: 'published' | 'myDraft'): VisitFormValues {
  return layer === 'myDraft' && privateValues
    ? structuredClone(privateValues)
    : {
        location: fields(published),
        visit_notes: publishedVisit.explanations,
        clocks: {
          start: publishedVisit.start_local?.slice(11, 16) ?? null,
          end: publishedVisit.end_local?.slice(11, 16) ?? null,
        },
      };
}
function withClocks(v: typeof publishedVisit, clocks: VisitFormValues['clocks']): VisitFormContext['visit'] {
  const start = clocks.start ? `${planningDay}T${clocks.start}:00` : null;
  const end = clocks.end ? `${planningDay}T${clocks.end}:00` : null;
  // Mexico City is UTC-06:00 on this fixture's planning day.
  return {
    ...v,
    timing_kind: start || end ? 'timed' : 'untimed',
    start_local: start ? `${start}.000000` : null,
    end_local: end ? `${end}.000000` : null,
    starts_at: start ? new Date(`${start}-06:00`).toISOString() : null,
    ends_at: end ? new Date(`${end}-06:00`).toISOString() : null,
    time_zone: start || end ? clockZone : null,
  };
}
function context(layer: 'published' | 'myDraft'): VisitFormContext {
  const values = currentValues(layer),
    locationShown = projectFixtureLocation(values.location),
    pub = { ...publishedVisit, location: structuredClone(published) },
    shown = { ...withClocks(pub, values.clocks), explanations: values.visit_notes, location: locationShown };
  return {
    version: 1,
    layer,
    location: locationShown,
    published_location: structuredClone(published),
    visit: shown,
    published_visit: pub,
    clock_zone: clockZone,
    observation: {
      version: 1,
      layer,
      location: {
        version: 1,
        trip_id: trip,
        location_id: location,
        family_id: family,
        user_id: session.userId,
        person_id: session.personId,
        revision: published.revision,
        layer: 'published',
        draft: null,
        published: fields(published),
        shown: fields(locationShown),
      },
      visit_id: visit,
      visit_revision: publishedVisit.revision,
      draft:
        layer === 'myDraft' && privateValues
          ? { op_id: uuid(100 + draftIndex), payload_sha256: String(draftIndex).padStart(64, '0') }
          : null,
      shown_visit: shown,
      published_visit: pub,
      clock_zone: clockZone,
    },
  };
}
function initializeBoundary() {
  db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_family_trip_location_form_v1') {
      const c = context('published');
      return {
        data: {
          version: 1,
          layer: 'published',
          location: c.location,
          published_location: c.published_location,
          observation: c.observation.location,
        },
        error: null,
      };
    }
    if (name === 'get_family_trip_visit_form_v1')
      return { data: context(args.p_layer as 'published' | 'myDraft'), error: null };
    if (name !== 'save_family_trip_visit_form_v1') throw new Error('Unexpected RPC ' + name);
    if (deny) return { data: null, error: deny };
    const o = args.p_observation as VisitFormObservation,
      f = args.p_form as VisitFormValues,
      key = String(args.p_operation_id),
      hash = JSON.stringify([o, f]),
      prior = receipts.get(key);
    if (prior && prior.hash !== hash) return { data: null, error: { code: '40001' } };
    if (!prior) {
      if (
        o.visit_revision !== publishedVisit.revision ||
        o.location.revision !== published.revision ||
        JSON.stringify(o.draft) !== JSON.stringify(context(o.layer).observation.draft)
      )
        return { data: null, error: { code: '40001' } };
      const norm = (v: unknown) => (typeof v === 'string' ? v.trim() || null : v);
      const next = { ...fields(published) };
      let locChanged = false;
      for (const k of Object.keys(f.location) as (keyof FormValues)[])
        if (norm(f.location[k]) !== norm(o.location.shown[k])) {
          Object.assign(next, { [k]: norm(f.location[k]) });
          locChanged = true;
        }
      const clockChanged =
        JSON.stringify(f.clocks) !==
        JSON.stringify({
          start: o.shown_visit.start_local?.slice(11, 16) ?? null,
          end: o.shown_visit.end_local?.slice(11, 16) ?? null,
        });
      const visitChanged = norm(f.visit_notes) !== norm(o.shown_visit.explanations) || clockChanged,
        changed = locChanged || visitChanged;
      if (o.layer === 'published' && changed) {
        if (locChanged) published = { ...projectFixtureLocation(next), revision: published.revision + 1 };
        if (visitChanged)
          publishedVisit = {
            ...withClocks(publishedVisit, f.clocks),
            explanations: norm(f.visit_notes) as string | null,
            revision: publishedVisit.revision + 1,
          };
      } else if (o.layer === 'myDraft' && changed) {
        privateValues = {
          ...structuredClone(f),
          location: { ...(privateValues?.location ?? fields(published)), ...next },
        };
        draftIndex++;
      }
      receipts.set(key, {
        hash,
        result: {
          version: 1,
          visit_id: visit,
          location_id: location,
          state: o.layer === 'published' ? 'published' : 'draft',
          changed,
          places_intent: locChanged,
          visit_revision: publishedVisit.revision,
          location_revision: published.revision,
          draft_id: o.layer === 'myDraft' && privateValues ? uuid(80) : null,
          op_id: o.layer === 'myDraft' && privateValues ? uuid(100 + draftIndex) : null,
        },
      });
    }
    if (switchScope) {
      session = { ...session, personId: uuid(99) };
      repo.acceptSession(session);
    }
    if (loseAck) {
      loseAck = false;
      return { data: null, error: { message: 'Lost acknowledgement' } };
    }
    return { data: receipts.get(key)?.result, error: null };
  });
}
beforeEach(async () => {
  server.use(http.get('*/api/health', () => HttpResponse.json({ status: 'ok' })));
  resetAllStores();
  seedPlaceFormStores();
  await resetOfflineTestDatabase();
  localStorage.clear();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  published = {
    id: location,
    trip_id: trip,
    revision: 1,
    deleted_at: null,
    source: { kind: 'food', id: uuid(4) },
    source_archived: false,
    name: catalogName,
    description: 'Shared catalog description',
    notes: null,
    latitude: 19.05,
    longitude: -98.2,
    is_located: true,
    address: 'Cafe street 7',
    website: 'https://cafe.example',
    phone: null,
    context_place_id: uuid(5),
    context_place_name: 'Puebla',
    country_id: uuid(6),
    country_name: 'Mexico',
    country_code: 'MX',
    time_zone: clockZone,
    source_type_label: null,
    cover_media_id: null,
    category: null,
    overrides: {},
    created_at: at,
    updated_at: at,
  };
  session = {
    userId: uuid(90),
    familyId: family,
    personId: uuid(91),
    user: { username: 'Fixture', email: 'fixture@example.invalid', avatar_url: null, created_at: at },
  };
  repo = new FamilyFrontendRepository(async () => session);
  privateValues = null;
  publishedVisit = visitRecord();
  draftIndex = 0;
  loseAck = false;
  switchScope = false;
  deny = null;
  receipts.clear();
  db.rpc.mockReset();
  initializeBoundary();
  const app = createFamilyApplicationHandler(repo);
  api.defaults.adapter = createFamilyAxiosAdapter(async (request) => {
    // Unrelated read-only native modal lookup services are fixture boundaries.
    if (request.method === 'GET' && /\/files$/.test(request.pathname)) return { files: [] };
    if (request.method === 'GET' && /\/reservations$/.test(request.pathname)) return { reservations: [] };
    return app(request);
  });
});
afterEach(async () => {
  cleanup();
  api.defaults.adapter = original;
  setAuthed(false);
  await resetOfflineTestDatabase();
  vi.restoreAllMocks();
});

async function open(layer: 'published' | 'myDraft' = 'published') {
  return openFamilyVisitForm(trip, visit, layer, (await repo.views()).ids);
}
function payload(editor: Awaited<ReturnType<typeof open>>, over: Partial<PlaceSubmitData> = {}): PlaceSubmitData {
  return { ...placeFormPayload(placeEditForm(editor.place, editor.assignment), [], editor.assignment), ...over };
}
async function modal(layer: 'published' | 'myDraft' = 'published') {
  const editor = await open(layer),
    onClose = vi.fn(),
    results: unknown[] = [];
  const rendered = render(
    <PlaceFormModal
      {...placeFormProps}
      place={editor.place}
      tripId={editor.place.trip_id ?? 0}
      assignmentId={editor.assignment.id}
      dayAssignments={[editor.assignment]}
      onClose={onClose}
      onSave={async (data) => {
        const result = await editor.save(data);
        results.push(result);
        return { id: editor.place.id };
      }}
    />
  );
  return { editor, onClose, results, ...rendered };
}
function changeClock(label: RegExp, value: string) {
  const field = screen.getByRole('textbox', { name: label });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}
describe('Selected native visit form through real modal, dispatcher and queue', () => {
  it('reproduces the prior location-only refusal through the actual orchestration', async () => {
    const old = await openFamilyLocationForm(trip, location, 'published', (await repo.views()).ids);
    await expect(
      old.save({ ...placeFormPayload(placeEditForm(old.place, null), [], null), place_time: '19:00' })
    ).rejects.toMatchObject({ status: 409 });
    expect(db.rpc.mock.calls.some(([n]) => n === 'save_family_trip_visit_form_v1')).toBe(false);
  });
  it('native Update submits location notes, selected-day notes and clocks in one command', async () => {
    const m = await modal();
    fireEvent.change(screen.getByPlaceholderText(/Personal notes/i), { target: { value: 'Trip-location note' } });
    const note = screen.getByRole('textbox', { name: 'Notes for this day' });
    expect(note).not.toBeNull();
    fireEvent.change(note, { target: { value: 'Tuesday only' } });
    changeClock(/^Start$/i, '19:30');
    changeClock(/^End$/i, '20:30');
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(m.onClose).toHaveBeenCalled());
    const saves = db.rpc.mock.calls.filter(([n]) => n === 'save_family_trip_visit_form_v1');
    expect(saves).toHaveLength(1);
    expect(saves[0][1].p_form).toMatchObject({
      location: { notes: 'Trip-location note' },
      visit_notes: 'Tuesday only',
      clocks: { start: '19:30', end: '20:30' },
    });
    const saved = await open();
    expect(saved.place).toMatchObject({ description: 'Shared catalog description', notes: 'Trip-location note' });
    expect(saved.assignment).toMatchObject({
      notes: 'Tuesday only',
      assignment_time: '19:30',
      assignment_end_time: '20:30',
    });
    expect(saved.editor.visit).toMatchObject({
      timing_kind: 'timed',
      starts_at: '2027-04-02T01:30:00.000Z',
      ends_at: '2027-04-02T02:30:00.000Z',
      time_zone: 'America/Mexico_City',
    });
  });
  it('untouched native Update sends no invented time or duplicate notes', async () => {
    const m = await modal();
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(m.onClose).toHaveBeenCalled());
    expect(published.revision).toBe(1);
    expect(publishedVisit.revision).toBe(1);
    expect(publishedVisit.starts_at).toBeNull();
    expect(publishedVisit.explanations).toBeNull();
  });
  it('native private Update and reopen keep all changes out of published caches', async () => {
    const before = useTripStore.getState().places,
      m = await modal('myDraft');
    fireEvent.change(screen.getByPlaceholderText(/Personal notes/i), { target: { value: 'Private location' } });
    const note = screen.getByRole('textbox', { name: 'Notes for this day' });
    fireEvent.change(note, { target: { value: 'Private visit' } });
    changeClock(/^Start$/i, '19:00');
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(m.onClose).toHaveBeenCalled());
    expect(published.notes).toBeNull();
    expect(publishedVisit.starts_at).toBeNull();
    expect(useTripStore.getState().places).toEqual(before);
    expect(await offlineDb.places.count()).toBe(0);
    expect(m.results[0]).toMatchObject({ operation: { state: 'draft' } });
    expect(m.results[0]).not.toHaveProperty('place');
    cleanup();
    const reopened = await modal('myDraft');
    expect(reopened.editor.place.notes).toBe('Private location');
    expect(reopened.editor.assignment.notes).toBe('Private visit');
    expect(reopened.editor.assignment.place?.place_time).toBe('19:00');
    const observation = reopened.editor.editor.observation;
    expect(observation.location.published).toMatchObject({ notes: null, description: 'Shared catalog description' });
    expect(observation.location.shown).toMatchObject({
      notes: 'Private location',
      description: 'Shared catalog description',
    });
    expect(observation.published_visit).toMatchObject({
      explanations: null,
      timing_kind: 'untimed',
      start_local: null,
    });
    const publishedEditor = await open();
    expect(publishedEditor.place.notes).toBeNull();
    expect(publishedEditor.assignment.notes).toBeNull();
    expect(publishedEditor.assignment.assignment_time).toBeNull();
  });
  it.each(['published', 'myDraft'] as const)(
    'resolves a cleared catalog-backed label in %s readback',
    async (layer) => {
      published.name = 'Trip cafe label';
      const e = await open(layer);
      expect(e.place.name).toBe('Trip cafe label');
      const saved = await e.save(payload(e, { name: '' }));
      expect(saved.editor.native_place.name).toBe('Actual cafe');
      expect(saved.editor.observation.location.shown.name).toBe('Actual cafe');
      expect((await open()).place.name).toBe(layer === 'published' ? 'Actual cafe' : 'Trip cafe label');
    }
  );
  it('keeps the originally served baseline when catalog data changes during editing', async () => {
    const e = await open();
    published.description = 'Refreshed catalog';
    const r = await e.save(payload(e, { assignment_notes: 'Visit note' }));
    expect(r.editor.location.description).toBe('Refreshed catalog');
    expect(r.editor.location.overrides).toEqual({});
  });
  it('retains exact original operation and observation after lost acknowledgement', async () => {
    const e = await open(),
      f = payload(e, { assignment_notes: 'One save' });
    loseAck = true;
    await expect(e.save(f)).rejects.toBeTruthy();
    await e.save(f);
    const calls = db.rpc.mock.calls.filter(([n]) => n === 'save_family_trip_visit_form_v1');
    expect(new Set(calls.map(([, a]) => a.p_operation_id)).size).toBe(1);
    expect(calls.every(([, a]) => a.p_observation.visit_revision === 1)).toBe(true);
    expect(receipts.size).toBe(1);
  });
  it('replays original selected-visit intent through the actual native IndexedDB queue', async () => {
    const e = await open(),
      intent = e.prepare(payload(e, { assignment_notes: 'Queued visit' }));
    loseAck = true;
    await mutationQueue.enqueue({
      id: intent.operation_id,
      tripId: e.place.trip_id ?? 0,
      method: 'POST',
      url: e.path,
      body: { observation: intent.observation, form: intent.form },
    });
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(intent.operation_id))?.status).toBe('pending');
    await offlineDb.mutationQueue.update(intent.operation_id, { retryAfter: undefined });
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.get(intent.operation_id)).toBeUndefined();
    expect(receipts.size).toBe(1);
  });
  it('parks account-switched queue intent intact before any RPC', async () => {
    const e = await open(),
      intent = e.prepare(payload(e, { assignment_notes: 'Original actor' }));
    await mutationQueue.enqueue({
      id: intent.operation_id,
      tripId: e.place.trip_id ?? 0,
      method: 'POST',
      url: e.path,
      body: intent,
    });
    session = { ...session, userId: uuid(92), personId: uuid(93) };
    repo.acceptSession(session);
    db.rpc.mockClear();
    await mutationQueue.flush();
    const q = await offlineDb.mutationQueue.get(intent.operation_id);
    expect(q?.status).toBe('conflict');
    expect(q?.body).toEqual(intent);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('fences same-user person changes after commit before invalidation or editor readback', async () => {
    const e = await open(),
      invalidate = vi.spyOn(repo, 'invalidate');
    switchScope = true;
    await expect(e.save(payload(e, { assignment_notes: 'Committed' }))).rejects.toMatchObject({ status: 409 });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('keeps the committed operation but skips invalidation and readback if canceled during the receipt check', async () => {
    const editor = await open();
    const body = editor.prepare(payload(editor, { assignment_notes: 'Committed before cancellation' }));
    const view = await repo.views();
    const controller = new AbortController();
    const invalidate = vi.spyOn(repo, 'invalidate');
    vi.spyOn(repo, 'tripUuid').mockResolvedValue(trip);
    vi.spyOn(repo, 'views')
      .mockResolvedValueOnce(view)
      .mockResolvedValueOnce(view)
      .mockImplementationOnce(async () => {
        controller.abort();
        return view;
      });
    db.rpc.mockClear();

    await expect(
      api.post(editor.path, body, {
        signal: controller.signal,
        headers: { 'X-Idempotency-Key': body.operation_id },
      })
    ).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(receipts.has(body.operation_id)).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(['save_family_trip_visit_form_v1']);
  });
  it('keeps stale queued observation rather than silently adopting newer revisions', async () => {
    const e = await open(),
      intent = e.prepare(payload(e, { assignment_notes: 'Original revision' }));
    await mutationQueue.enqueue({
      id: intent.operation_id,
      tripId: e.place.trip_id ?? 0,
      method: 'POST',
      url: e.path,
      body: intent,
    });
    publishedVisit.revision++;
    await mutationQueue.flush();
    const q = await offlineDb.mutationQueue.get(intent.operation_id);
    expect(q?.status).toBe('conflict');
    expect(q?.body).toEqual(intent);
    expect(publishedVisit.explanations).toBeNull();
  });
  it.each([
    ['42501', 403],
    ['40001', 409],
    ['22008', 400],
    ['23503', 422],
  ] as const)('surfaces %s without split location or timing calls', async (code, status) => {
    const e = await open();
    deny = { code };
    await expect(e.save(payload(e, { notes: 'Do not split', assignment_notes: 'No half save' }))).rejects.toMatchObject(
      { status }
    );
    expect(published.notes).toBeNull();
    expect(publishedVisit.explanations).toBeNull();
    expect(
      db.rpc.mock.calls.some(([n]) => ['mutate_family_trip_location_v1', 'set_family_trip_visit_timing_v1'].includes(n))
    ).toBe(false);
  });
  it.each(['image_url', '_pendingImage', 'transport_mode', 'email', '_serviceStop'] as const)(
    'refuses unsupported %s before saving any supported fields',
    async (field) => {
      const e = await open();
      db.rpc.mockClear();
      const value = field === 'transport_mode' ? 'driving' : field === '_pendingImage' ? { kind: 'file' } : 'changed';
      await expect(
        e.save(payload(e, { notes: 'No partial', [field]: value } as Partial<PlaceSubmitData>))
      ).rejects.toMatchObject({ status: 409 });
      expect(db.rpc).not.toHaveBeenCalled();
    }
  );
  it('rejects a private result incorrectly marked as published', async () => {
    const e = await open('myDraft'),
      implementation = db.rpc.getMockImplementation();
    if (!implementation) throw new Error('RPC fake unavailable');
    db.rpc.mockImplementation(async (...args: unknown[]) => {
      const r = await implementation(...args);
      return args[0] === 'save_family_trip_visit_form_v1' ? { ...r, data: { ...r.data, state: 'published' } } : r;
    });
    await expect(e.save(payload(e, { assignment_notes: 'Private' }))).rejects.toMatchObject({ status: 502 });
  });
  it('rejects a response for a different selected occurrence before identity registration', async () => {
    const implementation = db.rpc.getMockImplementation();
    if (!implementation) throw new Error('RPC fake unavailable');
    db.rpc.mockImplementation(async (...args: unknown[]) => {
      const r = await implementation(...args);
      return args[0] === 'get_family_trip_visit_form_v1'
        ? { ...r, data: { ...r.data, visit: { ...r.data.visit, id: uuid(999) } } }
        : r;
    });
    await expect(open()).rejects.toMatchObject({ status: 502 });
  });
  it('keeps the current online-only UI boundary explicit', async () => {
    const e = await open();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    db.rpc.mockClear();
    await expect(e.save(payload(e, { assignment_notes: 'Kept in form' }))).rejects.toMatchObject({ status: 409 });
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
