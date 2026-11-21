import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import retainedClient, {
  accommodationsApi,
  apiClient,
  assignmentsApi,
  budgetApi,
  dayNotesApi,
  daysApi,
  filesApi,
  packingApi,
  placesApi,
  reservationsApi,
  todoApi,
  tripsApi,
} from '../../../src/integrations/family/legacy/api/client';

vi.mock('../../../src/integrations/family/legacy/api/websocket', () => ({ getSocketId: () => 'planner-fixture' }));
vi.mock('../../../src/integrations/family/legacy/sync/connectivity', () => ({ probeNow: async () => 'offline' }));

const originalAdapter = apiClient.defaults.adapter;
const trip = '00000000-0000-4000-8000-000000000017';
const payload = { fixture: 'endpoint-response', items: [{ id: 17 }] };
const adapter = vi.fn(async (config: InternalAxiosRequestConfig): Promise<AxiosResponse<typeof payload>> => ({
  config,
  data: payload,
  status: 200,
  statusText: 'OK',
  headers: new AxiosHeaders(),
}));
function request() {
  expect(adapter).toHaveBeenCalledTimes(1);
  const call = adapter.mock.calls[0];
  if (!call) throw new Error('Expected the single recorded planner request.');
  return call[0];
}
function body() {
  const data: unknown = request().data;
  expect(typeof data).toBe('string');
  return JSON.parse(String(data)) as unknown;
}
beforeEach(() => {
  adapter.mockClear();
  apiClient.defaults.adapter = adapter;
});
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
});

