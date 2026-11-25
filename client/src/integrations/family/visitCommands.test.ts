import axios from 'axios';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { familyRepositoryFixture } from '../../../tests/helpers/familyRepository';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import api from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyIdentityRegistry } from './identity';
import type { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter, createFamilyFetch } from './transport';

const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
const uuid = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = uuid(1),
  day = uuid(2),
  prefix = `/trips/${trip}/family/visits`;
type Row = {
  id: string;
  trip_id: string;
  activity: string;
  starts_at: string | null;
  ends_at: string | null;
  time_zone: string | null;
  sort_order: number;
  explanations: string | null;
  updated_at: string;
  plan_location_id: null;
  location: null;
  timing_kind: 'untimed' | 'legacy' | 'timed';
  planned_duration_minutes?: number | null;
  start_local?: string | null;
  end_local?: string | null;
  trip_day_id: string | null;
  planning_day: string | null;
  revision: number;
  duration_minutes: number | null;
  deleted_at: string | null;
};
const rows = new Map<string, Row>();
const timingHistory = new Map<
  string,
  {
    version: number;
    visit_id: string;
    revision_before: number;
    before_timing: ReturnType<typeof timingState>;
    after_timing: ReturnType<typeof timingState>;
    input_basis: string;
    recorded_at: string;
  }
>();
const histories = new Map<
  string,
  {
    original_revision: number;
    classified_at: string;
    original_timing: { starts_at: string | null; ends_at: string | null; time_zone: string | null };
  }
>();
const receipts = new Map<
  string,
  { request: string; result: { id: string; revision: number; deleted_at: string | null } }
>();
let client: ReturnType<typeof axios.create>,
  handler: ReturnType<typeof createFamilyApplicationHandler>,
  ids: FamilyIdentityRegistry;
let deny: { code: string; message: string } | null, loseAck: boolean, switchSession: boolean;
const invalidate = vi.fn(),
  originalAdapter = api.defaults.adapter;

