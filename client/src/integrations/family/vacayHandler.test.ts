import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFamilyApplicationHandler } from './applicationHandler';
import * as holidays from './legacy/data/supabase/nagerHolidays';
import * as calendar from './legacy/data/supabase/vacay';
import { buildHolidaysMap, defaultFamilyCalendarSettings, settingsToVacayPlan } from './legacy/pages/vacay/vacayModel';
import { familyAuthStore, FamilyFrontendRepository, familyReaders, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const originalSession: FamilySession = {
  userId: id(1),
  personId: id(2),
  familyId: id(3),
  user: { username: 'Fixture', email: 'holiday@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
};
const holiday = {
  date: '2026-01-01',
  name: 'New Year',
  countryCode: 'IT',
  nationalHoliday: true,
  subdivisionCodes: null,
  holidayTypes: ['Public'],
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let repo: FamilyFrontendRepository;
let client: ReturnType<typeof axios.create>;
let actor: FamilySession;
let source: string;
const initialAuth = familyAuthStore.getState();

beforeEach(async () => {
  actor = structuredClone(originalSession);
  source = 'https://holiday-fixture.invalid';
  repo = new FamilyFrontendRepository(
    async () => actor,
    familyReaders,
    () => ({ ...actor, source })
  );
  await repo.session();
  client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
  familyAuthStore.setState({ membershipRole: 'child', isSuperAdmin: false });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw Error('Unexpected network request');
    })
  );
});
afterEach(() => {
  repo.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  familyAuthStore.setState(initialAuth, true);
});

function fetched(body: unknown, status = 200) {
  const fetcher = vi.fn().mockResolvedValue(response(body, status));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
function deferred() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  const fetcher = vi.fn(() => promise);
  vi.stubGlobal('fetch', fetcher);
  return { resolve, fetcher };
}

