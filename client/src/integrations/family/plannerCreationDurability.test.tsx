// organize-imports-ignore
// sort-imports-ignore
import '../../../tests/helpers/familyPlannerCohort/state';
import { describe, expect, it, vi } from 'vitest';
import { beginNew, newData } from '../../../tests/helpers/familyPlannerCohort/formActions';
import { load, required } from '../../../tests/helpers/familyPlannerCohort/core';
import '../../../tests/helpers/familyPlannerCohort/setup';
import { cohortState, db, trip, uuid, creationReceipts } from '../../../tests/helpers/familyPlannerCohort/state';
import { render, screen, fireEvent, waitFor } from '../../../tests/helpers/render';
import api from '../../api/client';
import { offlineDb, invalidateOfflineSession } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { mutationQueue } from '../../sync/mutationQueue';
import { setAuthed } from '../../sync/authGate';
import { FamilyPlannerTaskRecovery } from './FamilyPlannerTaskRecovery';
import { createPlannerCreationRecovery } from './plannerCreationRecovery';
import { readCreationReceipt } from './creationReceiptTransport';
import type { CreationPacket } from './plannerCreationContract';

const rows = () => offlineDb.mutationQueue.toArray();
function recovery() {
  return createPlannerCreationRecovery(cohortState.repo, trip, {
    source: () => cohortState.source,
    current: () => true,
  });
}
function interceptCreation(
  work: (name: string, args: Record<string, unknown>, next: () => Promise<unknown>) => Promise<unknown>
) {
  const original = required(db.rpc.getMockImplementation());
  db.rpc.mockImplementation((name: string, args: Record<string, unknown>) =>
    work(name, args, async () => original(name, args))
  );
}
async function pending() {
  const c = await beginNew();
  interceptCreation(async (name, _args, next) =>
    name === 'create_family_native_plan_v1' ? { data: null, error: { code: '08006' } } : next()
  );
  await expect(cohortState.cohort.creation.createForm(c, newData())).rejects.toThrow();
  expect(await rows()).toHaveLength(1);
  return required((await rows())[0]);
}
describe('native creation produces durable originals, rather than seeded test queue rows', () => {
  it('retains before the real producer invokes its RPC, verifies receipt, then clears after acknowledgement', async () => {
    const c = await beginNew(true),
      before = useTripStore.getState().places;
    let observed: CreationPacket | undefined;
    interceptCreation(async (name, args, next) => {
      if (name === 'create_family_native_plan_v1') {
        const queued = await rows();
        expect(queued).toHaveLength(1);
        observed = queued[0].body as CreationPacket;
        expect(queued[0].id).toBe(args.p_operation_id);
        expect(observed.form).toEqual(args.p_form);
        expect(observed.scope).toEqual(args.p_scope);
        expect(queued[0].resource).toBeUndefined();
        expect(queued[0].retentionPolicy).toBe('family-original-v1');
        expect(useTripStore.getState().places).toBe(before);
      }
      return next();
    });
    await cohortState.cohort.creation.createForm(c, newData());
    expect(observed).toBeDefined();
    expect(await rows()).toEqual([]);
    expect(cohortState.creationRows).toHaveLength(1);
    expect(db.rpc.mock.calls.filter(([n]) => n === 'get_family_native_plan_receipt_v1')).toHaveLength(1);
  });
  it('a persistence error dispatches nothing and preserves the form for retry', async () => {
    const c = await beginNew(),
      add = vi.spyOn(offlineDb.mutationQueue, 'add').mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(cohortState.cohort.creation.createForm(c, newData())).rejects.toThrow('Storage unavailable');
    expect(cohortState.creationRows).toHaveLength(0);
    expect(db.rpc.mock.calls.some(([n]) => n === 'create_family_native_plan_v1')).toBe(false);
    add.mockRestore();
    await cohortState.cohort.creation.createForm(c, newData());
    expect(cohortState.creationRows).toHaveLength(1);
  });
  it('losing a committed reply retains the original; check confirms without executing again', async () => {
    const c = await beginNew();
    cohortState.loseAck = true;
    await expect(cohortState.cohort.creation.createForm(c, newData())).rejects.toThrow();
    const row = required((await rows())[0]),
      original = JSON.stringify(row);
    expect(cohortState.creationRows).toHaveLength(1);
    cohortState.cohort.creation.cancelForm();
    const retained = required(await recovery().inspect());
    expect(JSON.stringify((await rows())[0])).toBe(original);
    expect(retained.domain).toBe('planner');
    expect(await retained.check()).toBe('committed');
    expect(await rows()).toEqual([]);
    expect(db.rpc.mock.calls.filter(([n]) => n === 'create_family_native_plan_v1')).toHaveLength(1);
  });
  it('a pre-execution failure survives a new recovery owner; unknown check never executes it', async () => {
    const row = await pending(),
      original = JSON.stringify(row);
    cohortState.cohort.creation.cancelForm();
    const retained = required(await recovery().inspect());
    expect(await retained.check()).toBe('unknown');
    expect(cohortState.creationRows).toHaveLength(0);
    expect(JSON.stringify((await rows())[0])).toBe(original);
  });
  it('the existing recovery UI checks unknown then retries the exact retained original', async () => {
    const row = await pending(),
      original = JSON.stringify(row);
    const raw = required(db.rpc.getMockImplementation());
    // Restore just the command path to the existing service without allocating a different packet.
    const { fakeCreation } = await import('../../../tests/helpers/familyPlannerCohort/planning');
    db.rpc.mockImplementation((name: string, args: Record<string, unknown>) =>
      name === 'create_family_native_plan_v1' ? Promise.resolve(fakeCreation(args)) : raw(name, args)
    );
    const r = recovery();
    render(
      <FamilyPlannerTaskRecovery
        problem={{ current: () => true, retry: async () => load() }}
        recovery={{ ...r, export: async () => {} }}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Check retained planner save' }));
    await screen.findByText(/original save is still unresolved/);
    expect(JSON.stringify((await rows())[0])).toBe(original);
    expect(cohortState.creationRows).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Retry original planner save' }));
    await waitFor(async () => expect(await rows()).toEqual([]));
    expect(cohortState.creationRows).toHaveLength(1);
    const sent = db.rpc.mock.calls.filter(([n]) => n === 'create_family_native_plan_v1').slice(-1)[0]?.[1];
    expect(sent?.p_operation_id).toBe(row.id);
    expect(sent?.p_form).toEqual((row.body as CreationPacket).form);
  });
  it('generic flush keeps the native producer original unchanged', async () => {
    const row = await pending(),
      send = vi.spyOn(api, 'request');
    await mutationQueue.flush();
    expect(send).not.toHaveBeenCalled();
    expect(await rows()).toEqual([row]);
  });
  it.each(['trip_id', 'operation_id', 'scope', 'result'] as const)(
    'a malformed %s acknowledgement cannot drop the original',
    async (field) => {
      const c = await beginNew();
      interceptCreation(async (name, args, next) => {
        const reply = (await next()) as { data: Record<string, unknown>; error: unknown };
        if (name === 'get_family_native_plan_receipt_v1')
          return {
            data: {
              ...reply.data,
              [field]:
                field === 'result'
                  ? null
                  : field === 'scope'
                    ? { ...(args.p_scope as object), user_id: uuid(999) }
                    : uuid(999),
            },
            error: null,
          };
        return reply;
      });
      await expect(cohortState.cohort.creation.createForm(c, newData())).rejects.toThrow();
      expect(await rows()).toHaveLength(1);
      expect(cohortState.creationRows).toHaveLength(1);
    }
  );
  it.each(['account', 'family', 'person', 'source', 'layer', 'logout'])(
    'changed %s cannot inspect or rewrite an original',
    async (kind) => {
      const row = await pending(),
        r = recovery(),
        before = db.rpc.mock.calls.length;
      if (kind === 'source') cohortState.source = 'https://another.invalid';
      if (kind === 'layer') cohortState.repo.setLayer(trip, 'myDraft');
      if (kind === 'logout') {
        setAuthed(false);
        invalidateOfflineSession();
      }
      if (['account', 'family', 'person'].includes(kind)) {
        cohortState.session = {
          ...cohortState.session,
          [kind === 'account' ? 'userId' : kind === 'family' ? 'familyId' : 'personId']: uuid(999),
        };
        cohortState.repo.acceptSession(cohortState.session);
      }
      await expect(r.inspect()).rejects.toThrow();
      expect(db.rpc.mock.calls).toHaveLength(before);
      expect(await rows()).toEqual([row]);
    }
  );
  it('changing the observed row while a receipt is checked preserves that row instead of acknowledging it', async () => {
    await pending();
    const retained = required(await recovery().inspect());
    const original = required(db.rpc.getMockImplementation());
    db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'get_family_native_plan_receipt_v1')
        await offlineDb.mutationQueue.update(String(args.p_operation_id), {
          lastError: 'Another tab changed this row',
        });
      return original(name, args);
    });
    await expect(retained.check()).rejects.toThrow();
    expect((await rows())[0].lastError).toBe('Another tab changed this row');
  });
  it('current permission refusal retains the original and does not attempt a new command', async () => {
    const row = await pending();
    cohortState.deny = { code: '42501' };
    const retained = required(await recovery().inspect());
    const before = db.rpc.mock.calls.filter(([n]) => n === 'create_family_native_plan_v1').length;
    await expect(retained.retry()).rejects.toThrow(/not authorized/);
    expect(await rows()).toEqual([row]);
    expect(db.rpc.mock.calls.filter(([n]) => n === 'create_family_native_plan_v1')).toHaveLength(before);
  });
  it('receipt checks preserve root identity and send the original scope/form only', async () => {
    const row = await pending(),
      p = row.body as CreationPacket;
    await readCreationReceipt(p);
    expect(db.rpc.mock.calls.filter(([n]) => n === 'get_family_native_plan_receipt_v1').slice(-1)[0]?.[1]).toEqual({
      p_trip_id: p.scope.trip_id,
      p_operation_id: p.operation_id,
      p_scope: p.scope,
      p_form: p.form,
    });
    expect(creationReceipts.size).toBe(0);
  });
  it('task-only admission refuses creation before persistence', async () => {
    const c = await beginNew();
    vi.stubEnv('VITE_DATA_PLANE', 'supabase');
    vi.stubEnv('VITE_SUPABASE_URL', ['https://family-core-fixture.', 'supabase', '.co'].join(''));
    vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', 'isolated-task-v1');
    try {
      await expect(cohortState.cohort.creation.createForm(c, newData())).rejects.toThrow(/task commands only/);
      expect(await rows()).toHaveLength(0);
      expect(cohortState.creationRows).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('logout invalidates the old recovery owner; a new same-actor owner can retry the same original', async () => {
    const row = await pending(),
      old = recovery();
    setAuthed(false);
    invalidateOfflineSession();
    await expect(old.inspect()).rejects.toThrow();
    setAuthed(true);
    const { fakeCreation } = await import('../../../tests/helpers/familyPlannerCohort/planning'),
      raw = required(db.rpc.getMockImplementation());
    db.rpc.mockImplementation((name: string, args: Record<string, unknown>) =>
      name === 'create_family_native_plan_v1' ? Promise.resolve(fakeCreation(args)) : raw(name, args)
    );
    const r = required(await recovery().inspect());
    expect(await r.retry()).toBe('committed');
    expect(await rows()).toHaveLength(0);
    expect(cohortState.creationRows).toHaveLength(1);
    expect(
      db.rpc.mock.calls.filter(([n]) => n === 'create_family_native_plan_v1').slice(-1)[0]?.[1]?.p_operation_id
    ).toBe(row.id);
  });
  it('replacing even metadata after inspection does not acknowledge or execute a different row', async () => {
    const row = await pending(),
      r = required(await recovery().inspect()),
      before = db.rpc.mock.calls.length;
    await offlineDb.mutationQueue.update(row.id, { attempts: row.attempts + 1 });
    await expect(r.check()).rejects.toThrow(/changed/);
    expect(db.rpc.mock.calls.length).toBe(before);
    expect(await rows()).toHaveLength(1);
  });
  it('two explicit recovery owners cannot duplicate a creation', async () => {
    const row = await pending(),
      a = required(await recovery().inspect()),
      b = required(await recovery().inspect());
    const { fakeCreation } = await import('../../../tests/helpers/familyPlannerCohort/planning'),
      raw = required(db.rpc.getMockImplementation());
    db.rpc.mockImplementation((name: string, args: Record<string, unknown>) =>
      name === 'create_family_native_plan_v1' ? Promise.resolve(fakeCreation(args)) : raw(name, args)
    );
    const results = await Promise.allSettled([a.retry(), b.retry()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(cohortState.creationRows).toHaveLength(1);
    expect(await rows()).toHaveLength(0);
    expect(
      db.rpc.mock.calls.filter(([n, args]) => n === 'create_family_native_plan_v1' && args?.p_operation_id === row.id)
    ).toHaveLength(2); // one failed original attempt plus one successful retry
  });
});
