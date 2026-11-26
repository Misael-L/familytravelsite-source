import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FamilyIdentityRegistry } from './identity';
import { PlannerDayNotes } from './plannerDayNotes';
import { useTripStore } from '../../store/tripStore';
import type { FamilyFrontendRepository } from './repository';
const io = vi.hoisted(() => ({ rpc: vi.fn(), older: vi.fn() }));
vi.mock('./planLocations', () => ({ locationRpc: io.rpc }));
vi.mock('./plannerCohortEditor', () => ({ refuseOlderQueue: io.older }));
vi.mock('../../sync/networkMode', async original => ({ ...(await original<typeof import('../../sync/networkMode')>()), isEffectivelyOffline: () => false }));
vi.mock('./actorContext', () => ({ captureFamilyActor: () => ({ assertCurrent() {}, perform: (run: () => Promise<unknown>) => run() }) }));
const uuid = (n: number) => `e1700000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = uuid(1), day = uuid(2), second = uuid(3), stamp = '2026-11-26T01:00:00Z';
let ids: FamilyIdentityRegistry, notes: PlannerDayNotes;
let saved: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks(); ids = new FamilyIdentityRegistry(uuid(90));
  const t = ids.register('trip', trip), d = ids.register('day', day), other = ids.register('day', second);
  useTripStore.setState({ trip: { id: t } as never, days: [{ id: d }, { id: other }] as never, dayNotes: {} });
  const repo = { session: async () => ({ userId: uuid(90), familyId: uuid(91), personId: uuid(92) }),
    views: async () => ({ ids }), tripUuid: async () => trip, getLayer: () => 'published', invalidate: vi.fn() } as unknown as FamilyFrontendRepository;
  notes = new PlannerDayNotes(repo, async () => {
    useTripStore.setState({ dayNotes: { [String(ids.register('day', saved.trip_day_id as string))]: [{
      id: ids.register('note', saved.id as string), day_id: ids.register('day', saved.trip_day_id as string),
      text: saved.body, time: saved.detail, color: saved.color, family_note: saved,
    } as never] } });
  });
  io.rpc.mockImplementation(async (_name, args) => {
    saved = { id: args.p_note_id ?? args.p_operation_id, trip_id: trip, trip_day_id: args.p_day_id,
      body: args.p_body, detail: args.p_detail, color: args.p_color, updated_at: stamp };
    return saved;
  });
});
describe('Family day-note commands', () => {
  it('retries the exact lost-reply command and preserves description, colour and fractional order', async () => {
    const save = io.rpc.getMockImplementation()!;
    io.rpc.mockImplementationOnce(async (...args) => { await save(...args); throw new Error('lost reply'); });
    const data = { text: 'Water', time: 'Bring **water** and snacks', color: '#dc2626', sort_order: 0.5 };
    await expect(notes.create(1, ids.register('day', day), data)).rejects.toThrow('lost reply');
    const result = await notes.create(1, ids.register('day', day), data);
    expect(io.rpc.mock.calls[0]).toEqual(io.rpc.mock.calls[1]);
    expect(io.rpc.mock.calls[1]).toEqual(['save_family_trip_day_note_v3', expect.objectContaining({ p_detail: data.time, p_color: data.color, p_sort_order: 0.5 })]);
    expect(result.note.time).toBe(data.time);
  });
  it('holds unresolved content instead of starting a different save', async () => {
    io.rpc.mockRejectedValueOnce(new Error('lost reply'));
    await expect(notes.create(1, ids.register('day', day), { text: 'First' })).rejects.toThrow();
    await expect(notes.create(1, ids.register('day', day), { text: 'Different' })).rejects.toThrow('original note save');
    expect(io.rpc).toHaveBeenCalledTimes(1);
  });
  it('moves the same note UUID atomically with its original timestamp', async () => {
    const first = await notes.create(1, ids.register('day', day), { text: 'Water', time: 'Detail' });
    await notes.move(1, ids.register('day', second), first.note, 0.5);
    expect(io.rpc.mock.calls[1][1]).toMatchObject({ p_note_id: ids.uuid('note', first.note.id), p_expected_updated_at: stamp,
      p_day_id: second, p_detail: 'Detail', p_sort_order: 0.5 });
  });
  it('refuses hydration after navigating away during a save', async () => {
    const save = io.rpc.getMockImplementation()!;
    io.rpc.mockImplementationOnce(async (...args) => { const result = await save(...args); useTripStore.setState({ trip: { id: 123 } as never }); return result; });
    await expect(notes.create(1, ids.register('day', day), { text: 'Water' })).rejects.toThrow('session changed');
    expect(useTripStore.getState().dayNotes).toEqual({});
  });
  it('checks retained older work before issuing a new command', async () => {
    io.older.mockRejectedValueOnce(new Error('older work retained'));
    await expect(notes.create(1, ids.register('day', day), { text: 'Water' })).rejects.toThrow('older work retained');
    expect(io.rpc).not.toHaveBeenCalled();
  });
});