describe('retained planner endpoints through the original public entry', () => {
  it('keeps endpoint singletons and the named/default transport across repeated imports', async () => {
    const again = await import('../../../src/integrations/family/legacy/api/client');
    expect(again.tripsApi).toBe(tripsApi);
    expect(again.filesApi).toBe(filesApi);
    expect(again.dayNotesApi).toBe(dayNotesApi);
    expect(again.default).toBe(retainedClient);
    expect(retainedClient).toBe(apiClient);
    expect(adapter).not.toHaveBeenCalled();
  });
  it.each([25, '25', trip])('preserves trip identifier %s and response identity', async (id) => {
    expect(await tripsApi.get(id)).toBe(payload);
    expect(request()).toMatchObject({ method: 'get', url: `/trips/${id}`, timeout: 8000 });
    expect(request().headers.get('X-Socket-Id')).toBe('planner-fixture');
  });
  it('preserves list filters and Axios query serialization', async () => {
    const filters = { archived: false, search: 'Puebla & cafés' };
    await tripsApi.list(filters);
    expect(request().params).toEqual(filters);
    expect(apiClient.getUri(request())).toBe('/api/trips?archived=false&search=Puebla+%26+caf%C3%A9s');
    expect(filters).toEqual({ archived: false, search: 'Puebla & cafés' });
  });
  it('retains omitted copy body and explicit copy options', async () => {
    await tripsApi.copy(trip);
    expect(body()).toEqual({});
    adapter.mockClear();
    const options: Parameters<typeof tripsApi.copy>[1] = { title: 'Second visit' };
    await tripsApi.copy(trip, options);
    expect(body()).toEqual(options);
    expect(request().url).toBe(`/trips/${trip}/copy`);
  });
  it.each([true, false])('sends explicit archive state %s', async (archived) => {
    await (archived ? tripsApi.archive(trip) : tripsApi.unarchive(trip));
    expect(request()).toMatchObject({ method: 'put', url: `/trips/${trip}` });
    expect(body()).toEqual({ is_archived: archived });
  });
  it('does not mutate or sort a day reorder list', async () => {
    const order = Object.freeze([30, 2, 17]);
    await daysApi.reorder(trip, [...order]);
    expect(request().url).toBe(`/trips/${trip}/days/reorder`);
    expect(body()).toEqual({ orderedIds: [30, 2, 17] });
    expect(order).toEqual([30, 2, 17]);
  });
  it('keeps place and trip UUIDs distinct with nullable place updates', async () => {
    const place = '00000000-0000-4000-8000-000000000018';
    const update: Parameters<typeof placesApi.update>[2] = { notes: null };
    expect(await placesApi.update(trip, place, update)).toBe(payload);
    expect(request().url).toBe(`/trips/${trip}/places/${place}`);
    expect(body()).toEqual(update);
  });
  it('keeps assignment identity and an explicitly null destination position', async () => {
    await assignmentsApi.move(trip, 81, 'day-19', null);
    expect(request().url).toBe(`/trips/${trip}/assignments/81/move`);
    expect(body()).toEqual({ new_day_id: 'day-19', order_index: null });
  });
  it('retains cleared visit times instead of inventing midnight', async () => {
    await assignmentsApi.updateTime(trip, 81, { place_time: null, end_time: null });
    expect(request().url).toBe(`/trips/${trip}/assignments/81/time`);
    expect(body()).toEqual({ place_time: null, end_time: null });
  });
  it('preserves participants order including an empty selection', async () => {
    await assignmentsApi.setParticipants(trip, 81, []);
    expect(body()).toEqual({ user_ids: [] });
    expect(request().url).toBe(`/trips/${trip}/assignments/81/participants`);
  });
  it('keeps packing quantities, unchecked state and cleared bag/weight', async () => {
    const update = { quantity: 0, checked: false, bag_id: null, weight_grams: null };
    await packingApi.update(trip, 9, update);
    expect(request().url).toBe(`/trips/${trip}/packing/9`);
    expect(body()).toEqual(update);
  });
  it('encodes a packing category once without changing the caller text', async () => {
    await packingApi.setCategoryAssignees(trip, 'Food / café', [9, 2]);
    expect(request().url).toBe(`/trips/${trip}/packing/category-assignees/Food%20%2F%20caf%C3%A9`);
    expect(body()).toEqual({ user_ids: [9, 2] });
  });
  it('retains the common template visibility default', async () => {
    await packingApi.applyTemplate(trip, 6);
    expect(request().url).toBe(`/trips/${trip}/packing/apply-template/6`);
    expect(body()).toEqual({ visibility: 'common' });
  });
  it('preserves task completion false and category text', async () => {
    const update: Parameters<typeof todoApi.update>[2] = { checked: false, category: 'Travel' };
    await todoApi.update(trip, 14, update);
    expect(request().url).toBe(`/trips/${trip}/todo/14`);
    expect(body()).toEqual(update);
  });
  it('does not coerce budget payer amounts or reorder the payers', async () => {
    const payers = [
      { user_id: 8, amount: 0 },
      { user_id: 2, amount: 12.75 },
    ];
    await budgetApi.setPayers(trip, 12, payers);
    expect(request().url).toBe(`/trips/${trip}/budget/12/payers`);
    expect(body()).toEqual({ payers });
  });
  it.each([undefined, 'MXN'])('retains optional settlement currency %s', async (base) => {
    expect(await budgetApi.settlement(trip, base)).toBe(payload);
    expect(request().url).toBe(`/trips/${trip}/budget/settlement`);
    expect(request().params).toEqual(base ? { base } : undefined);
  });
  it.each([undefined, false, true])('preserves file Trash filter %s', async (trash) => {
    await filesApi.list(trip, trash);
    expect(request().params).toEqual(trash ? { trash: 'true' } : {});
    expect(request().url).toBe(`/trips/${trip}/files`);
  });
  it('passes the original multipart body, progress callback, abort signal and retry key', async () => {
    const data = new FormData();
    data.append('file', new File(['fixture bytes'], 'notes.txt', { type: 'text/plain' }));
    const controller = new AbortController();
    const progress = vi.fn();
    expect(
      await filesApi.upload(trip, data, {
        signal: controller.signal,
        onUploadProgress: progress,
        idempotencyKey: 'planner-original-operation',
      })
    ).toBe(payload);
    expect(request()).toMatchObject({ url: `/trips/${trip}/files`, method: 'post', timeout: 0 });
    expect(request().data).toBe(data);
    expect(request().signal).toBe(controller.signal);
    expect(request().onUploadProgress).toBe(progress);
    expect(request().headers.get('X-Idempotency-Key')).toBe('planner-original-operation');
  });
  it('preserves explicit false import options and omits undecided options', async () => {
    const file = new File(['<gpx/>'], 'route.gpx');
    await placesApi.importGpx(trip, file, { waypoints: false, tracks: true });
    expect(request().timeout).toBe(0);
    expect(request().url).toBe(`/trips/${trip}/places/import/gpx`);
    expect(request().data).toBeInstanceOf(FormData);
    const data = request().data as FormData;
    expect([...data.keys()]).toEqual(['file', 'importWaypoints', 'importTracks']);
    expect(data.get('importWaypoints')).toBe('false');
    expect(data.get('importTracks')).toBe('true');
    expect(data.get('file')).toBe(file);
  });
  it('keeps booking positions and an omitted day without changing source objects', async () => {
    const positions = [
      { id: 4, day_plan_position: 0 },
      { id: 2, day_plan_position: 5 },
    ];
    await reservationsApi.updatePositions(trip, positions);
    expect(body()).toEqual({ positions });
    expect(request().url).toBe(`/trips/${trip}/reservations/positions`);
    expect(positions).toEqual([
      { id: 4, day_plan_position: 0 },
      { id: 2, day_plan_position: 5 },
    ]);
  });
  it('preserves ordered booking files and the no-AI import default', async () => {
    const files = [new File(['first'], 'first.pdf'), new File(['second'], 'second.pdf')];
    expect(await reservationsApi.importBookingPreview(trip, files)).toBe(payload);
    const data = request().data as FormData;
    expect(data.getAll('files')).toEqual(files);
    expect(data.get('mode')).toBe('no-ai');
    expect(request().timeout).toBe(0);
    expect(request().url).toBe(`/trips/${trip}/reservations/import/booking`);
  });
  it('preserves lodging links and explicitly cleared confirmation and times', async () => {
    const data: Parameters<typeof accommodationsApi.update>[2] = {
      reservation_id: 42,
      start_day_id: 'day-1',
      end_day_id: 'day-3',
      confirmation: null,
      check_in: null,
    };
    await accommodationsApi.update(trip, 7, data);
    expect(request().url).toBe(`/trips/${trip}/accommodations/7`);
    expect(body()).toEqual(data);
  });
  it('sends a deliberately empty day note instead of discarding it', async () => {
    expect(await dayNotesApi.update(trip, 'day-3', 4, { text: '', time: '', sort_order: 0 })).toBe(payload);
    expect(request().url).toBe(`/trips/${trip}/days/day-3/notes/4`);
    expect(body()).toEqual({ text: '', time: '', sort_order: 0 });
  });
  it('propagates the original server refusal without replaying the write', async () => {
    const refusal = new AxiosError('controlled conflict', 'ERR_BAD_RESPONSE');
    apiClient.defaults.adapter = () => Promise.reject(refusal);
    await expect(todoApi.update(trip, 14, { checked: true })).rejects.toBe(refusal);
    expect(adapter).not.toHaveBeenCalled();
  });
});
