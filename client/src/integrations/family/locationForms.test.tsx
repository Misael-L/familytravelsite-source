import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import type { FormContext, FormObservation, FormReceipt, FormValues } from './locationFormContract';
import { openFamilyLocationForm } from './nativeLocationForm';
import type { PlanLocation } from './planLocationContract';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => db }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => db }));
const uuid = (n: number) => `c0400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = uuid(1),
  family = uuid(2),
  location = uuid(3),
  at = '2026-11-05T00:00:00Z';
const catalogName = 'Actual cafe';
let repo: FamilyFrontendRepository, session: FamilySession, published: PlanLocation, privateValues: FormValues | null;
let draftIndex: number, loseAck: boolean, switchScope: boolean, deny: { code: string } | null;
const receipts = new Map<string, { hash: string; result: FormReceipt }>(),
  original = api.defaults.adapter;
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

function context(layer: 'published' | 'myDraft'): FormContext {
  const shown = layer === 'myDraft' && privateValues ? projectFixtureLocation(privateValues) : published;
  return {
    version: 1,
    layer,
    location: structuredClone(shown),
    published_location: structuredClone(published),
    observation: {
      version: 1,
      trip_id: trip,
      location_id: location,
      family_id: family,
      user_id: session.userId,
      person_id: session.personId,
      revision: published.revision,
      layer,
      draft:
        layer === 'myDraft' && privateValues
          ? { op_id: uuid(100 + draftIndex), payload_sha256: String(draftIndex).padStart(64, '0') }
          : null,
      published: fields(published),
      shown: fields(shown),
    },
  };
}
function initializeBoundary() {
  db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_family_trip_location_form_v1')
      return { data: context(args.p_layer as 'published' | 'myDraft'), error: null };
    if (name !== 'save_family_trip_location_form_v1') throw new Error('Unexpected RPC ' + name);
    if (deny) return { data: null, error: deny };
    const observation = args.p_observation as FormObservation,
      form = args.p_form as FormValues;
    const key = String(args.p_operation_id),
      hash = JSON.stringify([observation, form]),
      prior = receipts.get(key);
    if (prior && prior.hash !== hash) return { data: null, error: { code: '40001' } };
    if (!prior) {
      const current = context(observation.layer);
      if (
        observation.revision !== published.revision ||
        JSON.stringify(observation.draft) !== JSON.stringify(current.observation.draft)
      )
        return { data: null, error: { code: '40001' } };
      // The real SQL normalizes optional empty text before deciding whether a
      // full native form actually changed anything (covered by real DB tests).
      const normalize = (values: FormValues) =>
        Object.fromEntries(Object.entries(values).map(([field, value]) => [field, value === '' ? null : value]));
      const normalized = normalize(form),
        observed = normalize(observation.shown);
      const draft = observation.layer === 'myDraft' ? privateValues : null;
      const next = { ...(draft ?? fields(published)) };
      for (const field of Object.keys(form) as (keyof FormValues)[])
        if (normalized[field] !== observed[field])
          Object.assign(next, { [field]: form[field] === '' ? null : form[field] });
      const changed = JSON.stringify(normalized) !== JSON.stringify(observed);
      if (observation.layer === 'published' && changed) {
        published = { ...projectFixtureLocation(next), revision: published.revision + 1 };
      } else if (observation.layer === 'myDraft' && changed) {
        privateValues = next;
        draftIndex++;
      }
      receipts.set(key, {
        hash,
        result: {
          version: 1,
          location_id: location,
          revision: published.revision,
          state: observation.layer === 'published' ? 'published' : 'draft',
          changed,
          draft_id: observation.layer === 'myDraft' && privateValues ? uuid(80) : null,
          op_id: observation.layer === 'myDraft' && privateValues ? uuid(100 + draftIndex) : null,
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
    time_zone: 'America/Mexico_City',
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
  return openFamilyLocationForm(trip, location, layer, (await repo.views()).ids);
}
function payload(
  place: Awaited<ReturnType<typeof open>>['place'],
  over: Partial<PlaceSubmitData> = {}
): PlaceSubmitData {
  return { ...placeFormPayload(placeEditForm(place, null), [], null), ...over };
}
async function modal(layer: 'published' | 'myDraft' = 'published') {
  const editor = await open(layer),
    onClose = vi.fn(),
    results: unknown[] = [];
  const props = {
    ...placeFormProps,
    place: editor.place,
    tripId: (await repo.views()).ids.register('trip', trip),
    onClose,
    onSave: async (data: PlaceSubmitData) => {
      const result = await editor.save(data);
      results.push(result);
      return { id: editor.place.id };
    },
  };
  render(<PlaceFormModal {...props} />);
  return { editor, onClose, results };
}

describe('Native saved-location form through actual modal, dispatcher, commands and queue', () => {
  it('saves a native Notes edit while keeping Description separate and preserving original observation', async () => {
    const m = await modal();
    expect(screen.getByPlaceholderText(/Short description/i)).toHaveValue('Shared catalog description');
    fireEvent.change(screen.getByPlaceholderText(/Personal notes/i), { target: { value: 'Dinner with family' } });
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(m.onClose).toHaveBeenCalled());
    expect(published.notes).toBe('Dinner with family');
    expect(published.description).toBe('Shared catalog description');
    const call = db.rpc.mock.calls.find(([name]) => name === 'save_family_trip_location_form_v1');
    expect(call?.[1].p_observation.shown.notes).toBeNull();
    expect(call?.[1].p_form.notes).toBe('Dinner with family');
  });
  it('accepts an untouched native full form without creating an override', async () => {
    const m = await modal();
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(m.onClose).toHaveBeenCalled());
    expect(published.revision).toBe(1);
    expect(published.overrides).toEqual({});
  });
  it('keeps a private native Save out of published store and IndexedDB, then reloads its draft', async () => {
    const before = useTripStore.getState().places;
    const m = await modal('myDraft');
    fireEvent.change(screen.getByPlaceholderText(/Personal notes/i), { target: { value: 'Private note' } });
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));
    await waitFor(() => expect(m.onClose).toHaveBeenCalled());
    expect(published.notes).toBeNull();
    expect(useTripStore.getState().places).toEqual(before);
    expect(await offlineDb.places.count()).toBe(0);
    expect(m.results[0]).toMatchObject({ operation: { state: 'draft' } });
    expect(m.results[0]).not.toHaveProperty('place');
    cleanup();
    const reopened = await modal('myDraft');
    expect(screen.getByPlaceholderText(/Personal notes/i)).toHaveValue('Private note');
    expect(reopened.editor.place.notes).toBe('Private note');
    expect((await open()).place.notes).toBeNull();
  });
  it.each(['published', 'myDraft'] as const)(
    'reads the catalog name after clearing a custom label in %s',
    async (layer) => {
      published.name = 'Trip cafe label';
      const editor = await open(layer);
      expect(editor.place.name).toBe('Trip cafe label');

      const saved = await editor.save(payload(editor.place, { name: '' }));
      expect(saved.editor.native_place).toMatchObject({
        name: 'Actual cafe',
        description: 'Shared catalog description',
      });
      expect(saved.editor.observation.shown.name).toBe('Actual cafe');
      const expectedPublishedName = layer === 'published' ? 'Actual cafe' : 'Trip cafe label';
      expect(saved.editor.observation.published.name).toBe(expectedPublishedName);
      expect((await open()).place.name).toBe(expectedPublishedName);
    }
  );
  it('keeps prior draft notes when a later save only changes the address', async () => {
    const editor = await open('myDraft');
    await editor.save(payload(editor.place, { notes: 'Keep my draft note' }));

    const reopened = await open('myDraft');
    expect(reopened.place.notes).toBe('Keep my draft note');
    const saved = await reopened.save(payload(reopened.place, { address: 'Private meeting entrance' }));
    expect(saved.editor.native_place).toMatchObject({
      notes: 'Keep my draft note',
      address: 'Private meeting entrance',
      description: 'Shared catalog description',
    });
    expect(saved.editor.observation.published).toMatchObject({
      notes: null,
      address: 'Cafe street 7',
      description: 'Shared catalog description',
    });
    expect((await open()).place).toMatchObject({ notes: null, address: 'Cafe street 7' });
  });
  it('retains the served baseline when the shared catalog changes while the form is open', async () => {
    const editor = await open(),
      form = payload(editor.place, { notes: 'My note' });
    published.name = 'New catalog name';
    published.description = 'New catalog description';
    const result = await editor.save(form);
    expect(result.editor.location.name).toBe('New catalog name');
    expect(result.editor.location.description).toBe('New catalog description');
    expect(db.rpc).toHaveBeenCalledWith(
      'save_family_trip_location_form_v1',
      expect.objectContaining({
        p_observation: expect.objectContaining({ shown: expect.objectContaining({ name: 'Actual cafe' }) }),
      })
    );
  });
  it('uses one original operation key for retry after a lost acknowledgement', async () => {
    const editor = await open(),
      form = payload(editor.place, { notes: 'Once' });
    loseAck = true;
    await expect(editor.save(form)).rejects.toMatchObject({ response: { status: 503 } });
    const result = await editor.save(form);
    expect(result.operation.revision).toBe(2);
    expect(receipts.size).toBe(1);
    const keys = db.rpc.mock.calls
      .filter(([name]) => name === 'save_family_trip_location_form_v1')
      .map(([, args]) => args.p_operation_id);
    expect(new Set(keys).size).toBe(1);
  });
  it('replays the actual native queue with its captured observation and unchanged operation after lost ack', async () => {
    const editor = await open(),
      intent = editor.prepare(payload(editor.place, { notes: 'Queued note' }));
    loseAck = true;
    await mutationQueue.enqueue({
      id: intent.operation_id,
      tripId: editor.place.trip_id ?? 0,
      method: 'POST',
      url: editor.path,
      body: { observation: intent.observation, form: intent.form },
    });
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(intent.operation_id))?.status).toBe('pending');
    await offlineDb.mutationQueue.update(intent.operation_id, { retryAfter: undefined });
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.get(intent.operation_id)).toBeUndefined();
    expect(receipts.size).toBe(1);
    expect(
      db.rpc.mock.calls
        .filter(([name]) => name === 'save_family_trip_location_form_v1')
        .every(([, args]) => args.p_observation.revision === 1 && args.p_operation_id === intent.operation_id)
    ).toBe(true);
  });
  it('parks queued intent on an account change instead of rebinding it', async () => {
    const editor = await open(),
      intent = editor.prepare(payload(editor.place, { notes: 'Original actor' }));
    await mutationQueue.enqueue({
      id: intent.operation_id,
      tripId: editor.place.trip_id ?? 0,
      method: 'POST',
      url: editor.path,
      body: intent,
    });
    session = { ...session, userId: uuid(92), personId: uuid(93) };
    repo.acceptSession(session);
    db.rpc.mockClear();
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(intent.operation_id))?.status).toBe('conflict');
    expect((await offlineDb.mutationQueue.get(intent.operation_id))?.body).toEqual(intent);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it.each(['place_time', 'assignment_notes', 'image_url', 'transport_mode', 'email', '_pendingImage'] as const)(
    'refuses an unsupported %s edit before any partial save',
    async (key) => {
      const editor = await open();
      db.rpc.mockClear();
      const value =
        key === 'image_url'
          ? null
          : key === '_pendingImage'
            ? { fileId: 5 }
            : key === 'transport_mode'
              ? 'driving'
              : 'Changed';
      if (key === 'image_url') editor.place.image_url = 'https://fixture.example/old.webp';
      await expect(editor.save({ ...payload(editor.place), [key]: value } as PlaceSubmitData)).rejects.toMatchObject({
        code: 'location_form_field_not_connected',
      });
      expect(db.rpc).not.toHaveBeenCalled();
      expect(published.notes).toBeNull();
    }
  );
  it.each([
    ['40001', 409],
    ['42501', 403],
    ['PGRST202', 503],
    ['23514', 422],
  ] as const)('surfaces %s without any old geographic or split-write fallback', async (code, status) => {
    const editor = await open();
    db.rpc.mockClear();
    deny = { code };
    await expect(editor.save(payload(editor.place, { notes: 'Refused' }))).rejects.toMatchObject({
      response: { status },
    });
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(['save_family_trip_location_form_v1']);
  });
  it('fences a same-user person change after commit before cache invalidation or private readback', async () => {
    const editor = await open(),
      invalidate = vi.spyOn(repo, 'invalidate');
    switchScope = true;
    db.rpc.mockClear();
    await expect(editor.save(payload(editor.place, { notes: 'Committed but stale session' }))).rejects.toMatchObject({
      response: { status: 409 },
    });
    expect(invalidate).not.toHaveBeenCalled();
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(['save_family_trip_location_form_v1']);
  });
  it('does not issue a save if canceled during the pre-save identity lookup', async () => {
    const editor = await open();
    const body = editor.prepare(payload(editor.place, { notes: 'Canceled before save' }));
    const view = await repo.views();
    const controller = new AbortController();
    vi.spyOn(repo, 'tripUuid').mockResolvedValue(trip);
    vi.spyOn(repo, 'views')
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
    expect(db.rpc).not.toHaveBeenCalled();
    expect(receipts.size).toBe(0);
  });
  it('preserves a stale queued form body rather than substituting the latest revision', async () => {
    const editor = await open(),
      intent = editor.prepare(payload(editor.place, { notes: 'Stale' }));
    published.revision = 2;
    await mutationQueue.enqueue({
      id: intent.operation_id,
      tripId: editor.place.trip_id ?? 0,
      method: 'POST',
      url: editor.path,
      body: intent,
    });
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(intent.operation_id))?.status).toBe('conflict');
    expect((await offlineDb.mutationQueue.get(intent.operation_id))?.body).toEqual(intent);
  });
  it('fails closed on a response that tries to label a private save as published', async () => {
    const editor = await open('myDraft');
    db.rpc.mockResolvedValueOnce({
      data: {
        version: 1,
        location_id: location,
        revision: 2,
        state: 'published',
        changed: true,
        draft_id: null,
        op_id: null,
      },
      error: null,
    });
    await expect(editor.save(payload(editor.place, { notes: 'Private' }))).rejects.toMatchObject({
      response: { status: 502 },
    });
    expect(await offlineDb.places.count()).toBe(0);
  });
  it('does not pretend that the native modal has offline optimism yet', async () => {
    const editor = await open();
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    db.rpc.mockClear();
    await expect(editor.save(payload(editor.place, { notes: 'Keep in editor' }))).rejects.toMatchObject({
      code: 'location_form_needs_connection',
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('accepts valid upstream field-origin metadata without persisting client provenance claims', async () => {
    const editor = await open();
    const form = {
      ...payload(editor.place, { notes: 'Dinner' }),
      fieldOrigins: { description: 'enrichment' as const },
    };
    await editor.save(form);
    expect(published.notes).toBe('Dinner');
    const call = db.rpc.mock.calls.find(([name]) => name === 'save_family_trip_location_form_v1');
    expect(call?.[1].p_form).not.toHaveProperty('fieldOrigins');
    expect(published.description).toBe('Shared catalog description');
  });
  it('rejects unknown field-origin values before a partial save', async () => {
    const editor = await open();
    db.rpc.mockClear();
    const form = { ...payload(editor.place, { notes: 'Dinner' }), fieldOrigins: { description: 'trusted-server' } };
    await expect(editor.save(form as PlaceSubmitData)).rejects.toMatchObject({
      code: 'location_form_field_not_connected',
    });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(published.notes).toBeNull();
  });
});
