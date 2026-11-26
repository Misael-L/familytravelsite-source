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
import { createFamilyAxiosAdapter } from './transport';
const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => db }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => db }));
const uuid = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = uuid(1),
  day = uuid(2),
  prefix = `/trips/${trip}/family/plan-entries`;
type Input = {
  location: null | { id: string } | { create: Record<string, unknown> };
  visit: { activity?: string | null; notes?: string | null };
  schedule: {
    day_id: string | null;
    timing: { kind: string; starts_at?: string | null; ends_at?: string | null; time_zone?: string };
    duration_minutes?: number | null;
  };
};
function location(id: string) {
  return {
    id,
    trip_id: trip,
    revision: 1,
    deleted_at: null,
    source: { kind: 'manual', id: null },
    source_archived: false,
    name: 'Saved point',
    description: null,
    notes: null,
    latitude: 19,
    longitude: -98,
    is_located: true,
    address: null,
    website: null,
    phone: null,
    context_place_id: null,
    context_place_name: null,
    country_id: null,
    country_name: null,
    country_code: null,
    time_zone: null,
    source_type_label: null,
    cover_media_id: null,
    category: null,
    overrides: {},
    created_at: '2026-11-05T00:00:00Z',
    updated_at: '2026-11-05T00:00:00Z',
  };
}
function visit(input: Input, index: number) {
  const loc = input.location ? location('id' in input.location ? input.location.id : uuid(500 + index)) : null;
  return {
    id: uuid(100 + index),
    trip_id: trip,
    activity: input.visit.activity ?? 'Saved point',
    starts_at: input.schedule.timing.starts_at ?? null,
    ends_at: input.schedule.timing.ends_at ?? null,
    time_zone: input.schedule.timing.time_zone ?? null,
    sort_order: index,
    explanations: input.visit.notes ?? null,
    updated_at: '2026-11-05T00:00:00Z',
    plan_location_id: loc?.id ?? null,
    location: loc,
    timing_kind: input.schedule.timing.kind,
    trip_day_id: input.schedule.day_id,
    planning_day: '2027-04-01',
    revision: input.schedule.timing.kind === 'timed' ? 2 : 1,
    duration_minutes: input.schedule.duration_minutes ?? null,
    planned_duration_minutes: input.schedule.duration_minutes ?? null,
    start_local: null,
    end_local: null,
    deleted_at: null,
  };
}
const rows = new Map<string, ReturnType<typeof visit>>();
const receipts = new Map<
  string,
  {
    hash: string;
    result: {
      id: string;
      revision: number;
      location_id: string | null;
      timing_revision: number | null;
      deleted_at: null;
    };
  }
>();
let client: ReturnType<typeof axios.create>, ids: FamilyIdentityRegistry;
let loseAck: boolean, switchScope: boolean, deny: { code: string; message: string } | null;
const invalidate = vi.fn(),
  originalAdapter = api.defaults.adapter;
beforeEach(async () => {
  await resetOfflineTestDatabase();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  rows.clear();
  receipts.clear();
  invalidate.mockClear();
  db.rpc.mockReset();
  loseAck = false;
  switchScope = false;
  deny = null;
  ids = new FamilyIdentityRegistry(uuid(9));
  db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (deny) return { data: null, error: deny };
    if (name === 'get_family_trip_visit_v1')
      return { data: { version: 1, visit: rows.get(String(args.p_visit_id)) }, error: null };
    if (name !== 'create_family_trip_plan_entry_v1') throw new Error('Unexpected non-atomic RPC ' + name);
    const key = String(args.p_operation_id),
      hash = JSON.stringify(args.p_payload),
      old = receipts.get(key);
    if (old && old.hash !== hash) return { data: null, error: { code: '40001', message: 'Changed parent intent' } };
    if (!old) {
      const row = visit(args.p_payload as Input, rows.size);
      rows.set(row.id, row);
      receipts.set(key, {
        hash,
        result: {
          id: row.id,
          revision: row.revision,
          location_id: row.plan_location_id,
          timing_revision: row.timing_kind === 'timed' ? 1 : null,
          deleted_at: null,
        },
      });
    }
    if (switchScope) ids = new FamilyIdentityRegistry(uuid(99));
    if (loseAck) {
      loseAck = false;
      return { data: null, error: { message: 'Lost acknowledgement' } };
    }
    return { data: receipts.get(key)?.result, error: null };
  });
  const repo = familyRepositoryFixture(uuid(9), () => ids, {
    tripUuid: async (id: string) => ids.uuid('trip', id),
    invalidate,
  }) as unknown as FamilyFrontendRepository;
  const adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(repo));
  client = axios.create({ adapter });
  api.defaults.adapter = adapter;
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  setAuthed(false);
  vi.restoreAllMocks();
});
const payload = () => ({
  location: null,
  visit: { activity: 'Dinner', notes: 'Occurrence note' },
  schedule: {
    day_id: day,
    timing: {
      kind: 'timed',
      basis: 'local',
      starts_at: '2027-04-01T19:00:00-06:00',
      ends_at: null,
      time_zone: 'America/Mexico_City',
    },
  },
});
async function create(operation = uuid(10)) {
  return (await client.post(prefix, { operation_id: operation, ...payload() })).data;
}

