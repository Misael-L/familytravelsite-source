import { todoListResponseSchema } from '@trek/shared';
import axios from 'axios';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalPackingBag, canonicalPackingList, canonicalPackingRow } from '../../../tests/helpers/familyPacking';
import { canonicalTask, taskFixtureAt } from '../../../tests/helpers/familyTasks';
import { setAuthed } from '../../sync/authGate';
import { createFamilyApplicationHandler } from './applicationHandler';
import type { FamilyTripExpenseSettlement } from './legacy/data/supabase/tripExpenseSettlements';
import { createPlannerApplicationReads } from './plannerApplicationReads';
import { createFamilyPlannerCohort } from './plannerCohort';
import { FamilyFrontendRepository, familyReaders, type FamilySession } from './repository';
import { createFamilyAxiosAdapter, type FamilyHandler } from './transport';

const sdk = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
const settlement = vi.hoisted(() => vi.fn(async (): Promise<FamilyTripExpenseSettlement[]> => []));
vi.mock('./legacy/data/supabase/tripExpenseSettlements', () => ({ listTripExpenseSettlements: settlement }));
const uuid = (n: number) => `a0490000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session: FamilySession = {
  userId: uuid(1),
  personId: uuid(2),
  familyId: uuid(3),
  user: { username: 'Reader', email: 'reader@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
};
const trip = uuid(4),
  companion = uuid(5);
const header = {
  id: trip,
  family_id: session.familyId,
  title: 'Ancillary rehearsal',
  description: null,
  start_date: '2027-04-01',
  end_date: '2027-04-04',
  cover_image: null,
  is_archived: 0,
  currency: 'USD',
  reminder_days: 0,
  status: 'planned',
};
let repo: FamilyFrontendRepository, release: () => void, handle: FamilyHandler;
const legacy = vi.fn(async () => {
  throw new Error('Legacy aggregate read attempted');
});
beforeEach(async () => {
  setAuthed(true);
  settlement.mockClear();
  legacy.mockClear();
  sdk.rpc.mockImplementation(async (name: string) => {
    if (name === 'get_family_trip_packing_v1') {
      const packet = canonicalPackingList(
        { trip_id: trip, family_id: session.familyId, user_id: session.userId, person_id: session.personId },
        true
      );
      packet.items = [
        canonicalPackingRow({
          id: uuid(6),
          trip_id: trip,
          quantity: 2,
          packed_quantity: null,
          bag_id: uuid(7),
          owner_person_id: session.personId,
          recipient_person_ids: [companion],
          contributor_person_ids: [session.personId],
        }),
      ];
      packet.bags = [
        canonicalPackingBag({ id: uuid(7), trip_id: trip, member_person_ids: [companion], total_weight_grams: 700 }),
      ];
      return { data: packet, error: null };
    }
    if (name !== 'get_family_trip_tasks_v1') throw new Error('Unexpected task fixture RPC ' + name);
    return {
      data: {
        version: 1,
        scope: {
          version: 1,
          trip_id: trip,
          family_id: session.familyId,
          user_id: session.userId,
          person_id: session.personId,
          layer: 'published',
          trip_lifecycle_revision: 0,
        },
        collection_revision: 7,
        tasks: [canonicalTask({ id: uuid(8), trip_id: trip, name: 'Book museum', assigned_person_id: companion })],
        trash_count: 0,
      },
      error: null,
    };
  });
  const readers = {
    ...familyReaders,
    trips: { ...familyReaders.trips, fetchTripById: vi.fn(async () => header) },
    days: { ...familyReaders.days, listTripDays: legacy },
    places: { ...familyReaders.places, listTripPlaces: legacy },
    schedule: { ...familyReaders.schedule, listScheduleItems: legacy },
    notes: { ...familyReaders.notes, listDayNotes: legacy },
    listTripTravelers: vi.fn(async () => [
      { personId: session.personId, displayName: 'Reader', color: '#336699' },
      { personId: companion, displayName: 'Companion', color: null },
    ]),
    packing: {
      ...familyReaders.packing,
      listPackingItems: vi.fn(async () => [
        {
          id: uuid(6),
          tripId: trip,
          name: 'Raincoat',
          checked: false,
          category: 'Clothes',
          sortOrder: 0,
          quantity: 2,
          weightGrams: 350,
          bagId: uuid(7),
          isPrivate: true,
          ownerPersonId: session.personId,
          recipientPersonIds: [companion],
          contributorPersonIds: [session.personId],
        },
      ]),
      listPackingBags: vi.fn(async () => [
        {
          id: uuid(7),
          tripId: trip,
          name: 'Cabin bag',
          color: '#336699',
          weightLimitGrams: 8000,
          sortOrder: 0,
          memberPersonIds: [companion],
        },
      ]),
    },
    todos: {
      ...familyReaders.todos,
      listTodoItems: vi.fn(async () => [
        {
          id: uuid(8),
          tripId: trip,
          name: 'Book museum',
          checked: false,
          category: 'Planning',
          sortOrder: 0,
          dueDate: null,
          description: 'Keep this note',
          assignedPersonId: companion,
          priority: 1,
        },
      ]),
    },
    files: {
      ...familyReaders.files,
      listTripFiles: vi.fn(async () => [
        {
          id: uuid(9),
          tripId: trip,
          storagePath: trip + '/guide.pdf',
          originalName: 'Guide.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 256,
          uploadedBy: session.personId,
          starred: true,
          description: 'Retain metadata',
          deletedAt: null,
          createdAt: '2026-11-08T00:00:00Z',
          links: [],
        },
      ]),
    },
    expenses: {
      ...familyReaders.expenses,
      listTripExpenses: vi.fn(async () => [
        {
          id: uuid(10),
          tripId: trip,
          name: 'Shared meal',
          category: 'food' as const,
          totalAmount: 40,
          currencyCode: 'USD',
          exchangeRate: 1,
          expenseDate: null,
          note: 'Receipt note',
          ticketLines: [],
          reservationId: null,
          sortOrder: 0,
          createdAt: '2026-11-08T00:00:00Z',
          shares: [
            { expenseId: uuid(10), personId: companion, amount: 20 },
            { expenseId: uuid(10), personId: session.personId, amount: 20 },
          ],
          payers: [{ expenseId: uuid(10), personId: session.personId, amount: 40 }],
        },
      ]),
    },
  };
  repo = new FamilyFrontendRepository(async () => session, readers);
  await repo.session();
  vi.spyOn(repo, 'core').mockImplementation(legacy);
  const cohort = createFamilyPlannerCohort(repo, { reportError: vi.fn(), source: () => 'local-fixture' });
  release = cohort.install();
  handle = cohort.handle;
});
afterEach(() => {
  release();
  vi.restoreAllMocks();
  setAuthed(false);
});
const request = (pathname: string, method = 'GET', signal?: AbortSignal) => ({
  method,
  pathname,
  query: new URLSearchParams(),
  body: undefined,
  signal,
});
const routes = [
  ['map-markers', { markers: [] }],
  ['map-layers', { layers: [] }],
  ['day-schedule', { items: [] }],
  ['day-tints', { tints: [] }],
  ['trip-warnings', { warnings: [] }],
  ['view-contributions/plan', { contributions: [] }],
] as const;

describe('installed planner through actual application/Axios handlers', () => {
  it.each(routes)(
    '%s accepts canonical and registered native Trip identity without legacy reads',
    async (path, expected) => {
      const ids = (await repo.views()).ids,
        native = ids.register('trip', trip);
      for (const selector of [trip, native]) expect(await handle(request(`/${path}/${selector}`))).toEqual(expected);
      expect(repo.readers.trips.fetchTripById).toHaveBeenCalledWith(trip);
      expect(legacy).not.toHaveBeenCalled();
    }
  );
  it.each(['docsync/providers', 'docsync/connections', 'docsync/links', 'docsync/status', 'tour-draft', 'tours'])(
    '%s keeps its disabled-provider response and still checks Trip membership',
    async (suffix) => {
      await expect(handle(request(`/trips/${trip}/${suffix}`))).resolves.toBeDefined();
      expect(repo.readers.trips.fetchTripById).toHaveBeenCalledWith(trip);
      expect(legacy).not.toHaveBeenCalled();
    }
  );
  it('refuses unqualified lodging after checking Trip membership instead of inventing an empty list', async () => {
    await expect(handle(request('/trips/' + trip + '/accommodations'))).rejects.toMatchObject({
      status: 503,
      code: 'family_stays_unavailable',
    });
    expect(repo.readers.trips.fetchTripById).toHaveBeenCalledWith(trip);
    expect(legacy).not.toHaveBeenCalled();
  });
  it('preserves nonempty native list, file, expense and traveler identities', async () => {
    const client = axios.create({ adapter: createFamilyAxiosAdapter(handle) });
    const ids = (await repo.views()).ids;
    const packing = (await client.get(`/trips/${trip}/packing`)).data;
    expect(ids.uuid('packing', packing.items[0].id)).toBe(uuid(6));
    expect(ids.uuid('packingBag', packing.items[0].bag_id)).toBe(uuid(7));
    expect(ids.uuid('person', packing.items[0].owner_id)).toBe(session.personId);
    expect(ids.uuid('person', packing.items[0].recipients[0].user_id)).toBe(companion);
    expect(packing.items[0]).toMatchObject({ name: 'Raincoat', is_private: 1, quantity: 2 });
    const todo = (await client.get(`/trips/${trip}/todo`)).data.items[0];
    expect(ids.uuid('todo', todo.id)).toBe(uuid(8));
    expect(ids.uuid('person', todo.assigned_user_id)).toBe(companion);
    const files = (await client.get(`/trips/${trip}/files`)).data.files;
    expect(ids.uuid('file', files[0].id)).toBe(uuid(9));
    expect(files[0]).toMatchObject({ original_name: 'Guide.pdf', starred: 1 });
    const budget = (await client.get(`/trips/${trip}/budget`)).data.items;
    expect(ids.uuid('expense', budget[0].id)).toBe(uuid(10));
    expect(budget[0]).toMatchObject({ total_price: 40, note: 'Receipt note' });
    expect((await client.get(`/trips/${trip}/members`)).data.members).toHaveLength(2);
    expect(legacy).not.toHaveBeenCalled();
  });
  it('canonical task rows satisfy the native contract without invented timestamps', async () => {
    const response = await handle(request(`/trips/${trip}/todo`));
    expect(todoListResponseSchema.parse(response).items[0]).toMatchObject({
      name: 'Book museum',
      created_at: taskFixtureAt,
      reminded_at: null,
    });
  });
  it('settlement summary uses the canonical currency and actual expense math without core', async () => {
    const result = await handle(request(`/trips/${trip}/budget/settlement`));
    expect(result).toMatchObject({
      currency: 'USD',
      balances: expect.arrayContaining([
        expect.objectContaining({ username: 'Reader', balance: 20 }),
        expect.objectContaining({ username: 'Companion', balance: -20 }),
      ]),
    });
    expect(settlement).toHaveBeenCalledWith(trip);
    expect(legacy).not.toHaveBeenCalled();
  });
  it.each([
    { currencyCode: null, amount: 4 },
    { currencyCode: 'USD', amount: 8 },
  ])(
    'uses one display amount for balances and final budgets with payment currency $currencyCode',
    async ({ currencyCode, amount }) => {
      settlement.mockResolvedValueOnce([
        {
          id: uuid(11),
          tripId: trip,
          fromPersonId: companion,
          toPersonId: session.personId,
          amount,
          currencyCode,
          exchangeRate: 1,
          createdAt: '2026-11-08T00:00:00Z',
          createdByPersonId: companion,
        },
      ]);
      const result = await handle({
        ...request(`/trips/${trip}/budget/settlement`),
        query: new URLSearchParams({ base: 'EUR', base_rate: '0.5' }),
      });
      expect(result).toMatchObject({
        currency: 'EUR',
        flows: [{ from: { username: 'Companion' }, to: { username: 'Reader' }, amount: 6 }],
        settlements: [{ amount, currency: currencyCode }],
        finalBudgets: expect.arrayContaining([
          expect.objectContaining({
            username: 'Reader',
            expenses: 20,
            reimbursed: 4,
            pending: 6,
            final: 10,
            sources: expect.objectContaining({ moved: [expect.objectContaining({ cents: 400 })] }),
          }),
          expect.objectContaining({
            username: 'Companion',
            expenses: 0,
            reimbursed: -4,
            pending: -6,
            final: 10,
            sources: expect.objectContaining({ moved: [expect.objectContaining({ cents: -400 })] }),
          }),
        ]),
      });
      expect(legacy).not.toHaveBeenCalled();
    }
  );
  it.each([null, { ...header, id: uuid(90) }, { ...header, family_id: uuid(91) }])(
    'refuses missing/wrong Trip or Family before any ancillary reader: %j',
    async (bad) => {
      vi.spyOn(repo.readers.trips, 'fetchTripById').mockResolvedValue(bad);
      await expect(handle(request(`/trips/${trip}/packing`))).rejects.toMatchObject({
        status: 403,
        code: 'trip_scope_unavailable',
      });
      expect(repo.readers.packing.listPackingItems).not.toHaveBeenCalled();
    }
  );
  it.each(['packing', 'todo', 'budget', 'files', 'days', 'places', 'reservations'])(
    'still refuses raw %s writers before core/SDK/queue changes',
    async (suffix) => {
      await expect(handle(request(`/trips/${trip}/${suffix}`, 'POST'))).rejects.toMatchObject({
        code: 'planner_writer_not_cut_over',
      });
      expect(repo.readers.trips.fetchTripById).not.toHaveBeenCalled();
      expect(legacy).not.toHaveBeenCalled();
    }
  );
  it('does not turn a backend failure into an empty success', async () => {
    vi.spyOn(repo.readers.trips, 'fetchTripById').mockRejectedValue(new Error('RLS read failed'));
    await expect(handle(request(`/day-schedule/${trip}`))).rejects.toThrow('RLS read failed');
  });
  it('does not accept an unregistered native Trip key', async () => {
    await expect(handle(request('/map-markers/987654321'))).rejects.toMatchObject({ code: 'unknown_view_key' });
    expect(repo.readers.trips.fetchTripById).not.toHaveBeenCalled();
  });
  it('default legacy application contributions also avoid aggregate reads', async () => {
    release();
    handle = createFamilyApplicationHandler(repo);
    expect(await handle(request(`/day-schedule/${trip}`))).toEqual({ items: [] });
    expect(legacy).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('read ownership across asynchronous application work', () => {
  it.each(['source', 'disposed', 'actor', 'layer', 'logout', 'aborted'] as const)(
    'rejects the original result after %s changes',
    async (change) => {
      let source = 'local-fixture',
        disposed = false;
      const waiting = deferred<unknown>(),
        started = deferred<void>();
      const application: FamilyHandler = async () => {
        started.resolve();
        return waiting.promise;
      };
      const wrapped = createPlannerApplicationReads(
        repo,
        application,
        () => disposed,
        () => source
      );
      const abort = new AbortController(),
        result = wrapped(request(`/trips/${trip}/packing`, 'GET', abort.signal));
      const rejected = expect(result).rejects.toMatchObject({
        name: change === 'aborted' ? 'AbortError' : expect.any(String),
      });
      await started.promise;
      if (change === 'source') source = 'other-source';
      if (change === 'disposed') disposed = true;
      if (change === 'actor') repo.acceptSession({ ...session, personId: uuid(99) });
      if (change === 'layer') repo.setLayer(trip, 'myDraft');
      if (change === 'logout') setAuthed(false);
      if (change === 'aborted') abort.abort();
      waiting.resolve({ items: ['must not escape'] });
      await rejected;
    }
  );
  it('a header read cannot resume after the original repository is cleared', async () => {
    const waiting = deferred<typeof header>(),
      started = deferred<void>();
    vi.spyOn(repo.readers.trips, 'fetchTripById').mockImplementation(async () => {
      started.resolve();
      return waiting.promise;
    });
    const result = handle(request(`/trips/${trip}/files`)),
      rejected = expect(result).rejects.toMatchObject({ code: 'stale_session' });
    await started.promise;
    repo.clear();
    waiting.resolve(header);
    await rejected;
    expect(repo.readers.files.listTripFiles).not.toHaveBeenCalled();
  });
  it('source replacement during header lookup prevents the downstream application read', async () => {
    let source = 'first';
    const waiting = deferred<typeof header>(),
      started = deferred<void>(),
      app = vi.fn(async () => ({ items: [] }));
    vi.spyOn(repo.readers.trips, 'fetchTripById').mockImplementation(async () => {
      started.resolve();
      return waiting.promise;
    });
    const wrapped = createPlannerApplicationReads(
      repo,
      app,
      () => false,
      () => source
    );
    const result = wrapped(request(`/trips/${trip}/todo`)),
      rejected = expect(result).rejects.toMatchObject({ code: 'planner_application_changed' });
    await started.promise;
    source = 'second';
    waiting.resolve(header);
    await rejected;
    expect(app).not.toHaveBeenCalled();
  });
});
