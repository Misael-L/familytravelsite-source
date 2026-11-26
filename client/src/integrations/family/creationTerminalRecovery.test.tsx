// organize-imports-ignore
// sort-imports-ignore
import '../../../tests/helpers/familyPlannerCohort/state';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { beginNew, newData } from '../../../tests/helpers/familyPlannerCohort/formActions';
import { required, load } from '../../../tests/helpers/familyPlannerCohort/core';
import '../../../tests/helpers/familyPlannerCohort/setup';
import { cohortState, db, trip, creationReceipts, uuid } from '../../../tests/helpers/familyPlannerCohort/state';
import { render, screen, fireEvent, waitFor } from '../../../tests/helpers/render';
import api from '../../api/client';
import { offlineDb, invalidateOfflineSession, type QueuedMutation } from '../../db/offlineDb';
import { CREATION_TERMINAL_ARCHIVE_KEY as KEY } from '../../db/creationTerminalArchive';
import { setAuthed } from '../../sync/authGate';
import { FamilyPlannerTaskRecovery } from './FamilyPlannerTaskRecovery';
import { createPlannerCreationRecovery } from './plannerCreationRecovery';
import { creationIntentUrl } from './creationIntentQueue';
import type { CreationPacket } from './plannerCreationContract';

beforeEach(() => {
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  vi.stubEnv('VITE_SUPABASE_URL', ['https://family-core-fixture.', 'supabase', '.co'].join(''));
  vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', 'isolated-planner-packing-v1');
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});
const rows = () => offlineDb.mutationQueue.toArray();
const journal = async () =>
  (await offlineDb.syncMeta.get(KEY))?.familyCreationTerminalArchive as
    { entries: Array<{ state: string; row: QueuedMutation }> } | undefined;