beforeEach(async () => {
  await resetOfflineTestDatabase();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  rows.clear();
  histories.clear();
  timingHistory.clear();
  receipts.clear();
  deny = null;
  loseAck = false;
  switchSession = false;
  invalidate.mockClear();
  ids = new FamilyIdentityRegistry(uuid(9));
  boundary.rpc.mockReset();
  boundary.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (deny) return { data: null, error: deny };
    if (name === 'get_family_trip_visit_v1')
      return { data: { version: 1, visit: rows.get(String(args.p_visit_id)) }, error: null };
    if (name === 'get_family_trip_visit_classification_v1')
      return {
        data: { version: 1, visit_id: args.p_visit_id, classification: histories.get(String(args.p_visit_id)) ?? null },
        error: null,
      };
    if (name === 'get_family_trip_visit_timing_revision_v1')
      return { data: timingHistory.get(String(args.p_visit_id) + '/' + String(args.p_revision)), error: null };
    if (
      ![
        'mutate_family_trip_visit_v1',
        'classify_family_trip_visit_untimed_v1',
        'set_family_trip_visit_timing_v1',
      ].includes(name)
    )
      throw new Error('Unexpected RPC ' + name);
    const op = String(args.p_operation_id),
      request = JSON.stringify(args),
      replay = receipts.get(op);
    if (replay)
      return replay.request === request
        ? { data: replay.result, error: null }
        : { data: null, error: { code: '40001', message: 'Changed intent' } };
    const payload = args.p_payload as Record<string, unknown>;
    let row: Row;
    if (args.p_action === 'create') {
      row = {
        id: uuid(100 + rows.size),
        trip_id: trip,
        activity: String(payload.activity),
        starts_at: null,
        ends_at: null,
        time_zone: null,
        sort_order: rows.size,
        explanations: null,
        updated_at: '2026-11-04T00:00:00Z',
        plan_location_id: null,
        location: null,
        timing_kind: 'untimed',
        trip_day_id: null,
        planning_day: null,
        revision: 1,
        duration_minutes: null,
        deleted_at: null,
      };
    } else {
      const existing = rows.get(String(args.p_visit_id));
      if (!existing || existing.revision !== args.p_expected_revision)
        return { data: null, error: { code: '40001', message: 'Reload revision' } };
      row = { ...existing, revision: existing.revision + 1 };
    }
    if (name === 'set_family_trip_visit_timing_v1') {
      const old = rows.get(row.id);
      if (!old) throw new Error('Missing timing fixture');
      const before = timingState(old);
      if ('restore_revision' in payload) {
        const saved = timingHistory.get(row.id + '/' + String(payload.restore_revision));
        if (!saved) return { data: null, error: { code: '42501', message: 'History unavailable' } };
        const source = saved.before_timing;
        Object.assign(row, source);
        row.duration_minutes = source.planned_duration_minutes;
      } else {
        const timing = payload.timing as {
          kind: 'timed' | 'untimed';
          starts_at?: string | null;
          ends_at?: string | null;
          time_zone?: string;
          basis?: string;
        };
        row.timing_kind = timing.kind;
        row.starts_at = timing.starts_at ?? null;
        row.ends_at = timing.ends_at ?? null;
        row.time_zone = timing.time_zone ?? null;
        row.planned_duration_minutes = (payload.duration_minutes as number | null) ?? null;
        row.duration_minutes =
          row.ends_at && row.starts_at
            ? (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000
            : row.planned_duration_minutes;
      }
      if ('day_id' in payload) row.trip_day_id = payload.day_id as string | null;
      timingHistory.set(row.id + '/' + String(old.revision), {
        version: 1,
        visit_id: row.id,
        revision_before: old.revision,
        before_timing: before,
        after_timing: timingState(row),
        input_basis:
          'restore_revision' in payload ? 'restore' : String((payload.timing as { basis?: string }).basis ?? 'untimed'),
        recorded_at: '2026-11-04T00:00:00Z',
      });
    }
    if (name === 'classify_family_trip_visit_untimed_v1') {
      histories.set(row.id, {
        original_revision: row.revision - 1,
        classified_at: '2026-11-04T00:00:00Z',
        original_timing: { starts_at: row.starts_at, ends_at: row.ends_at, time_zone: row.time_zone },
      });
      row.timing_kind = 'untimed';
      row.starts_at = null;
      row.ends_at = null;
      row.time_zone = null;
    }
    if ('day_id' in payload) {
      row.trip_day_id = payload.day_id as string | null;
      row.planning_day = row.trip_day_id ? '2027-04-01' : null;
    }
    if ('notes' in payload) row.explanations = payload.notes as string | null;
    if ('duration_minutes' in payload && name !== 'set_family_trip_visit_timing_v1')
      row.duration_minutes = payload.duration_minutes as number | null;
    if ('activity' in payload) row.activity = String(payload.activity);
    if (args.p_action === 'trash') row.deleted_at = '2026-11-04T00:00:00Z';
    if (args.p_action === 'restore') row.deleted_at = null;
    rows.set(row.id, row);
    const result = {
      id: row.id,
      revision: row.revision,
      deleted_at: row.deleted_at,
      ...(name === 'set_family_trip_visit_timing_v1' ? { timing_revision: row.revision - 1 } : {}),
    };
    receipts.set(op, { request, result });
    if (switchSession) ids = new FamilyIdentityRegistry(uuid(99));
    if (loseAck) {
      loseAck = false;
      return { data: null, error: { message: 'Connection lost after commit' } };
    }
    return { data: result, error: null };
  });
  const repo = familyRepositoryFixture(uuid(9), () => ids, {
    tripUuid: async () => trip,
    invalidate,
  }) as unknown as FamilyFrontendRepository;
  handler = createFamilyApplicationHandler(repo);
  const adapter = createFamilyAxiosAdapter(handler);
  client = axios.create({ adapter });
  api.defaults.adapter = adapter;
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  setAuthed(false);
  vi.restoreAllMocks();
});
async function create(operation = uuid(10)) {
  return (await client.post(prefix, { operation_id: operation, activity: 'Visit', day_id: day })).data;
}