describe('real Family holiday route through Axios, legacy export and backend adapter', () => {
  it('routes countries through the real backend module without a Nest proxy', async () => {
    const fetcher = fetched([{ countryCode: 'IT', name: 'Italy' }]);
    expect((await client.get('/addons/vacay/holidays/countries')).data).toEqual([{ countryCode: 'IT', name: 'Italy' }]);
    expect(fetcher.mock.calls[0][0]).toBe('https://nagerholidays.com/api/v4/Countries/Available');
    // A second direct legacy import reaches the same real adapter, not a mocked handler result.
    fetcher.mockResolvedValueOnce(response([]));
    await expect(holidays.fetchNagerCountries()).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('returns existing holiday fields and preserves regional calendar selection', async () => {
    fetched([
      holiday,
      { ...holiday, date: '2026-04-25', name: 'Regional', nationalHoliday: false, subdivisionCodes: ['IT-BZ'] },
    ]);
    const rows = (await client.get('/addons/vacay/holidays/2026/it')).data;
    expect(rows[0]).toEqual({
      date: holiday.date,
      name: holiday.name,
      localName: holiday.name,
      global: true,
      counties: null,
    });
    const calendars = [
      { id: id(8), plan_id: id(3), sort_order: 0, region: 'IT-BZ', color: '#112233', label: 'Existing calendar' },
    ];
    expect(Object.keys(buildHolidaysMap(calendars, { IT: rows }))).toEqual(['2026-01-01', '2026-04-25']);
    expect(Object.keys(buildHolidaysMap([{ ...calendars[0], region: 'IT-21' }], { IT: rows }))).toEqual(['2026-01-01']);
  });
  it('preserves the original saved calendar ID, region and settings across provider reads', async () => {
    const saved = {
      id: id(8),
      plan_id: id(3),
      sort_order: 0,
      region: 'IT-BZ',
      color: '#112233',
      label: 'Existing calendar',
    };
    const settings = { ...defaultFamilyCalendarSettings(actor.familyId), visibleYears: [2026], holidaysEnabled: true };
    vi.spyOn(calendar, 'loadVacayYear').mockResolvedValue({
      settings,
      plan: settingsToVacayPlan(settings, [saved]),
      users: [],
      entries: [],
      blockedDates: [],
      ptoRows: [],
      tripWindows: [],
      overlay: {
        extraPersonIds: [],
        extraPeople: [],
        presets: [],
        pendingOutgoing: [],
        incomingPending: [],
        viewablePersonIds: [],
        visiblePersonIds: [],
        paintablePersonIds: [],
      },
    });
    const write = vi.spyOn(calendar, 'upsertCalendarSettings');
    const first = (await client.get('/addons/vacay/plan')).data;
    const before = structuredClone(saved);
    fetched([holiday]);
    await client.get('/addons/vacay/holidays/2026/IT');
    const after = (await client.get('/addons/vacay/plan')).data;
    expect(after.plan).toEqual(first.plan);
    expect(saved).toEqual(before);
    const cal = after.plan.holiday_calendars[0];
    expect(cal).toMatchObject({ region: saved.region, color: saved.color, label: saved.label });
    expect((await repo.views()).ids.uuid('holidayCalendar', cal.id)).toBe(saved.id);
    expect(write).not.toHaveBeenCalled();
  });
  it('keeps a legitimate empty calendar successful', async () => {
    fetched([]);
    expect((await client.get('/addons/vacay/holidays/2026/IT')).data).toEqual([]);
  });
  it.each([403, 404, 429, 503])(
    'propagates provider HTTP %s as unavailable, never a successful empty calendar',
    async (status) => {
      const fetcher = fetched([], status);
      await expect(client.get('/addons/vacay/holidays/2026/ZZ')).rejects.toMatchObject({
        response: { status: 503, data: { code: 'family_backend_error' } },
      });
      expect(fetcher).toHaveBeenCalledOnce();
    }
  );
  it('refuses invalid provider facts instead of returning partially valid rows', async () => {
    fetched([holiday, { ...holiday, countryCode: 'DE' }]);
    await expect(client.get('/addons/vacay/holidays/2026/IT')).rejects.toMatchObject({ response: { status: 503 } });
  });
  it.each(['0000/IT', '2201/IT', '2e03/IT', '2026/ITA', 'countries/extra', '2026/IT/extra'])(
    'rejects malformed route %s before a provider request',
    async (suffix) => {
      const fetcher = fetched([]);
      await expect(client.get('/addons/vacay/holidays/' + suffix)).rejects.toMatchObject({ response: { status: 422 } });
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it('stops a pending provider request when its caller cancels', async () => {
    const wait = deferred(),
      controller = new AbortController();
    const pending = client.get('/addons/vacay/holidays/countries', { signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await vi.waitFor(() => expect(wait.fetcher).toHaveBeenCalledOnce());
    controller.abort();
    await assertion;
    expect((wait.fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
    wait.resolve(response([]));
  });
  it.each(['logout', 'person', 'family', 'source'])(
    'cancels the original lookup across %s retirement',
    async (kind) => {
      const wait = deferred();
      const pending = client.get('/addons/vacay/holidays/countries');
      const assertion = expect(pending).rejects.toMatchObject({ response: { status: 409 } });
      await vi.waitFor(() => expect(wait.fetcher).toHaveBeenCalledOnce());
      if (kind === 'logout') repo.clear();
      else if (kind === 'source') {
        source = 'https://replacement.invalid';
        repo.refreshContext();
      } else {
        actor = { ...actor, [kind === 'person' ? 'personId' : 'familyId']: id(90) };
        repo.acceptSession(actor);
      }
      await assertion;
      expect((wait.fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
      wait.resolve(response([{ countryCode: 'IT', name: 'Late response' }]));
    }
  );
  it('does not retire a global holiday lookup for an unrelated Trip read refresh', async () => {
    const wait = deferred(),
      pending = client.get('/addons/vacay/holidays/countries');
    await vi.waitFor(() => expect(wait.fetcher).toHaveBeenCalledOnce());
    repo.invalidate(id(20));
    expect((wait.fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(false);
    wait.resolve(response([]));
    expect((await pending).data).toEqual([]);
  });
  it('cancels a stalled body after logout', async () => {
    const cancel = vi.fn(),
      body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const pending = client.get('/addons/vacay/holidays/countries'),
      assertion = expect(pending).rejects.toMatchObject({ response: { status: 409 } });
    await vi.waitFor(() => expect(body.locked).toBe(true));
    repo.clear();
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('keeps partial-day writes refused and whole-day payloads unchanged', async () => {
    const save = vi.spyOn(calendar, 'toggleCalendarEntry').mockResolvedValue('inserted');
    await expect(
      client.post('/addons/vacay/entries/toggle', { date: '2026-04-25', kind: 'vacation', fraction: 0.5 })
    ).rejects.toMatchObject({ response: { status: 422 } });
    expect(save).not.toHaveBeenCalled();
    expect(
      (await client.post('/addons/vacay/entries/toggle', { date: '2026-04-25', kind: 'vacation', fraction: 1 })).data
    ).toEqual({ action: 'inserted' });
    expect(save).toHaveBeenCalledExactlyOnceWith({
      familyId: actor.familyId,
      personId: actor.personId,
      date: '2026-04-25',
      kind: 'away',
    });
  });
  it('does not give holiday readers calendar-administration permission', async () => {
    vi.spyOn(calendar, 'fetchCalendarSettings').mockResolvedValue(defaultFamilyCalendarSettings(actor.familyId));
    const save = vi.spyOn(calendar, 'upsertCalendarSettings');
    await expect(client.post('/addons/vacay/years', { year: 2027 })).rejects.toMatchObject({
      response: { status: 403, data: { code: 'calendar_manage_required' } },
    });
    expect(save).not.toHaveBeenCalled();
  });
  it('removes request-owned context listeners after successful or failed requests', async () => {
    const subscribe = repo.subscribeContext.bind(repo),
      stops: ReturnType<typeof vi.fn<() => void>>[] = [];
    vi.spyOn(repo, 'subscribeContext').mockImplementation((listener) => {
      const unsubscribe = subscribe(listener);
      const stop = vi.fn<() => void>(() => {
        unsubscribe();
      });
      stops.push(stop);
      return stop;
    });
    fetched([]);
    await client.get('/addons/vacay/holidays/countries');
    fetched({}, 503);
    await expect(client.get('/addons/vacay/holidays/countries')).rejects.toMatchObject({ response: { status: 503 } });
    expect(stops).toHaveLength(2);
    expect(stops.every((stop) => stop.mock.calls.length === 1)).toBe(true);
  });
});