function recovery() {
  return createPlannerCreationRecovery(cohortState.repo, trip, {
    source: () => cohortState.source,
    current: () => true,
  });
}
async function pending(committed = false) {
  const context = await beginNew();
  const raw = required(db.rpc.getMockImplementation());
  let block = !committed;
  if (committed) cohortState.loseAck = true;
  const states = new Map<string, 'unknown' | 'committed' | 'cancelled'>();
  const proof = (args: Record<string, unknown>) => {
    const id = String(args.p_operation_id),
      saved = creationReceipts.get(id),
      status = states.get(id) ?? (saved ? 'committed' : 'unknown');
    return {
      version: 2,
      trip_id: args.p_trip_id,
      operation_id: id,
      scope: args.p_scope,
      form: args.p_form,
      request_sha256: 'a'.repeat(64),
      status,
      cancelled_at: status === 'cancelled' ? '2026-11-16T12:00:00Z' : null,
      result: status === 'committed' ? required(saved).result : null,
    };
  };
  let fault: 'none' | 'before' | 'after' | 'denied' = 'none',
    slow: Promise<void> | null = null;
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'create_family_native_plan_v1' && block) return { data: null, error: { code: '08006' } };
    if (name === 'get_family_native_plan_receipt_v2') {
      calls.push({ name, args: structuredClone(args) });
      return { data: proof(args), error: null };
    }
    if (name === 'cancel_family_native_plan_v1') {
      calls.push({ name, args: structuredClone(args) });
      const a = required(await journal());
      expect(a.entries.find((e) => e.row.id === args.p_operation_id)?.state).toBe('pending');
      if (fault === 'before') return { data: null, error: { code: '08006' } };
      if (fault === 'denied') return { data: null, error: { code: '42501' } };
      states.set(String(args.p_operation_id), 'cancelled');
      if (slow !== null) await slow;
      if (fault === 'after') return { data: null, error: { code: '08006' } };
      return { data: proof(args), error: null };
    }
    return raw(name, args);
  });
  await expect(cohortState.cohort.creation.createForm(context, newData())).rejects.toThrow();
  const row = required((await rows())[0]);
  return {
    row,
    calls,
    allow: () => {
      block = false;
      cohortState.loseAck = false;
    },
    setFault: (v: typeof fault) => {
      fault = v;
    },
    setStatus: (s: 'unknown' | 'committed' | 'cancelled') => states.set(row.id, s),
    hold: (p: Promise<void>) => {
      slow = p;
    },
  };
}
function show(r = recovery()) {
  const retry = vi.fn(async () => {});
  const view = render(
    <FamilyPlannerTaskRecovery recovery={{ ...r, export: async () => {} }} problem={{ current: () => true, retry }} />
  );
  return { retry, ...view };
}
async function openDecision() {
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel original planner save…' }));
  await screen.findByRole('group', { name: 'Confirm cancellation of original save' });
}
async function confirm() {
  await openDecision();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
}
describe('native Family creation cancellation recovery cutover', () => {
  it('offers explicit cancellation only on the qualified isolated profile; preparation/dismissal never arms', async () => {
    const { row, calls } = await pending();
    show();
    await openDecision();
    expect(calls).toEqual([]);
    expect(await journal()).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Keep original save' }));
    expect(screen.queryByRole('group', { name: 'Confirm cancellation of original save' })).toBeNull();
    expect(await rows()).toEqual([row]);
  });
  it('confirms and archives an unknown original, then refreshes without sending a replacement', async () => {
    const p = await pending(),
      v = show();
    await confirm();
    await waitFor(() => expect(v.retry).toHaveBeenCalledTimes(1));
    expect(await rows()).toEqual([]);
    expect(required(await journal()).entries[0]).toMatchObject({ state: 'cancelled', row: p.row });
    expect(cohortState.creationRows).toHaveLength(0);
    expect(p.calls.map((c) => c.name)).toEqual(['get_family_native_plan_receipt_v2', 'cancel_family_native_plan_v1']);
  });
  it('the ordinary Check stays read-only and never arms cancellation', async () => {
    const p = await pending();
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Check retained planner save' }));
    await screen.findByText(/original save is still unresolved/);
    expect(await rows()).toEqual([p.row]);
    expect(await journal()).toBeUndefined();
    expect(p.calls).toEqual([]);
  });
  it('slow cancellation keeps controls disabled and double clicks coalesce into one original command', async () => {
    const p = await pending();
    let release = () => {};
    p.hold(
      new Promise<void>((r) => {
        release = r;
      })
    );
    const v = show();
    await openDecision();
    const button = screen.getByRole('button', { name: 'Confirm cancellation' });
    fireEvent.click(button);
    await waitFor(() => expect(p.calls.filter((c) => c.name === 'cancel_family_native_plan_v1')).toHaveLength(1));
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(await rows()).toEqual([p.row]);
    release();
    await waitFor(() => expect(v.retry).toHaveBeenCalledTimes(1));
    expect(p.calls.filter((c) => c.name === 'cancel_family_native_plan_v1')).toHaveLength(1);
  });
  it('losing cancellation reply reloads as a cancellation decision; Check discovers it without replay', async () => {
    const p = await pending();
    p.setFault('after');
    const v = show();
    await confirm();
    await screen.findByRole('button', { name: 'Retry original cancellation' });
    expect(await rows()).toEqual([p.row]);
    expect(required(await journal()).entries[0].state).toBe('pending');
    v.unmount();
    const fresh = show(recovery());
    fireEvent.click(await screen.findByRole('button', { name: 'Check retained planner save' }));
    await waitFor(() => expect(fresh.retry).toHaveBeenCalledTimes(1));
    expect(await rows()).toEqual([]);
    expect(p.calls.filter((c) => c.name === 'cancel_family_native_plan_v1')).toHaveLength(1);
  });
  it('an armed unknown retry sends cancellation, never creation, with the unchanged operation and form', async () => {
    const p = await pending();
    p.setFault('before');
    show();
    await confirm();
    await screen.findByRole('button', { name: 'Retry original cancellation' });
    p.setFault('none');
    fireEvent.click(screen.getByRole('button', { name: 'Retry original cancellation' }));
    await waitFor(async () => expect(await rows()).toEqual([]));
    const writes = p.calls.filter((c) => c.name === 'cancel_family_native_plan_v1');
    expect(writes).toHaveLength(2);
    expect(writes[0].args).toEqual(writes[1].args);
    expect(cohortState.creationRows).toHaveLength(0);
  });
  it('committed creation is acknowledged without cancellation, duplicate creation or deleting the saved location', async () => {
    const p = await pending(true),
      v = show();
    await confirm();
    await waitFor(() => expect(v.retry).toHaveBeenCalledTimes(1));
    expect(cohortState.creationRows).toHaveLength(1);
    expect(required(await journal()).entries[0].state).toBe('committed');
    expect(p.calls.map((c) => c.name)).toEqual(['get_family_native_plan_receipt_v2']);
  });
  it('discovers an armed original even if an older tab removed its queue row', async () => {
    const p = await pending();
    p.setFault('before');
    const retained = required(await recovery().inspect());
    await expect((await required(retained.creation).prepare()).cancel()).rejects.toThrow();
    await offlineDb.mutationQueue.delete(p.row.id);
    p.setStatus('cancelled');
    const r = required(await recovery().inspect());
    expect(r.intent).toBe('cancel-command');
    expect(await r.check()).toBe('cancelled');
    expect(required(await journal()).entries[0].row).toEqual(p.row);
  });
  it('current authority refusal preserves the armed original; restoring authority retries the same cancellation', async () => {
    const p = await pending();
    p.setFault('denied');
    show();
    await confirm();
    await screen.findByRole('button', { name: 'Retry original cancellation' });
    expect(await rows()).toEqual([p.row]);
    p.setFault('none');
    fireEvent.click(screen.getByRole('button', { name: 'Retry original cancellation' }));
    await waitFor(async () => expect(await rows()).toEqual([]));
    expect(
      p.calls.filter((c) => c.name === 'cancel_family_native_plan_v1').every((c) => c.args.p_operation_id === p.row.id)
    ).toBe(true);
  });
  it('a deliberate corrected form gets a new UUID only after terminal archival and a fresh canonical read', async () => {
    const p = await pending(),
      retained = required(await recovery().inspect());
    await (await required(retained.creation).prepare()).cancel();
    p.allow();
    await load();
    const context = await beginNew();
    await cohortState.cohort.creation.createForm(context, newData({ name: 'Corrected new intent' }));
    expect(cohortState.creationRows).toHaveLength(1);
    const creates = db.rpc.mock.calls.filter((c) => c[0] === 'create_family_native_plan_v1');
    const last = creates[creates.length - 1];
    expect(last?.[1]?.p_operation_id).not.toBe(p.row.id);
    expect(required(await journal()).entries[0].row).toEqual(p.row);
  });
  it('the direct creation handler refuses armed work before its save RPC and without nested locking', async () => {
    const p = await pending();
    p.setFault('before');
    const r = required(await recovery().inspect());
    await expect((await required(r.creation).prepare()).cancel()).rejects.toThrow();
    const before = db.rpc.mock.calls.filter((c) => c[0] === 'create_family_native_plan_v1').length;
    await expect(api.post(creationIntentUrl(p.row.body as CreationPacket), p.row.body)).rejects.toThrow();
    expect(db.rpc.mock.calls.filter((c) => c[0] === 'create_family_native_plan_v1')).toHaveLength(before);
    expect(await rows()).toEqual([p.row]);
  });
  it.each(['source', 'family', 'person', 'layer', 'logout', 'profile'])(
    'a captured confirmation cannot survive changed %s',
    async (kind) => {
      const p = await pending(),
        r = required(await recovery().inspect()),
        d = await required(r.creation).prepare();
      if (kind === 'source') cohortState.source = 'https://other.invalid';
      if (kind === 'layer') cohortState.repo.setLayer(trip, 'myDraft');
      if (kind === 'logout') {
        setAuthed(false);
        invalidateOfflineSession();
      }
      if (kind === 'profile') vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', '');
      if (kind === 'family' || kind === 'person') {
        cohortState.session = { ...cohortState.session, [kind === 'family' ? 'familyId' : 'personId']: uuid(999) };
        cohortState.repo.acceptSession(cohortState.session);
      }
      await expect(d.cancel()).rejects.toThrow();
      expect(p.calls).toEqual([]);
      expect(await rows()).toEqual([p.row]);
      expect(await journal()).toBeUndefined();
    }
  );
  it.each(['', 'isolated-task-v1', 'unknown'])('does not expose cancellation under profile %s', async (profile) => {
    await pending();
    vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', profile);
    const r = required(await recovery().inspect());
    expect(r.creation).toBeUndefined();
  });
  it('unqualified armed recovery never falls back to retrying the original creation', async () => {
    const p = await pending();
    p.setFault('before');
    const r = required(await recovery().inspect());
    await expect((await required(r.creation).prepare()).cancel()).rejects.toThrow();
    vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', 'isolated-task-v1');
    const held = required(await recovery().inspect());
    const before = p.calls.length;
    await expect(held.retry()).rejects.toThrow(/qualified source/);
    expect(p.calls).toHaveLength(before);
    expect(await rows()).toEqual([p.row]);
  });
  it('an armed decision without a queue row still holds native refresh until its terminal proof is archived', async () => {
    const p = await pending();
    p.setFault('before');
    const r = required(await recovery().inspect());
    await expect((await required(r.creation).prepare()).cancel()).rejects.toThrow();
    await offlineDb.mutationQueue.delete(p.row.id);
    db.rpc.mockClear();
    await expect(load()).rejects.toMatchObject({ code: 'planner_local_work' });
    expect(db.rpc).not.toHaveBeenCalled();
    p.setStatus('cancelled');
    const held = required(await recovery().inspect());
    expect(await held.check()).toBe('cancelled');
    await load();
    expect(await rows()).toEqual([]);
  });
});
