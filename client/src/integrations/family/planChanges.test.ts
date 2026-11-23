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
const uuid = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = uuid(1),
  draft = uuid(2),
  prefix = `/trips/${trip}/family/plan-changes`;
type Intent = { draft_id: string; op_id: string; request: string | null; status: 'submitted' | 'applied' | 'rejected' };
const stageReceipts = new Map<string, { hash: string; intent: Intent }>();
const submitReceipts = new Map<string, { hash: string; request: string }>();
const decisions = new Map<string, { accept: boolean; result: Record<string, unknown> }>();
let ids: FamilyIdentityRegistry, client: ReturnType<typeof axios.create>, requestCount: number, published: number;
let deny: { code: string; message: string } | null, loseAck: boolean, switchScope: boolean;
const invalidate = vi.fn(),
  originalAdapter = api.defaults.adapter;
const error = (code: string, message: string) => ({ data: null, error: { code, message } });
function current(intent: Intent) {
  return {
    operation: { draft_id: intent.draft_id, op_id: intent.op_id },
    state: intent.request ? 'submitted' : 'draft',
    request_id: intent.request,
    request_status: intent.request ? intent.status : null,
  };
}
function stage(args: Record<string, unknown>) {
  const key = String(args.p_operation_id),
    hash = JSON.stringify(args),
    replay = stageReceipts.get(key);
  if (replay)
    return replay.hash === hash
      ? { data: current(replay.intent), error: null }
      : error('40001', 'Changed staging intent');
  const intent: Intent = { draft_id: draft, op_id: uuid(100 + stageReceipts.size), request: null, status: 'submitted' };
  stageReceipts.set(key, { hash, intent });
  return { data: current(intent), error: null };
}
function submit(args: Record<string, unknown>) {
  const key = String(args.p_operation_id),
    hash = JSON.stringify(args),
    replay = submitReceipts.get(key);
  if (replay && replay.hash !== hash) return error('40001', 'Changed submission intent');
  const request = replay?.request ?? uuid(300 + requestCount++);
  submitReceipts.set(key, { hash, request });
  for (const entry of stageReceipts.values()) if (!entry.intent.request) entry.intent.request = request;
  const intent = [...stageReceipts.values()].find((x) => x.intent.request === request)?.intent;
  return {
    data: {
      operation: { request_id: request, trip_id: trip, op_count: stageReceipts.size },
      request_status: intent?.status ?? 'submitted',
    },
    error: null,
  };
}
function review(args: Record<string, unknown>) {
  if (args.p_trip_id !== trip) return error('42501', 'Wrong Trip');
  const key = String(args.p_op_id),
    accept = args.p_accept === true,
    replay = decisions.get(key);
  if (replay)
    return replay.accept === accept ? { data: replay.result, error: null } : error('40001', 'Already decided');
  for (const entry of stageReceipts.values())
    if (entry.intent.op_id === key) entry.intent.status = accept ? 'applied' : 'rejected';
  if (accept) published++;
  const result = {
    op_id: key,
    status: accept ? 'applied' : 'rejected',
    published_id: accept ? uuid(900) : null,
    published_revision: accept ? 1 : null,
  };
  decisions.set(key, { accept, result });
  return { data: result, error: null };
}
beforeEach(async () => {
  await resetOfflineTestDatabase();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  stageReceipts.clear();
  submitReceipts.clear();
  decisions.clear();
  invalidate.mockClear();
  db.rpc.mockReset();
  deny = null;
  loseAck = false;
  switchScope = false;
  requestCount = 0;
  published = 0;
  ids = new FamilyIdentityRegistry(uuid(9));
  db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (deny) return { data: null, error: deny };
    const operation = {
      stage_family_plan_change_v2: stage,
      submit_family_plan_change_draft_v2: submit,
      review_family_plan_change_v2: review,
    }[name];
    if (!operation) throw new Error('Unexpected RPC ' + name);
    const result = operation(args);
    if (switchScope) ids = new FamilyIdentityRegistry(uuid(99));
    if (loseAck) {
      loseAck = false;
      return { data: null, error: { message: 'Lost acknowledgement' } };
    }
    return result;
  });
  const repo = familyRepositoryFixture(uuid(9), () => ids, {
    tripUuid: async (value: string) => ids.uuid('trip', value),
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
const body = { domain: 'location', action: 'create', changes: { source: { kind: 'manual' }, label: 'Proposed point' } };
async function propose(operation = uuid(10)) {
  return (await client.post(prefix, { operation_id: operation, ...body })).data;
}
async function submitDraft(operation = uuid(11)) {
  return (await client.post(prefix + '/' + draft + '/submit', { operation_id: operation, summary: 'Our plan' })).data;
}

describe('Typed proposals through full Family dispatcher and transport', () => {
  it('stages a private intent without a published-shaped response or cache write', async () => {
    const staged = await propose();
    expect(staged.state).toBe('draft');
    expect(staged.place).toBeUndefined();
    expect(staged.visit).toBeUndefined();
    expect(published).toBe(0);
    expect(invalidate).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledWith(
      'stage_family_plan_change_v2',
      expect.objectContaining({ p_trip_id: trip, p_domain: 'location', p_target_id: null })
    );
  });
  it('stages an explicit untimed visit with the observed target revision', async () => {
    await client.post(prefix, {
      operation_id: uuid(10),
      domain: 'visit',
      action: 'update',
      target_id: uuid(88),
      expected_revision: 2,
      changes: { day_id: uuid(77), notes: 'Proposal only' },
    });
    expect(db.rpc).toHaveBeenCalledWith(
      'stage_family_plan_change_v2',
      expect.objectContaining({ p_domain: 'visit', p_expected_revision: 2, p_target_id: uuid(88) })
    );
    expect(published).toBe(0);
  });
  it('replays stage acknowledgements before and after submission without adding another intent', async () => {
    const first = await propose();
    expect(await propose()).toEqual(first);
    const submitted = await submitDraft();
    const replay = await propose();
    expect(replay.state).toBe('submitted');
    expect(replay.request_id).toBe(submitted.operation.request_id);
    expect(stageReceipts.size).toBe(1);
  });
  it('submits and approves using the checked Trip-scoped review API', async () => {
    const staged = await propose();
    await submitDraft();
    const url = prefix + '/operations/' + staged.operation.op_id + '/review';
    const result = (await client.post(url, { accept: true })).data;
    expect(result.status).toBe('applied');
    expect(published).toBe(1);
    expect(db.rpc).toHaveBeenCalledWith('review_family_plan_change_v2', {
      p_trip_id: trip,
      p_op_id: staged.operation.op_id,
      p_accept: true,
      p_note: null,
    });
    expect(invalidate).toHaveBeenCalledWith(trip);
    await client.post(url, { accept: true });
    expect(published).toBe(1);
  });
  it('rejects without publishing', async () => {
    const staged = await propose();
    await submitDraft();
    const result = (await client.post(prefix + '/operations/' + staged.operation.op_id + '/review', { accept: false }))
      .data;
    expect(result.status).toBe('rejected');
    expect(published).toBe(0);
  });
  it('does not silently accept malformed source/time/target payloads', async () => {
    await expect(client.post(prefix, { operation_id: uuid(10), ...body, target_id: uuid(88) })).rejects.toMatchObject({
      response: { status: 400 },
    });
    await expect(
      client.post(prefix, {
        operation_id: uuid(10),
        domain: 'visit',
        action: 'create',
        changes: { activity: 'Wrong clock', starts_at: '2027-04-01T19:00:00Z' },
      })
    ).rejects.toMatchObject({ response: { status: 400 } });
    await expect(
      client.post(prefix, { operation_id: uuid(10), ...body }, { headers: { 'X-Idempotency-Key': uuid(12) } })
    ).rejects.toMatchObject({ response: { status: 400 } });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('surfaces denied, stale and missing-migration responses without successful staging', async () => {
    for (const [code, http] of [
      ['42501', 403],
      ['40001', 409],
      ['PGRST202', 503],
    ] as const) {
      deny = { code, message: 'Current server condition' };
      await expect(propose()).rejects.toMatchObject({ response: { status: http } });
    }
    expect(stageReceipts.size).toBe(0);
    expect(published).toBe(0);
  });
  it('fences a session switch before exposing an acknowledgement', async () => {
    switchScope = true;
    await expect(propose()).rejects.toMatchObject({ response: { status: 409 } });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('retries a lost submit acknowledgement without creating another request', async () => {
    await propose();
    loseAck = true;
    await expect(submitDraft()).rejects.toMatchObject({ response: { status: 503 } });
    const retry = await submitDraft();
    expect(retry.request_status).toBe('submitted');
    expect(requestCount).toBe(1);
  });
  it('does not approve an operation through another Trip route', async () => {
    const s = await propose();
    await submitDraft();
    await expect(
      client.post(`/trips/${uuid(99)}/family/plan-changes/operations/${s.operation.op_id}/review`, { accept: true })
    ).rejects.toMatchObject({ response: { status: 403 } });
    expect(published).toBe(0);
  });
  it('replays the actual native queue after a lost stage acknowledgement without publishing', async () => {
    const id = uuid(40);
    loseAck = true;
    await mutationQueue.enqueue({ id, tripId: ids.register('trip', trip), method: 'POST', url: prefix, body });
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(id))?.status).toBe('pending');
    await offlineDb.mutationQueue.update(id, { retryAfter: undefined });
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.get(id)).toBeUndefined();
    expect(stageReceipts.size).toBe(1);
    expect(published).toBe(0);
    const calls = db.rpc.mock.calls.filter(([name]) => name === 'stage_family_plan_change_v2');
    expect(calls).toHaveLength(2);
    expect(calls.every(([, args]) => args.p_operation_id === id)).toBe(true);
  });
});

describe('Timing proposals through the actual dispatcher, transport and native queue', () => {
  const changes = {
    day_id: uuid(77),
    timing: {
      kind: 'timed',
      basis: 'local',
      starts_at: '2027-04-01T19:00:00-06:00',
      ends_at: null,
      time_zone: 'America/Mexico_City',
    },
  };
  const timingBody = { domain: 'visit', action: 'timing', target_id: uuid(88), expected_revision: 3, changes };
  async function stageTiming(body = timingBody) {
    return (await client.post(prefix, { operation_id: uuid(10), ...body })).data;
  }
  it('stages the complete clock pair privately without calling the direct timing RPC', async () => {
    const result = await stageTiming();
    expect(result.state).toBe('draft');
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith('stage_family_plan_change_v2', {
      p_trip_id: trip,
      p_operation_id: uuid(10),
      p_domain: 'visit',
      p_action: 'timing',
      p_target_id: uuid(88),
      p_expected_revision: 3,
      p_changes: changes,
    });
    expect(published).toBe(0);
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('accepts explicit legacy classification, untimed clearing and history restoration', async () => {
    const payloads = [
      { ...changes, observed_legacy_timing: { starts_at: '2027-04-01T00:00:00Z', ends_at: null, time_zone: 'UTC' } },
      { day_id: null, timing: { kind: 'untimed' }, duration_minutes: 0 },
      { restore_revision: 2 },
    ];
    for (const [i, payload] of payloads.entries()) {
      await client.post(prefix, { ...timingBody, operation_id: uuid(20 + i), changes: payload });
      expect(db.rpc).toHaveBeenLastCalledWith(
        'stage_family_plan_change_v2',
        expect.objectContaining({ p_changes: payload })
      );
    }
    expect(published).toBe(0);
  });
  it('rejects malformed or ambiguous clocks, mixed restore, missing target and wrong domain before RPC', async () => {
    const bad = [
      { ...timingBody, domain: 'location' },
      { ...timingBody, expected_revision: null },
      { ...timingBody, target_id: null },
      { ...timingBody, changes: { ...changes, timing: { ...changes.timing, starts_at: '2027-04-01T19:00:00' } } },
      { ...timingBody, changes: { ...changes, timing: { ...changes.timing, ends_at: undefined } } },
      {
        ...timingBody,
        changes: {
          ...changes,
          timing: { ...changes.timing, ends_at: '2027-04-01T20:00:00-06:00' },
          duration_minutes: 60,
        },
      },
      { ...timingBody, changes: { restore_revision: 2, ...changes } },
      { ...timingBody, changes: { ...changes, observed_legacy_timing: { starts_at: null } } },
    ];
    for (const value of bad)
      await expect(client.post(prefix, { operation_id: uuid(10), ...value })).rejects.toMatchObject({
        response: { status: 400 },
      });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('submits then reviews timing through the checked proposal route and invalidates only review', async () => {
    const result = await stageTiming();
    await submitDraft();
    expect(invalidate).not.toHaveBeenCalled();
    expect(published).toBe(0);
    await client.post(prefix + '/operations/' + result.operation.op_id + '/review', { accept: true });
    expect(db.rpc).toHaveBeenLastCalledWith(
      'review_family_plan_change_v2',
      expect.objectContaining({ p_op_id: result.operation.op_id, p_accept: true })
    );
    expect(published).toBe(1);
    expect(invalidate).toHaveBeenCalledWith(trip);
  });
  it('keeps timing unpublished on rejection and its retry', async () => {
    const result = await stageTiming();
    await submitDraft();
    const url = prefix + '/operations/' + result.operation.op_id + '/review';
    await client.post(url, { accept: false });
    await client.post(url, { accept: false });
    expect(published).toBe(0);
    expect(decisions.size).toBe(1);
  });
  it('reports unqualified timezone data, stale revisions and revoked permissions without success', async () => {
    for (const [code, status] of [
      ['55000', 503],
      ['40001', 409],
      ['42501', 403],
    ] as const) {
      deny = { code, message: 'Checked database refusal' };
      await expect(stageTiming()).rejects.toMatchObject({ response: { status } });
    }
    expect(stageReceipts.size).toBe(0);
  });
  it('retries the real IndexedDB queue with one operation ID and unchanged timing payload', async () => {
    const id = uuid(40);
    loseAck = true;
    await mutationQueue.enqueue({
      id,
      tripId: ids.register('trip', trip),
      method: 'POST',
      url: prefix,
      body: timingBody,
    });
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(id))?.status).toBe('pending');
    await offlineDb.mutationQueue.update(id, { retryAfter: undefined });
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.get(id)).toBeUndefined();
    expect(stageReceipts.size).toBe(1);
    expect(published).toBe(0);
    expect(db.rpc.mock.calls).toHaveLength(2);
    for (const [name, args] of db.rpc.mock.calls) {
      expect(name).toBe('stage_family_plan_change_v2');
      expect(args.p_operation_id).toBe(id);
      expect(args.p_changes).toEqual(changes);
    }
  });
});

describe('Independent endpoint proposal orchestration', () => {
  const changes = {
    day_id: uuid(77),
    timing: {
      kind: 'timed',
      basis: 'local',
      starts_at: null,
      ends_at: '2027-04-01T20:00:00-06:00',
      time_zone: 'America/Mexico_City',
    },
  };
  const body = {
    operation_id: uuid(10),
    domain: 'visit',
    action: 'timing',
    target_id: uuid(88),
    expected_revision: 3,
    changes,
  };
  it('stages End-only intent privately and approves through the checked review route', async () => {
    const staged = (await client.post(prefix, body)).data;
    expect(db.rpc).toHaveBeenCalledWith('stage_family_plan_change_v2', expect.objectContaining({ p_changes: changes }));
    expect(published).toBe(0);
    expect(invalidate).not.toHaveBeenCalled();
    await submitDraft();
    await client.post(prefix + '/operations/' + staged.operation.op_id + '/review', { accept: true });
    expect(published).toBe(1);
  });
  it('refuses endpoint-free timed proposals before staging any private operation', async () => {
    await expect(
      client.post(prefix, { ...body, changes: { ...changes, timing: { ...changes.timing, ends_at: null } } })
    ).rejects.toMatchObject({ response: { status: 400 } });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(published).toBe(0);
  });
});

describe('Compound plan entry proposals through the checked dispatcher', () => {
  const changes = {
    location: { create: { source: { kind: 'manual' }, label: 'Proposed point' } },
    visit: { notes: 'Occurrence note' },
    schedule: {
      day_id: uuid(77),
      timing: {
        kind: 'timed',
        basis: 'local',
        starts_at: '2027-04-01T19:00:00-06:00',
        ends_at: null,
        time_zone: 'America/Mexico_City',
      },
    },
  };
  const body = { operation_id: uuid(10), domain: 'visit', action: 'create_entry', changes };
  it('stages and submits one private compound intent before checked approval', async () => {
    const staged = (await client.post(prefix, body)).data;
    expect(db.rpc).toHaveBeenCalledWith(
      'stage_family_plan_change_v2',
      expect.objectContaining({
        p_action: 'create_entry',
        p_target_id: null,
        p_expected_revision: null,
        p_changes: changes,
      })
    );
    expect(published).toBe(0);
    expect(invalidate).not.toHaveBeenCalled();
    await submitDraft();
    expect(published).toBe(0);
    await client.post(prefix + '/operations/' + staged.operation.op_id + '/review', { accept: true });
    expect(published).toBe(1);
  });
  it('refuses an existing target/revision, wrong domain and history restoration for a new entry', async () => {
    for (const value of [
      { ...body, target_id: uuid(88) },
      { ...body, expected_revision: 2 },
      { ...body, domain: 'location' },
      { ...body, changes: { ...changes, schedule: { restore_revision: 1 } } },
    ])
      await expect(client.post(prefix, value)).rejects.toMatchObject({ response: { status: 400 } });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('replays a lost staging acknowledgement as one private intent without publication', async () => {
    loseAck = true;
    await expect(client.post(prefix, body)).rejects.toMatchObject({ response: { status: 503 } });
    await client.post(prefix, body);
    expect(stageReceipts.size).toBe(1);
    expect(published).toBe(0);
  });
});