describe('Explicit visits through real Family HTTP orchestration', () => {
  it('creates and reloads an untimed day without a midnight timestamp', async () => {
    const result = await create();
    const detail = (await client.get(prefix + '/' + result.visit.id)).data;
    expect(detail.visit).toMatchObject({
      timing_kind: 'untimed',
      trip_day_id: day,
      starts_at: null,
      ends_at: null,
      duration_minutes: null,
      revision: 1,
    });
    expect(result.operation.id).toBe(result.visit.id);
    expect(invalidate).toHaveBeenCalledWith(trip);
  });
  it('distinguishes retry from a separate repeated visit', async () => {
    const first = await create();
    expect((await create()).visit.id).toBe(first.visit.id);
    expect((await create(uuid(11))).visit.id).not.toBe(first.visit.id);
    expect(rows.size).toBe(2);
  });
  it('rejects changed operation reuse and stale saves', async () => {
    const first = await create();
    await client.put(prefix + '/' + first.visit.id, { operation_id: uuid(11), expected_revision: 1, notes: 'Later' });
    await expect(
      client.put(prefix + '/' + first.visit.id, { operation_id: uuid(12), expected_revision: 1, notes: 'Stale' })
    ).rejects.toMatchObject({ response: { status: 409 } });
    await expect(client.post(prefix, { operation_id: uuid(10), activity: 'Changed' })).rejects.toMatchObject({
      response: { status: 409 },
    });
  });
  it('returns a fresh saved state separately from an old immutable receipt', async () => {
    const first = await create();
    await client.put(prefix + '/' + first.visit.id, {
      operation_id: uuid(11),
      expected_revision: 1,
      notes: 'Keep newer',
    });
    const replay = await create();
    expect(replay.operation.revision).toBe(1);
    expect(replay.visit.revision).toBe(2);
    expect(replay.visit.explanations).toBe('Keep newer');
  });
  it('moves, unassigns and preserves zero versus unknown duration', async () => {
    const first = await create();
    const moved = (
      await client.put(prefix + '/' + first.visit.id, {
        operation_id: uuid(11),
        expected_revision: 1,
        day_id: null,
        duration_minutes: 0,
      })
    ).data;
    expect(moved.visit.trip_day_id).toBeNull();
    expect(moved.visit.duration_minutes).toBe(0);
    const reset = (
      await client.put(prefix + '/' + first.visit.id, {
        operation_id: uuid(12),
        expected_revision: 2,
        duration_minutes: null,
      })
    ).data;
    expect(reset.visit.duration_minutes).toBeNull();
    expect(reset.visit.starts_at).toBeNull();
  });
  it('performs checked Trash and Restore with the original identity', async () => {
    const first = await create();
    const hidden = (
      await client.post(prefix + '/' + first.visit.id + '/trash', { operation_id: uuid(11), expected_revision: 1 })
    ).data;
    expect(hidden.visit.deleted_at).not.toBeNull();
    const restored = (
      await client.post(prefix + '/' + first.visit.id + '/restore', {
        operation_id: uuid(12),
        expected_revision: hidden.visit.revision,
      })
    ).data;
    expect(restored.visit.id).toBe(first.visit.id);
    expect(restored.visit.deleted_at).toBeNull();
  });
  it('rejects unsupported times, missing revisions and conflicting retry metadata before writing', async () => {
    await expect(
      client.post(prefix, { operation_id: uuid(10), activity: 'Invalid', starts_at: '2027-04-01T00:00:00Z' })
    ).rejects.toMatchObject({ response: { status: 400 } });
    await expect(
      client.put(prefix + '/' + uuid(100), { operation_id: uuid(10), notes: 'No revision' })
    ).rejects.toMatchObject({ response: { status: 400 } });
    await expect(
      client.post(
        prefix,
        { operation_id: uuid(10), activity: 'Mismatch' },
        { headers: { 'X-Idempotency-Key': uuid(11) } }
      )
    ).rejects.toMatchObject({ response: { status: 400 } });
    await expect(
      client.post(
        prefix,
        { operation_id: uuid(10), activity: 'Unsafe base' },
        { headers: { 'X-Base-Updated-At': '2026-01-01' } }
      )
    ).rejects.toMatchObject({ response: { status: 409 } });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it('rechecks access on replay and reports missing migration instead of success', async () => {
    await create();
    deny = { code: '42501', message: 'Current access revoked' };
    await expect(create()).rejects.toMatchObject({ response: { status: 403 } });
    deny = { code: 'PGRST202', message: 'Not installed' };
    await expect(create()).rejects.toMatchObject({ response: { status: 503 } });
  });
  it('does not invalidate or expose an old scope after session changes during save', async () => {
    switchSession = true;
    await expect(create()).rejects.toMatchObject({ response: { status: 409 } });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('rejects an inconsistent current response', async () => {
    const first = await create();
    const row = rows.get(first.visit.id);
    if (!row) throw new Error('Missing fixture');
    row.trip_id = uuid(99);
    await expect(client.get(prefix + '/' + row.id)).rejects.toMatchObject({ response: { status: 502 } });
  });
  it('does not duplicate a save after a lost commit acknowledgement', async () => {
    loseAck = true;
    await expect(create()).rejects.toMatchObject({ response: { status: 503 } });
    const retry = await create();
    expect(retry.visit.revision).toBe(1);
    expect(rows.size).toBe(1);
  });
  it('preserves retry IDs through Fetch as well as Axios', async () => {
    const network = vi.fn();
    const fetcher = createFamilyFetch(handler, network, 'https://family.fixture.invalid');
    const response = await fetcher('/api' + prefix, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': uuid(20) },
      body: JSON.stringify({ activity: 'Fetch replay' }),
    });
    expect(response.status).toBe(200);
    expect(network).not.toHaveBeenCalled();
    expect(boundary.rpc).toHaveBeenCalledWith(
      'mutate_family_trip_visit_v1',
      expect.objectContaining({ p_operation_id: uuid(20) })
    );
  });
  it('replays the real native offline queue through the Family adapter after a lost acknowledgement', async () => {
    const id = uuid(30);
    loseAck = true;
    await mutationQueue.enqueue({
      id,
      tripId: ids.register('trip', trip),
      method: 'POST',
      url: prefix,
      body: { activity: 'Queued explicit visit' },
    });
    await mutationQueue.flush();
    expect(rows.size).toBe(1);
    expect((await offlineDb.mutationQueue.get(id))?.status).toBe('pending');
    await offlineDb.mutationQueue.update(id, { retryAfter: undefined });
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.get(id)).toBeUndefined();
    expect(rows.size).toBe(1);
    const calls = boundary.rpc.mock.calls.filter(([name]) => name === 'mutate_family_trip_visit_v1');
    expect(calls).toHaveLength(2);
    expect(calls.every(([, args]) => args.p_operation_id === id)).toBe(true);
  });
});

function timingState(row: Row) {
  return {
    timing_kind: row.timing_kind,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    time_zone: row.time_zone,
    trip_day_id: row.trip_day_id,
    planned_duration_minutes:
      row.planned_duration_minutes !== undefined ? row.planned_duration_minutes : row.duration_minutes,
  };
}

const observed = {
  starts_at: '2027-04-01T00:00:00Z',
  ends_at: '2027-04-01T01:00:00Z',
  time_zone: 'America/Mexico_City',
};
async function legacy() {
  const result = await create();
  const row = rows.get(result.visit.id);
  if (!row) throw new Error('Missing legacy fixture');
  Object.assign(row, observed, { timing_kind: 'legacy', explanations: 'Keep note' });
  return row;
}
const classificationBody = () => ({
  operation_id: uuid(40),
  expected_revision: 1,
  day_id: day,
  observed_timing: observed,
});

describe('Explicit legacy classification through the actual handler and transport', () => {
  it('classifies the same occurrence and reloads its retained timing', async () => {
    const row = await legacy();
    const result = (await client.post(prefix + '/' + row.id + '/classify-untimed', classificationBody())).data;
    expect(result.visit).toMatchObject({
      id: row.id,
      timing_kind: 'untimed',
      starts_at: null,
      ends_at: null,
      time_zone: null,
      explanations: 'Keep note',
      revision: 2,
    });
    const history = (await client.get(prefix + '/' + row.id + '/legacy-timing')).data;
    expect(history.classification).toMatchObject({ original_revision: 1, original_timing: observed });
    expect(boundary.rpc).toHaveBeenCalledWith(
      'classify_family_trip_visit_untimed_v1',
      expect.objectContaining({
        p_visit_id: row.id,
        p_expected_revision: 1,
        p_payload: { day_id: day, observed_timing: observed },
      })
    );
  });
  it('leaves legacy state unchanged on a normal read and allows no history', async () => {
    const row = await legacy();
    expect((await client.get(prefix + '/' + row.id)).data.visit.timing_kind).toBe('legacy');
    expect((await client.get(prefix + '/' + row.id + '/legacy-timing')).data.classification).toBeNull();
    expect(histories.size).toBe(0);
  });
  it('requires an observed revision, deliberate day choice and complete original timing', async () => {
    const row = await legacy();
    boundary.rpc.mockClear();
    for (const body of [
      { operation_id: uuid(40) },
      { ...classificationBody(), day_id: undefined },
      { ...classificationBody(), observed_timing: { starts_at: observed.starts_at } },
      { ...classificationBody(), starts_at: observed.starts_at },
      { ...classificationBody(), observed_timing: { ...observed, starts_at: '2027-04-01T00:00:00' } },
      { ...classificationBody(), duration_minutes: true },
    ])
      await expect(client.post(prefix + '/' + row.id + '/classify-untimed', body)).rejects.toMatchObject({
        response: { status: 400 },
      });
    expect(boundary.rpc).not.toHaveBeenCalled();
    expect(row.timing_kind).toBe('legacy');
  });
  it('preserves retry intent after a lost classification acknowledgement', async () => {
    const row = await legacy();
    loseAck = true;
    await expect(client.post(prefix + '/' + row.id + '/classify-untimed', classificationBody())).rejects.toMatchObject({
      response: { status: 503 },
    });
    const replay = (await client.post(prefix + '/' + row.id + '/classify-untimed', classificationBody())).data;
    expect(replay.visit.revision).toBe(2);
    expect(rows.size).toBe(1);
    expect(histories.size).toBe(1);
  });
  it('maps stale, denied and missing-migration failures without optimistic success', async () => {
    const row = await legacy();
    invalidate.mockClear();
    for (const [code, status] of [
      ['40001', 409],
      ['42501', 403],
      ['PGRST202', 503],
    ] as const) {
      deny = { code, message: 'Database refused classification' };
      await expect(
        client.post(prefix + '/' + row.id + '/classify-untimed', classificationBody())
      ).rejects.toMatchObject({ response: { status } });
    }
    expect(row.timing_kind).toBe('legacy');
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('fences a session change after classification and before exposing the result', async () => {
    const row = await legacy();
    invalidate.mockClear();
    switchSession = true;
    await expect(client.post(prefix + '/' + row.id + '/classify-untimed', classificationBody())).rejects.toMatchObject({
      response: { status: 409 },
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('rejects wrong-occurrence receipts and history responses', async () => {
    const row = await legacy();
    invalidate.mockClear();
    boundary.rpc.mockResolvedValueOnce({ data: { id: uuid(999), revision: 2, deleted_at: null }, error: null });
    await expect(client.post(prefix + '/' + row.id + '/classify-untimed', classificationBody())).rejects.toMatchObject({
      response: { status: 502 },
    });
    expect(invalidate).not.toHaveBeenCalled();
    boundary.rpc.mockResolvedValueOnce({
      data: { version: 1, visit_id: uuid(999), classification: null },
      error: null,
    });
    await expect(client.get(prefix + '/' + row.id + '/legacy-timing')).rejects.toMatchObject({
      response: { status: 502 },
    });
  });
  it('preserves classification retry metadata through Fetch', async () => {
    const row = await legacy();
    const fetcher = createFamilyFetch(handler, vi.fn(), 'https://family.fixture.invalid');
    const { operation_id: _intent, ...body } = classificationBody();
    const response = await fetcher('/api' + prefix + '/' + row.id + '/classify-untimed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': uuid(40) },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    expect(boundary.rpc).toHaveBeenCalledWith(
      'classify_family_trip_visit_untimed_v1',
      expect.objectContaining({ p_operation_id: uuid(40) })
    );
  });
  it('replays native queued classification once after a lost acknowledgement', async () => {
    const row = await legacy();
    loseAck = true;
    const { operation_id: _intent, ...body } = classificationBody();
    const id = uuid(50);
    await mutationQueue.enqueue({
      id,
      tripId: ids.register('trip', trip),
      method: 'POST',
      url: prefix + '/' + row.id + '/classify-untimed',
      body,
    });
    await mutationQueue.flush();
    expect(histories.size).toBe(1);
    expect((await offlineDb.mutationQueue.get(id))?.status).toBe('pending');
    await offlineDb.mutationQueue.update(id, { retryAfter: undefined });
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.get(id)).toBeUndefined();
    expect(histories.size).toBe(1);
    expect(rows.get(row.id)?.revision).toBe(2);
    expect(
      boundary.rpc.mock.calls
        .filter(([name]) => name === 'classify_family_trip_visit_untimed_v1')
        .every(([, args]) => args.p_operation_id === id)
    ).toBe(true);
  });
  it('keeps classification history read-only and rejects query or retry-header ambiguity', async () => {
    const row = await legacy();
    boundary.rpc.mockClear();
    await expect(
      client.post(prefix + '/' + row.id + '/legacy-timing', { operation_id: uuid(40), expected_revision: 1 })
    ).rejects.toMatchObject({ response: { status: 405 } });
    await expect(
      client.post(prefix + '/' + row.id + '/classify-untimed?unknown=true', classificationBody())
    ).rejects.toMatchObject({ response: { status: 400 } });
    await expect(
      client.post(prefix + '/' + row.id + '/classify-untimed', classificationBody(), {
        headers: { 'X-Idempotency-Key': uuid(41) },
      })
    ).rejects.toMatchObject({ response: { status: 400 } });
    await expect(
      client.post(prefix + '/' + row.id + '/classify-untimed', classificationBody(), {
        headers: { 'X-Base-Updated-At': '2026-11-04' },
      })
    ).rejects.toMatchObject({ response: { status: 409 } });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
});

const timedBody = () => ({
  operation_id: uuid(70),
  expected_revision: 1,
  day_id: day,
  timing: {
    kind: 'timed',
    basis: 'instant',
    starts_at: '2027-04-01T19:00:00Z',
    ends_at: '2027-04-01T20:00:30Z',
    time_zone: 'UTC',
  },
});
describe('Named-zone timing through real Family HTTP and native queue orchestration', () => {
  it('saves the complete timing pair and reads fractional elapsed duration', async () => {
    const first = await create();
    const result = (await client.put(prefix + '/' + first.visit.id + '/timing', timedBody())).data;
    expect(result.visit).toMatchObject({
      id: first.visit.id,
      timing_kind: 'timed',
      starts_at: '2027-04-01T19:00:00Z',
      ends_at: '2027-04-01T20:00:30Z',
      time_zone: 'UTC',
      duration_minutes: 60.5,
      planned_duration_minutes: null,
    });
    expect(result.operation.timing_revision).toBe(1);
    expect(boundary.rpc).toHaveBeenCalledWith(
      'set_family_trip_visit_timing_v1',
      expect.objectContaining({
        p_trip_id: trip,
        p_visit_id: first.visit.id,
        p_expected_revision: 1,
        p_payload: { day_id: day, timing: timedBody().timing },
      })
    );
  });
  it('reads retained timing and restores it without overwriting newer notes', async () => {
    const first = await create();
    const path = prefix + '/' + first.visit.id;
    await client.put(path + '/timing', timedBody());
    const history = (await client.get(path + '/timing-history/1')).data;
    expect(history.before_timing.timing_kind).toBe('untimed');
    expect(history.after_timing.timing_kind).toBe('timed');
    await client.put(path, { operation_id: uuid(71), expected_revision: 2, notes: 'Keep newer note' });
    const restored = (
      await client.put(path + '/timing', { operation_id: uuid(72), expected_revision: 3, restore_revision: 1 })
    ).data;
    expect(restored.visit).toMatchObject({ timing_kind: 'untimed', starts_at: null, explanations: 'Keep newer note' });
  });
  it('requires revision, explicit day, offset, zone, complete End and one duration authority', async () => {
    const first = await create();
    boundary.rpc.mockClear();
    const good = timedBody();
    for (const body of [
      { ...good, expected_revision: undefined },
      { ...good, day_id: undefined },
      { ...good, timing: { ...good.timing, ends_at: undefined } },
      { ...good, timing: { ...good.timing, starts_at: '2027-04-01T19:00:00' } },
      { ...good, timing: { ...good.timing, starts_at: '2027-04-01T19:00:00.1234567Z' } },
      { ...good, timing: { ...good.timing, time_zone: undefined } },
      { ...good, duration_minutes: 60 },
      { ...good, unexpected: true },
    ])
      await expect(client.put(prefix + '/' + first.visit.id + '/timing', body)).rejects.toMatchObject({
        response: { status: 400 },
      });
    expect(boundary.rpc).not.toHaveBeenCalled();
    expect(rows.get(first.visit.id)?.timing_kind).toBe('untimed');
  });
  it('maps gap, stale, denied and unqualified-database failures without false success', async () => {
    const first = await create();
    invalidate.mockClear();
    for (const [code, status] of [
      ['22008', 400],
      ['40001', 409],
      ['42501', 403],
      ['PGRST202', 503],
      ['55000', 503],
      ['0A000', 409],
    ] as const) {
      deny = { code, message: 'Database refused timing' };
      await expect(client.put(prefix + '/' + first.visit.id + '/timing', timedBody())).rejects.toMatchObject({
        response: { status },
      });
    }
    expect(invalidate).not.toHaveBeenCalled();
    expect(timingHistory.size).toBe(0);
  });
  it('replays one timing change after losing the commit acknowledgement', async () => {
    const first = await create();
    loseAck = true;
    const path = prefix + '/' + first.visit.id + '/timing';
    await expect(client.put(path, timedBody())).rejects.toMatchObject({ response: { status: 503 } });
    const replay = (await client.put(path, timedBody())).data;
    expect(replay.visit.revision).toBe(2);
    expect(rows.size).toBe(1);
    expect(timingHistory.size).toBe(1);
  });
  it('fences the old Family session before invalidation/readback', async () => {
    const first = await create();
    invalidate.mockClear();
    switchSession = true;
    await expect(client.put(prefix + '/' + first.visit.id + '/timing', timedBody())).rejects.toMatchObject({
      response: { status: 409 },
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('rejects wrong-occurrence receipts and wrong historical revisions', async () => {
    const first = await create();
    const path = prefix + '/' + first.visit.id;
    invalidate.mockClear();
    boundary.rpc.mockResolvedValueOnce({
      data: { id: uuid(999), revision: 2, deleted_at: null, timing_revision: 1 },
      error: null,
    });
    await expect(client.put(path + '/timing', timedBody())).rejects.toMatchObject({ response: { status: 502 } });
    expect(invalidate).not.toHaveBeenCalled();
    await client.put(path + '/timing', timedBody());
    const source = timingHistory.get(first.visit.id + '/1');
    if (!source) throw new Error('Missing history fixture');
    boundary.rpc.mockResolvedValueOnce({ data: { ...source, revision_before: 2 }, error: null });
    await expect(client.get(path + '/timing-history/1')).rejects.toMatchObject({ response: { status: 502 } });
  });
  it('preserves timing retry headers through Fetch', async () => {
    const first = await create();
    const { operation_id: _intent, ...body } = timedBody();
    const fetcher = createFamilyFetch(handler, vi.fn(), 'https://family.fixture.invalid');
    const response = await fetcher('/api' + prefix + '/' + first.visit.id + '/timing', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': uuid(70) },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    expect(boundary.rpc).toHaveBeenCalledWith(
      'set_family_trip_visit_timing_v1',
      expect.objectContaining({ p_operation_id: uuid(70) })
    );
  });
  it('replays the actual native queue with one timing revision after a lost acknowledgement', async () => {
    const first = await create();
    loseAck = true;
    const { operation_id: _intent, ...body } = timedBody();
    const id = uuid(75);
    await mutationQueue.enqueue({
      id,
      tripId: ids.register('trip', trip),
      method: 'PUT',
      url: prefix + '/' + first.visit.id + '/timing',
      body,
    });
    await mutationQueue.flush();
    expect(timingHistory.size).toBe(1);
    expect((await offlineDb.mutationQueue.get(id))?.status).toBe('pending');
    await offlineDb.mutationQueue.update(id, { retryAfter: undefined });
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.get(id)).toBeUndefined();
    expect(timingHistory.size).toBe(1);
    expect(rows.get(first.visit.id)?.revision).toBe(2);
    const calls = boundary.rpc.mock.calls.filter(([name]) => name === 'set_family_trip_visit_timing_v1');
    expect(calls).toHaveLength(2);
    expect(calls.every(([, args]) => args.p_operation_id === id)).toBe(true);
  });
  it('keeps history read-only and refuses ambiguous method/query/retry metadata', async () => {
    const first = await create();
    const path = prefix + '/' + first.visit.id;
    boundary.rpc.mockClear();
    await expect(client.get(path + '/timing')).rejects.toMatchObject({ response: { status: 405 } });
    await expect(client.put(path + '/timing-history/1', timedBody())).rejects.toMatchObject({
      response: { status: 405 },
    });
    await expect(client.get(path + '/timing-history/1?unknown=true')).rejects.toMatchObject({
      response: { status: 400 },
    });
    await expect(client.get(path + '/timing-history/1e3')).rejects.toMatchObject({ response: { status: 400 } });
    await expect(client.put(path + '/timing?unknown=true', timedBody())).rejects.toMatchObject({
      response: { status: 400 },
    });
    await expect(
      client.put(path + '/timing', timedBody(), { headers: { 'X-Idempotency-Key': uuid(71) } })
    ).rejects.toMatchObject({ response: { status: 400 } });
    await expect(
      client.put(path + '/timing', timedBody(), { headers: { 'X-Base-Updated-At': '2026-11-04' } })
    ).rejects.toMatchObject({ response: { status: 409 } });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
});

describe('Independent endpoint intent through Family dispatcher and native queue', () => {
  const endOnly = () => ({ ...timedBody(), timing: { ...timedBody().timing, starts_at: null } });
  it('saves End-only timing without an invented Start or elapsed duration', async () => {
    const first = await create();
    const result = (await client.put(prefix + '/' + first.visit.id + '/timing', endOnly())).data;
    expect(result.visit).toMatchObject({
      starts_at: null,
      ends_at: endOnly().timing.ends_at,
      duration_minutes: null,
      timing_kind: 'timed',
    });
    expect(boundary.rpc).toHaveBeenCalledWith(
      'set_family_trip_visit_timing_v1',
      expect.objectContaining({ p_payload: { day_id: day, timing: endOnly().timing } })
    );
  });
  it('clears Start, then End, then both using explicit complete intent', async () => {
    const first = await create(),
      path = prefix + '/' + first.visit.id + '/timing';
    await client.put(path, timedBody());
    await client.put(path, { ...endOnly(), operation_id: uuid(71), expected_revision: 2 });
    expect(rows.get(first.visit.id)?.starts_at).toBeNull();
    await client.put(path, {
      ...timedBody(),
      operation_id: uuid(72),
      expected_revision: 3,
      timing: { ...timedBody().timing, ends_at: null },
    });
    expect(rows.get(first.visit.id)?.ends_at).toBeNull();
    const result = (
      await client.put(path, { operation_id: uuid(73), expected_revision: 4, day_id: day, timing: { kind: 'untimed' } })
    ).data;
    expect(result.visit).toMatchObject({
      timing_kind: 'untimed',
      trip_day_id: day,
      starts_at: null,
      ends_at: null,
      time_zone: null,
    });
  });
  it('keeps an explicit End-only estimate separate from an unknown Start', async () => {
    const first = await create();
    const result = (await client.put(prefix + '/' + first.visit.id + '/timing', { ...endOnly(), duration_minutes: 45 }))
      .data;
    expect(result.visit).toMatchObject({ starts_at: null, planned_duration_minutes: 45, duration_minutes: 45 });
  });
  it('refuses timed input with no endpoints, missing keys or a competing interval duration before RPC', async () => {
    const first = await create();
    boundary.rpc.mockClear();
    const body = endOnly();
    for (const timing of [
      { ...body.timing, ends_at: null },
      { ...body.timing, starts_at: undefined },
      { ...body.timing, ends_at: undefined },
      { ...body.timing, ends_at: '2027-04-01T20:00:00' },
    ])
      await expect(client.put(prefix + '/' + first.visit.id + '/timing', { ...body, timing })).rejects.toMatchObject({
        response: { status: 400 },
      });
    await expect(
      client.put(prefix + '/' + first.visit.id + '/timing', { ...timedBody(), duration_minutes: 45 })
    ).rejects.toMatchObject({ response: { status: 400 } });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it('replays an End-only edit after a lost acknowledgement with one native queue identity', async () => {
    const first = await create(),
      id = uuid(75),
      path = prefix + '/' + first.visit.id + '/timing';
    const body = { expected_revision: 1, day_id: day, timing: endOnly().timing };
    loseAck = true;
    await mutationQueue.enqueue({ id, tripId: ids.register('trip', trip), method: 'PUT', url: path, body });
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(id))?.status).toBe('pending');
    await offlineDb.mutationQueue.update(id, { retryAfter: undefined });
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.get(id)).toBeUndefined();
    expect(timingHistory.size).toBe(1);
    expect(rows.get(first.visit.id)).toMatchObject({ revision: 2, starts_at: null, ends_at: endOnly().timing.ends_at });
  });
  it('reads and restores retained End-only timing through the actual history route', async () => {
    const first = await create(),
      path = prefix + '/' + first.visit.id;
    await client.put(path + '/timing', endOnly());
    await client.put(path + '/timing', {
      operation_id: uuid(71),
      expected_revision: 2,
      day_id: day,
      timing: { kind: 'untimed' },
    });
    const history = (await client.get(path + '/timing-history/2')).data;
    expect(history.before_timing).toMatchObject({ starts_at: null, ends_at: endOnly().timing.ends_at });
    const restored = (
      await client.put(path + '/timing', { operation_id: uuid(72), expected_revision: 3, restore_revision: 2 })
    ).data;
    expect(restored.visit).toMatchObject({
      starts_at: null,
      ends_at: endOnly().timing.ends_at,
      duration_minutes: null,
    });
  });
});
