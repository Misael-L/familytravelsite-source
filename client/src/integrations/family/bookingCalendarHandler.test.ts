import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const boundary = vi.hoisted(() => ({ rpc: vi.fn(), source: 'https://fixture.supabase.invalid' }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => boundary.source }));
const uuid = (n: number) => `d0400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = uuid(1),
  booking = uuid(2),
  day = uuid(3);
const session: FamilySession = {
  userId: uuid(4),
  familyId: uuid(5),
  personId: uuid(6),
  user: { username: 'Fixture', email: 'calendar@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
};
const observed = () => ({
  reservation_id: booking,
  trip_id: trip,
  revision: 1,
  start_date: null,
  end_date: null,
  start_day_id: null,
  end_day_id: null,
});
const scope = () => ({
  version: 1,
  trip_id: trip,
  family_id: session.familyId,
  user_id: session.userId,
  person_id: session.personId,
  layer: 'published',
});
const packet = () => ({
  version: 1,
  source_url: boundary.source,
  operation_id: uuid(7),
  scope: scope(),
  observation: observed(),
  dates: { start_date: '2027-04-01', end_date: null },
});
let repo: FamilyFrontendRepository;
let client: ReturnType<typeof axios.create>;
let path: string;
let current: {
  reservation_id: string;
  trip_id: string;
  revision: number;
  start_date: string | null;
  end_date: string | null;
  start_day_id: string | null;
  end_day_id: string | null;
};
let saved: Map<string, unknown>;
beforeEach(async () => {
  boundary.source = 'https://fixture.supabase.invalid';
  boundary.rpc.mockReset();
  current = observed();
  saved = new Map();
  repo = new FamilyFrontendRepository(async () => session);
  const ids = (await repo.views()).ids;
  path = `/trips/${ids.register('trip', trip)}/reservations/${ids.register('reservation', booking)}/family/calendar`;
  client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
  boundary.rpc.mockImplementation(async (name, args) => {
    if (name === 'get_family_booking_calendar_v1')
      return {
        data: {
          version: 1,
          trip_id: trip,
          family_id: session.familyId,
          user_id: session.userId,
          person_id: session.personId,
          dates: current,
        },
        error: null,
      };
    if (name !== 'set_family_booking_calendar_v1') throw new Error('Unexpected legacy fallback ' + name);
    if (!saved.has(args.p_operation_id)) {
      current = {
        ...observed(),
        ...args.p_dates,
        revision: 2,
        start_day_id: args.p_dates.start_date === '2027-04-01' ? day : null,
      };
      saved.set(args.p_operation_id, {
        version: 1,
        state: 'published',
        operation_id: args.p_operation_id,
        changed: true,
        dates: current,
      });
    }
    return { data: saved.get(args.p_operation_id), error: null };
  });
});
describe('actual application dispatch and Axios booking-date contract', () => {
  it('resolves native numeric IDs and reads independent dates without legacy booking writes', async () => {
    const { data } = await client.get(path);
    expect(data.dates).toEqual(observed());
    expect(boundary.rpc).toHaveBeenCalledExactlyOnceWith('get_family_booking_calendar_v1', {
      p_trip_id: trip,
      p_reservation_id: booking,
    });
  });
  it('sends only explicit date facts, original scope and observed state', async () => {
    const p = packet();
    const { data } = await client.post(path, p);
    expect(data.dates).toMatchObject({ start_date: '2027-04-01', start_day_id: day, revision: 2 });
    expect(boundary.rpc).toHaveBeenCalledExactlyOnceWith('set_family_booking_calendar_v1', {
      p_trip_id: trip,
      p_reservation_id: booking,
      p_operation_id: p.operation_id,
      p_scope: p.scope,
      p_observation: p.observation,
      p_dates: p.dates,
    });
  });
  it('allows date-only outside-calendar values without an invented midnight', async () => {
    const p = packet();
    p.dates.start_date = '2027-04-08';
    const { data } = await client.post(path, p);
    expect(data.dates.start_day_id).toBeNull();
    expect(data.dates.start_date).toBe('2027-04-08');
    expect(JSON.stringify(boundary.rpc.mock.calls)).not.toContain('starts_at');
  });
  it('uses the original operation and observation after a lost reply', async () => {
    const p = packet(),
      implementation = boundary.rpc.getMockImplementation();
    boundary.rpc.mockImplementationOnce(async (...args) => {
      await implementation?.(...args);
      throw new TypeError('Lost network response');
    });
    await expect(client.post(path, p)).rejects.toThrow('Lost network response');
    const { data } = await client.post(path, p);
    expect(data.dates.revision).toBe(2);
    expect(saved.size).toBe(1);
    expect(boundary.rpc.mock.calls[0]).toEqual(boundary.rpc.mock.calls[1]);
  });
  it('does not hydrate native state from a historical retry receipt', async () => {
    const p = packet();
    await client.post(path, p);
    current = { ...current, revision: 3, start_date: '2027-04-02' };
    const invalidate = vi.spyOn(repo, 'invalidate');
    const { data } = await client.post(path, p);
    expect(data.dates.start_date).toBe('2027-04-01');
    expect(current.start_date).toBe('2027-04-02');
    expect(invalidate).toHaveBeenCalledWith(trip);
  });
  it.each(['PT409', '42501', '0A000'])('propagates %s without a legacy write fallback', async (code) => {
    boundary.rpc.mockResolvedValue({ data: null, error: { code, message: 'Refused by actual authority contract' } });
    await expect(client.post(path, packet())).rejects.toMatchObject({
      response: { status: code === '42501' ? 403 : 409 },
    });
    expect(boundary.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(['source', 'trip', 'booking', 'user', 'person', 'family', 'private'])(
    'rejects changed %s before sending',
    async (kind) => {
      const p = packet();
      if (kind === 'source') p.source_url = 'https://other.supabase.invalid';
      if (kind === 'trip') p.scope.trip_id = uuid(90);
      if (kind === 'booking') p.observation.reservation_id = uuid(90);
      if (kind === 'user') p.scope.user_id = uuid(90);
      if (kind === 'person') p.scope.person_id = uuid(90);
      if (kind === 'family') p.scope.family_id = uuid(90);
      if (kind === 'private') p.scope.layer = 'myDraft';
      await expect(client.post(path, p)).rejects.toMatchObject({ response: { status: 409 } });
      expect(boundary.rpc).not.toHaveBeenCalled();
    }
  );
  it.each(['2027-02-29', '0000-01-01', '2027-04-01T00:00Z'])(
    'rejects %s through the real HTTP coordinator',
    async (date) => {
      const p = packet();
      p.dates.start_date = date;
      await expect(client.post(path, p)).rejects.toMatchObject({ response: { status: 400 } });
      expect(boundary.rpc).not.toHaveBeenCalled();
    }
  );
  it('rejects unknown fields rather than allowing confirmation or timestamp changes', async () => {
    const p = packet();
    await expect(
      client.post(path, { ...p, dates: { ...p.dates, starts_at: '2027-04-01T00:00Z' } })
    ).rejects.toMatchObject({ response: { status: 400 } });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it.each(['trip_id', 'family_id', 'user_id', 'person_id'])('rejects foreign GET %s', async (key) => {
    boundary.rpc.mockResolvedValue({
      data: {
        version: 1,
        trip_id: trip,
        family_id: session.familyId,
        user_id: session.userId,
        person_id: session.personId,
        [key]: uuid(90),
        dates: current,
      },
      error: null,
    });
    await expect(client.get(path)).rejects.toMatchObject({ response: { status: 502 } });
  });
  it('rejects another booking in a successful GET response', async () => {
    boundary.rpc.mockResolvedValue({
      data: {
        version: 1,
        trip_id: trip,
        family_id: session.familyId,
        user_id: session.userId,
        person_id: session.personId,
        dates: { ...current, reservation_id: uuid(90) },
      },
      error: null,
    });
    await expect(client.get(path)).rejects.toMatchObject({ response: { status: 502 } });
  });
  it.each(['operation', 'booking', 'date', 'revision'])(
    'rejects inconsistent receipt %s before invalidating',
    async (kind) => {
      const p = packet(),
        dates = { ...current, ...p.dates, revision: 2, start_day_id: day };
      if (kind === 'booking') dates.reservation_id = uuid(90);
      if (kind === 'date') dates.start_date = '2027-04-02';
      if (kind === 'revision') dates.revision = 1;
      boundary.rpc.mockResolvedValue({
        data: {
          version: 1,
          state: 'published',
          operation_id: kind === 'operation' ? uuid(90) : p.operation_id,
          changed: true,
          dates,
        },
        error: null,
      });
      const invalidate = vi.spyOn(repo, 'invalidate');
      await expect(client.post(path, p)).rejects.toMatchObject({ response: { status: 502 } });
      expect(invalidate).not.toHaveBeenCalled();
    }
  );
  it('fences a changed Family account after the async reply', async () => {
    const implementation = boundary.rpc.getMockImplementation();
    boundary.rpc.mockImplementationOnce(async (...args) => {
      const answer = await implementation?.(...args);
      repo.clear();
      return answer;
    });
    await expect(client.post(path, packet())).rejects.toMatchObject({ response: { status: 409 } });
  });
  it('fences a switched data source after the async reply', async () => {
    const implementation = boundary.rpc.getMockImplementation();
    boundary.rpc.mockImplementationOnce(async (...args) => {
      const answer = await implementation?.(...args);
      boundary.source = 'https://other.supabase.invalid';
      return answer;
    });
    await expect(client.post(path, packet())).rejects.toMatchObject({ response: { status: 409 } });
  });
  it('fences an aborted request after a save without pretending to undo it', async () => {
    const controller = new AbortController(),
      implementation = boundary.rpc.getMockImplementation();
    boundary.rpc.mockImplementationOnce(async (...args) => {
      const answer = await implementation?.(...args);
      controller.abort();
      return answer;
    });
    await expect(client.post(path, packet(), { signal: controller.signal })).rejects.toMatchObject({
      code: 'ERR_CANCELED',
    });
    expect(saved.size).toBe(1);
  });
  it('refuses an unsupported method or partial query before calling any RPC', async () => {
    await expect(client.delete(path)).rejects.toMatchObject({ response: { status: 405 } });
    await expect(client.get(path + '?date=2027-04-01')).rejects.toMatchObject({ response: { status: 405 } });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
});