describe('Atomic entry creation through actual dispatcher, transport and native queue', () => {
  it('sends one atomic mutation and reads the committed occurrence', async () => {
    const result = await create();
    expect(result.visit.explanations).toBe('Occurrence note');
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual([
      'create_family_trip_plan_entry_v1',
      'get_family_trip_visit_v1',
    ]);
    expect(db.rpc).toHaveBeenCalledWith('create_family_trip_plan_entry_v1', {
      p_trip_id: trip,
      p_operation_id: uuid(10),
      p_payload: payload(),
    });
    expect(invalidate).toHaveBeenCalledWith(trip);
  });
  it('preserves an existing location selector and an inline new location in the complete payload', async () => {
    for (const [i, selected] of [
      { id: uuid(60) },
      { create: { source: { kind: 'manual' }, label: 'Meet here' } },
    ].entries()) {
      const result = (await client.post(prefix, { operation_id: uuid(20 + i), ...payload(), location: selected })).data;
      expect(result.visit.plan_location_id).not.toBeNull();
      expect(db.rpc).toHaveBeenCalledWith(
        'create_family_trip_plan_entry_v1',
        expect.objectContaining({ p_payload: { ...payload(), location: selected } })
      );
    }
  });
  it('uses the same parent receipt after a lost acknowledgement without separate fallback writes', async () => {
    loseAck = true;
    await expect(create()).rejects.toMatchObject({ response: { status: 503 } });
    const replay = await create();
    expect(replay.visit.revision).toBe(2);
    expect(rows.size).toBe(1);
    expect(receipts.size).toBe(1);
  });
  it('keeps newer notes when replay reads the current occurrence', async () => {
    const first = await create();
    const row = rows.get(first.visit.id);
    if (!row) throw new Error('Missing committed fixture');
    row.explanations = 'Later edit';
    row.revision = 3;
    const replay = await create();
    expect(replay.operation.revision).toBe(2);
    expect(replay.visit.explanations).toBe('Later edit');
  });
  it('treats another operation as a repeated visit and rejects changed retry content', async () => {
    const first = await create(),
      second = await create(uuid(11));
    expect(first.visit.id).not.toBe(second.visit.id);
    await expect(
      client.post(prefix, { operation_id: uuid(10), ...payload(), visit: { activity: 'Changed' } })
    ).rejects.toMatchObject({ response: { status: 409 } });
    expect(rows.size).toBe(2);
  });
  it('rejects malformed compound fields, conflicting selectors and old-revision headers before RPC', async () => {
    for (const body of [
      { operation_id: uuid(10), ...payload(), extra: true },
      { operation_id: uuid(10), ...payload(), location: { id: uuid(60), create: {} } },
      { operation_id: uuid(10), ...payload(), visit: { location_id: uuid(60) } },
      { operation_id: uuid(10), ...payload(), schedule: { restore_revision: 1 } },
      {
        operation_id: uuid(10),
        ...payload(),
        schedule: {
          ...payload().schedule,
          observed_legacy_timing: { starts_at: null, ends_at: null, time_zone: null },
        },
      },
      {
        operation_id: uuid(10),
        ...payload(),
        schedule: { ...payload().schedule, timing: { ...payload().schedule.timing, starts_at: null } },
      },
    ])
      await expect(client.post(prefix, body)).rejects.toMatchObject({ response: { status: 400 } });
    await expect(
      client.post(prefix, { operation_id: uuid(10), ...payload() }, { headers: { 'X-Base-Updated-At': '2026-11-05' } })
    ).rejects.toMatchObject({ response: { status: 409 } });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('fails closed on missing migration, invalid scope, timezone qualification and late DB failure', async () => {
    for (const [code, status] of [
      ['PGRST202', 503],
      ['42501', 403],
      ['55000', 503],
      ['23514', 422],
    ] as const) {
      deny = { code, message: 'Database refused the transaction' };
      await expect(create()).rejects.toMatchObject({ response: { status } });
    }
    expect(rows.size).toBe(0);
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('fences a Family switch after commit before exposing or caching the response', async () => {
    switchScope = true;
    await expect(create()).rejects.toMatchObject({ response: { status: 409 } });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('retries the actual native IndexedDB queue with one parent operation UUID', async () => {
    const id = uuid(40);
    loseAck = true;
    await mutationQueue.enqueue({
      id,
      tripId: ids.register('trip', trip),
      method: 'POST',
      url: prefix,
      body: payload(),
    });
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(id))?.status).toBe('pending');
    await offlineDb.mutationQueue.update(id, { retryAfter: undefined });
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.get(id)).toBeUndefined();
    expect(rows.size).toBe(1);
    expect(receipts.size).toBe(1);
    expect(
      db.rpc.mock.calls
        .filter(([name]) => name === 'create_family_trip_plan_entry_v1')
        .every(([, args]) => args.p_operation_id === id)
    ).toBe(true);
  });
  it('rejects a response that identifies another location instead of caching success', async () => {
    db.rpc.mockResolvedValueOnce({
      data: { id: uuid(100), revision: 2, deleted_at: null, timing_revision: 1, location_id: uuid(61) },
      error: null,
    });
    await expect(create()).rejects.toMatchObject({ response: { status: 502 } });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
