import { useEffect, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  days,
  family,
  header,
  session as sampleSession,
  trip,
  uuid,
  view,
} from '../../../tests/browser/planner-native/demo.mjs';
import { canonicalPackingList } from '../../../tests/helpers/familyPacking';
import { canonicalPackingAck } from '../../../tests/helpers/familyPackingCommands';
import { canonicalTask } from '../../../tests/helpers/familyTasks';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { useCanDo } from '../../store/permissionsStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode } from '../../sync/networkMode';
import { captureWriteSession } from '../../sync/writeSession';
import { FamilyTripBoundary } from './FamilyTripBoundary';
import { createFamilyApplicationHandler } from './applicationHandler';
import { useFamilyController } from './controllerContext';
import { FamilyNavigationBoundary } from './navigation';
import { packingCommand } from './packingCommandContract';
import type { PackingList } from './packingContract';
import { loadFamilyPlanExport } from './planExport';
import { currentPlannerBoundaryOwner } from './plannerBoundaryOwner';
import { plannerCacheDb } from './plannerCache';
import { createFamilyPlannerCohort } from './plannerCohort';
import { useFamilyPlannerController } from './plannerControllerContext';
import { readKey, useFamilyReadState } from './readState';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import type { TaskEnvelope } from './taskCommandHandler';
import { retainTaskIntent } from './taskIntentQueue';
import { createFamilyAxiosAdapter, type FamilyHandler } from './transport';
import { familyCanDo, familyReservationEditable, useFamilyUiPermissions } from './uiPermissions';

const sdk = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn<(table: string) => unknown>(() => {
    throw new Error('Unqualified database read');
  }),
}));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => 'https://fixture.supabase.invalid' }));
vi.mock('./runtime', () => ({ isFamilyFrontendActive: () => true }));
type CompanionQuery = {
  table: string;
  columns?: string;
  count?: unknown;
  filters: unknown[][];
  order: string[];
  range?: number[];
};
const companionQueries: CompanionQuery[] = [];
const companionColumns: Record<string, string> = {
  trip_expenses:
    'id,trip_id,name,category,total_amount,currency_code,exchange_rate,expense_date,note,ticket_lines,reservation_id,sort_order,created_at',
  trip_files:
    'id,trip_id,storage_path,original_name,mime_type,size_bytes,uploaded_by,starred,description,deleted_at,created_at',
  trip_file_links: 'id,trip_id,file_id,place_id,reservation_id,trip_day_id',
  trip_travelers: 'person_id,people(display_name,color)',
  family_place_categories: 'id,family_id,name,color_hex,icon_key,sort_order',
};
function countedCompanionQuery(table: string) {
  if (!(table in companionColumns)) throw new Error('Legacy/unqualified table read');
  const trace: CompanionQuery = { table, filters: [], order: [] };
  companionQueries.push(trace);
  const query = {
    select(columns: string, options: { count: unknown }) {
      trace.columns = columns;
      trace.count = options.count;
      return query;
    },
    eq(column: string, value: string) {
      trace.filters.push(['eq', column, value]);
      return query;
    },
    order(column: string) {
      trace.order.push(column);
      return query;
    },
    is(column: string, value: unknown) {
      trace.filters.push(['is', column, value]);
      return query;
    },
    not(column: string, operator: string, value: unknown) {
      trace.filters.push(['not', column, operator, value]);
      return query;
    },
    range(from: number, to: number) {
      trace.range = [from, to];
      return Promise.resolve({ data: [], count: 0, error: null });
    },
  };
  return query;
}
function expectOnlyCountedCompanionReads() {
  // D15 adds canonical completeness queries; legacy controller/ordinary unbounded table reads remain forbidden.
  expect(sdk.from.mock.calls.map(([table]) => table).sort()).toEqual(Object.keys(companionColumns).sort());
  expect(companionQueries).toHaveLength(5);
  for (const q of companionQueries) {
    expect(q.columns).toBe(companionColumns[q.table]);
    expect(q.count).toBe('exact');
    expect(q.range).toEqual([0, 99]);
    expect(q.order).toEqual([q.table === 'trip_travelers' ? 'person_id' : 'id']);
    const filters: unknown[][] = [
      [
        'eq',
        q.table === 'family_place_categories' ? 'family_id' : 'trip_id',
        q.table === 'family_place_categories' ? family : trip,
      ],
    ];
    if (q.table === 'trip_files') filters.push(['is', 'deleted_at', null]);
    if (q.table === 'trip_travelers') filters.push(['not', 'person_id', 'is', null]);
    expect(q.filters).toEqual(filters);
  }
}
let repo: FamilyFrontendRepository, cohort: ReturnType<typeof createFamilyPlannerCohort>, release: () => void;
let session: FamilySession, source: string, outcomes: Record<string, 'direct' | 'propose' | 'deny'>, canMutate: boolean;
let hold: Promise<void> | null, resume: () => void, refuse: boolean;
let actualFileRoute: FamilyHandler | null;
const adapter = api.defaults.adapter;
function deferred() {
  hold = new Promise<void>((resolve) => {
    resume = resolve;
  });
}
function getPermission() {
  return useFamilyUiPermissions.getState().controller;
}
function Probe() {
  const [loadError, setLoadError] = useState<string | null>(null);
  const { id } = useParams(),
    can = useCanDo(),
    navigate = useNavigate();
  const controller = useFamilyPlannerController(),
    old = useFamilyController();
  const selected = useTripStore((s) => s.selectedDayId);
  useEffect(() => {
    if (id)
      void useTripStore
        .getState()
        .loadTrip(id)
        .catch((error) => setLoadError(String(error)));
  }, [id]);
  return (
    <>
      <output data-testid="native-id">{id}</output>
      <output data-testid="canonical-id">{controller?.publication?.trip}</output>
      <output data-testid="load-error">{loadError}</output>
      <output data-testid="legacy">{String(Boolean(old))}</output>
      <output data-testid="day">{selected}</output>
      <output data-testid="layer">{controller?.gov.layer}</output>
      <button disabled={!can('place_edit')} onClick={() => {}}>
        Edit location
      </button>
      <button onClick={() => controller?.gov.setLayer('myDraft')}>My draft</button>
      <button
        onClick={() => {
          void navigate(`/trips/${uuid(99)}`);
        }}
      >
        Other trip
      </button>
    </>
  );
}
function open() {
  return render(
    <FamilyNavigationBoundary repository={repo}>
      <Routes>
        <Route
          path="/trips/:id"
          element={
            <FamilyTripBoundary>
              <Probe />
            </FamilyTripBoundary>
          }
        />
      </Routes>
    </FamilyNavigationBoundary>,
    { initialEntries: [`/trips/${trip}`] }
  );
}
async function ready() {
  await waitFor(() => expect(screen.getByTestId('canonical-id')).toHaveTextContent(trip));
}
async function permitted() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit location' })).toBeEnabled());
}
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  await plannerCacheDb.snapshots.clear();
  _resetNetworkMode();
  setAuthed(true);
  mutationQueue._resetFlushing();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  session = structuredClone(sampleSession);
  source = 'https://fixture.supabase.invalid';
  outcomes = { 'trip.places.manage': 'direct', 'trip.reservations.manage': 'direct' };
  canMutate = true;
  hold = null;
  resume = () => {};
  refuse = false;
  actualFileRoute = null;
  repo = new FamilyFrontendRepository(async () => session);
  await repo.session();
  vi.spyOn(repo.readers.trips, 'fetchTripById').mockResolvedValue({ ...header, status: 'planned' });
  vi.spyOn(repo, 'categories').mockResolvedValue({ categories: [] });
  vi.spyOn(repo, 'core').mockRejectedValue(new Error('Legacy core must not run'));
  sdk.from.mockClear();
  companionQueries.length = 0;
  sdk.from.mockImplementation(countedCompanionQuery);
  sdk.rpc.mockReset();
  sdk.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_family_trip_planner_view_v1') {
      const result = view(String(args.p_layer));
      result.scope = { ...result.scope, person_id: session.personId, user_id: session.userId };
      result.state.locations.forEach((l) => {
        l.cover_media_id = null;
      });
      return { data: result, error: null };
    }
    if (name === 'get_family_trip_packing_v1')
      return {
        data: canonicalPackingList(
          { trip_id: trip, family_id: family, user_id: session.userId, person_id: session.personId },
          true
        ),
        error: null,
      };
    if (name === 'get_family_trip_tasks_v1')
      return {
        data: {
          version: 1,
          scope: {
            version: 1,
            trip_id: trip,
            family_id: family,
            user_id: session.userId,
            person_id: session.personId,
            layer: 'published',
            trip_lifecycle_revision: 0,
          },
          collection_revision: 0,
          tasks: [],
          trash_count: 0,
        },
        error: null,
      };
    if (name === 'get_family_trip_booking_view_v1')
      return {
        data: {
          version: 1,
          trip_id: trip,
          family_id: family,
          user_id: session.userId,
          person_id: session.personId,
          trip_revision: 1,
          days: days.map((d) => ({
            id: d.id,
            revision: 1,
            civil_day: d.civil_day,
            day_index: d.day_index,
            title: d.title,
          })),
          bookings: [],
        },
        error: null,
      };
    if (name === 'get_family_plan_governance_v1') {
      const data = {
        version: 1,
        scope: {
          version: 1,
          trip_id: trip,
          family_id: family,
          user_id: session.userId,
          person_id: session.personId,
          layer: args.p_layer,
        },
        permissions: { can_mutate: canMutate, can_draft: true, outcomes: structuredClone(outcomes) },
        draft: null,
        requests: [],
      };
      if (hold !== null) await hold;
      return refuse ? { data: null, error: { code: '42501' } } : { data, error: null };
    }
    throw new Error('Unexpected RPC ' + name);
  });
  cohort = createFamilyPlannerCohort(repo, {
    source: () => source,
    reportError: () => {},
    application: async (r) => {
      if (r.pathname.endsWith('/family/governance')) {
        const result = await sdk.rpc('get_family_plan_governance_v1', {
          p_trip_id: trip,
          p_layer: repo.getLayer(trip),
        });
        if (result.error) throw new Error('Governance denied');
        return result.data;
      }
      if (r.method === 'GET' && /\/(packing|todo|budget)$/.test(r.pathname)) return { items: [] };
      if (r.pathname.endsWith('/files')) return actualFileRoute ? actualFileRoute(r) : { files: [] };
      if (r.pathname.endsWith('/members')) return { members: [] };
      if (r.pathname === '/tags') return { tags: [] };
      throw new Error('Unexpected boundary HTTP ' + r.pathname);
    },
  });
  release = cohort.install();
  api.defaults.adapter = createFamilyAxiosAdapter(cohort.handle);
});
afterEach(async () => {
  resume();
  cleanup();
  release();
  api.defaults.adapter = adapter;
  setAuthed(false);
  _resetNetworkMode();
  useFamilyUiPermissions.setState({ controller: null });
  vi.restoreAllMocks();
});

describe('P04at real Family boundary ownership and permissions', () => {
  it('mounts the native UUID parameter bridge without the legacy controller or reads', async () => {
    open();
    await ready();
    await permitted();
    expect(screen.getByTestId('native-id')).toHaveTextContent(String((await repo.views()).ids.register('trip', trip)));
    expect(screen.getByTestId('legacy')).toHaveTextContent('false');
    expect(() => loadFamilyPlanExport(trip)).toThrow('published plan is not ready');
    expect(repo.core).not.toHaveBeenCalled();
    expectOnlyCountedCompanionReads();
  });
  it('does not grant permissions until the original governance read completes', async () => {
    deferred();
    open();
    await ready();
    expect(screen.getByRole('button', { name: 'Edit location' })).toBeDisabled();
    await act(async () => {
      resume();
    });
    await permitted();
  });
  it('denies after a refused governance read without falling back to legacy authority', async () => {
    refuse = true;
    open();
    await ready();
    await waitFor(() => expect(getPermission()?.gov.governanceError).toContain('Governance denied'));
    expect(familyCanDo('place_edit', getPermission())).toBe(false);
    expect(repo.core).not.toHaveBeenCalled();
  });
  it.each(['deny', 'propose'] as const)('preserves the published %s capability outcome', async (outcome) => {
    outcomes['trip.places.manage'] = outcome;
    canMutate = false;
    open();
    await ready();
    await waitFor(() => expect(getPermission()?.gov.mutateGateError).toBe(false));
    expect(screen.getByRole('button', { name: 'Edit location' })).toBeDisabled();
  });
  it('published propose becomes editable only after a checked private-layer reload', async () => {
    outcomes['trip.places.manage'] = 'propose';
    canMutate = false;
    open();
    await ready();
    await waitFor(() => expect(getPermission()?.gov.mutateGateError).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'My draft' }));
    await permitted();
    expect(screen.getByTestId('layer')).toHaveTextContent('myDraft');
    expect(repo.getLayer(trip)).toBe('myDraft');
  });
  it('keeps deny denied in the private layer', async () => {
    outcomes['trip.places.manage'] = 'deny';
    open();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'My draft' }));
    await waitFor(() => expect(getPermission()?.gov.layer).toBe('myDraft'));
    expect(familyCanDo('place_edit', getPermission())).toBe(false);
  });
  it('a new checked publication cannot reuse older governance while its replacement is pending', async () => {
    open();
    await ready();
    await permitted();
    outcomes['trip.places.manage'] = 'deny';
    deferred();
    await act(async () => {
      await cohort.refreshPlanner(trip);
    });
    expect(screen.getByRole('button', { name: 'Edit location' })).toBeDisabled();
    await act(async () => {
      resume();
    });
    await waitFor(() => expect(getPermission()?.gov.mutateGateError).toBe(false));
    expect(familyCanDo('place_edit', getPermission())).toBe(false);
  });
  it('pausing a publication denies a retained permission callback synchronously', async () => {
    open();
    await ready();
    await permitted();
    const original = getPermission();
    act(() => {
      currentPlannerBoundaryOwner()?.pause();
      expect(familyCanDo('place_edit', original)).toBe(false);
    });
  });
  it('a source change invalidates retained permissions for places and editable reservations', async () => {
    open();
    await ready();
    await permitted();
    const original = getPermission();
    expect(familyCanDo('place_edit', original)).toBe(true);
    expect(familyReservationEditable({ type: 'hotel' })).toBe(true);
    expect(familyReservationEditable({ type: 'flight' })).toBe(false);
    source = 'https://another-fixture.supabase.invalid';
    expect(familyCanDo('place_edit', original)).toBe(false);
    expect(familyReservationEditable({ type: 'hotel' })).toBe(false);
    expect(familyReservationEditable({ type: 'flight' })).toBe(false);
  });
  it('logout/session retirement invalidates retained permission callbacks before rerender', async () => {
    open();
    await ready();
    await permitted();
    const original = getPermission();
    invalidateOfflineSession();
    expect(familyCanDo('place_edit', original)).toBe(false);
  });
  it('retiring the cohort never mounts the legacy controller in the same boundary', async () => {
    open();
    await ready();
    await permitted();
    act(() => release());
    expect(await screen.findByRole('alert')).toHaveTextContent('planner session ended');
    expect(repo.core).not.toHaveBeenCalled();
    expectOnlyCountedCompanionReads();
  });
  it('changing route cannot reuse the previous Trip permission state', async () => {
    open();
    await ready();
    await permitted();
    fireEvent.click(screen.getByRole('button', { name: 'Other trip' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit location' })).toBeDisabled());
    expect(getPermission()?.isCurrent?.()).toBe(false);
  });
  it('native day selection uses the installed registry and does not invalidate checked authority', async () => {
    open();
    await ready();
    await permitted();
    const key = (await repo.views()).ids.register('day', days[3].id);
    act(() => useTripStore.setState({ selectedDayId: key }));
    expect(screen.getByTestId('day')).toHaveTextContent(String(key));
    expect(familyCanDo('place_edit', getPermission())).toBe(true);
  });
  it('a canonical refresh held by parked work revokes authority and preserves the exact row', async () => {
    open();
    await ready();
    await permitted();
    const row = {
      id: 'held-original',
      tripId: Number(screen.getByTestId('native-id').textContent),
      method: 'POST' as const,
      url: `/trips/${trip}/family/planner-editor-command`,
      body: { opaque: 'retain me' },
      status: 'conflict' as const,
      schemaVersion: 999,
      attempts: 2,
      createdAt: 4,
      lastError: 'Keep original',
    };
    await offlineDb.mutationQueue.add(row);
    await act(async () => {
      await expect(cohort.refreshPlanner(trip)).rejects.toThrow('held');
    });
    expect(await offlineDb.mutationQueue.toArray()).toEqual([row]);
    expect(familyCanDo('place_edit', getPermission())).toBe(false);
  });
});

const unavailableControls = [
  ['budget_edit', 'trip.costs.manage'],
  ['file_upload', 'trip.files.upload'],
  ['file_edit', 'trip.files.metadata'],
  ['file_delete', 'trip.files.trash'],
  ['trip_edit', 'trip.metadata.edit'],
  ['trip_title_edit', 'trip.metadata.edit'],
  ['trip_dates_edit', 'trip.metadata.edit'],
  ['trip_delete', 'trip.archive'],
] as const;
describe('real installed boundary separates command availability from a Family grant', () => {
  it('advertises qualified packing item controls only for current direct authority', async () => {
    canMutate = true;
    outcomes['trip.packing.manage'] = 'direct';
    open();
    await ready();
    await permitted();
    const controller = getPermission();
    expect(controller?.gov.actionOutcomes['trip.packing.manage']).toBe('direct');
    expect(controller?.supportsAction?.('packing_edit')).toBe(true);
    expect(familyCanDo('packing_edit', controller)).toBe(true);
    if (!controller) throw new Error('Missing checked permission controller');
    for (const outcome of ['deny', 'propose'] as const) {
      expect(
        familyCanDo('packing_edit', {
          ...controller,
          gov: {
            ...controller.gov,
            actionOutcomes: { ...controller.gov.actionOutcomes, 'trip.packing.manage': outcome },
          },
        })
      ).toBe(false);
    }
    expect(familyCanDo('packing_edit', { ...controller, isCurrent: () => false })).toBe(false);
    expect(repo.core).not.toHaveBeenCalled();
  });

  it('advertises the installed task writer only for direct task permission, independent from packing', async () => {
    canMutate = true;
    outcomes['trip.todos.manage'] = 'direct';
    outcomes['trip.packing.manage'] = 'deny';
    open();
    await ready();
    await permitted();
    expect(getPermission()?.supportsAction?.('todo_edit')).toBe(true);
    expect(familyCanDo('todo_edit', getPermission())).toBe(true);
    expect(familyCanDo('packing_edit', getPermission())).toBe(false);
  });

  it.each(unavailableControls)(
    'does not advertise unqualified %s writes even to an authorized direct editor',
    async (action, capability) => {
      canMutate = true;
      outcomes[capability] = 'direct';
      open();
      await ready();
      await permitted();
      const controller = getPermission();
      expect(controller?.gov.actionOutcomes[capability]).toBe('direct');
      expect(controller?.supportsAction?.(action)).toBe(false);
      expect(familyCanDo(action, controller)).toBe(false);
      expect(familyCanDo('place_edit', controller)).toBe(true);
      expect(repo.core).not.toHaveBeenCalled();
    }
  );
  it('a checked My Draft reload cannot activate unavailable ancillary saves', async () => {
    outcomes['trip.costs.manage'] = 'propose';
    outcomes['trip.places.manage'] = 'propose';
    canMutate = false;
    open();
    await ready();
    await waitFor(() => expect(getPermission()?.gov.mutateGateError).toBe(false));
    await act(async () => {
      await getPermission()?.gov.setLayer('myDraft');
    });
    await waitFor(() => expect(getPermission()?.gov.layer).toBe('myDraft'));
    await permitted();
    expect(getPermission()?.gov.writeModeFor('trip.costs.manage')).toBe('draft');
    expect(familyCanDo('budget_edit', getPermission())).toBe(false);
    expect(familyCanDo('place_edit', getPermission())).toBe(true);
  });
});

describe('P04az visible startup failure and Retry', () => {
  it('shows a real task-read failure above the native loading surface and Retry loads the Trip', async () => {
    const original = sdk.rpc.getMockImplementation();
    if (!original) throw new Error('Missing SDK fixture');
    let denyTasks = true;
    sdk.rpc.mockImplementation(async (name, args) =>
      name === 'get_family_trip_tasks_v1' && denyTasks ? { data: null, error: { code: '42501' } } : original(name, args)
    );
    useTripStore.getState().resetTrip();
    open();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/not authorized/);
    expect(screen.getByTestId('canonical-id')).toBeInTheDocument(); // Native child remains mounted.
    expect(screen.getByRole('button', { name: /Try again|trip.load.retry/ })).toBeEnabled();
    denyTasks = false;
    fireEvent.click(screen.getByRole('button', { name: /Try again|trip.load.retry/ }));
    await ready();
    await permitted();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(sdk.rpc.mock.calls.some(([name]) => String(name).startsWith('execute_'))).toBe(false);
  });
  it('a failed reconnect keeps the loaded Trip visible, disables writes and offers Retry', async () => {
    open();
    await ready();
    await permitted();
    const before = useTripStore.getState().trip;
    const original = sdk.rpc.getMockImplementation();
    if (!original) throw new Error('Missing SDK fixture');
    let denyTasks = true;
    sdk.rpc.mockImplementation(async (name, args) =>
      name === 'get_family_trip_tasks_v1' && denyTasks ? { data: null, error: { code: '42501' } } : original(name, args)
    );
    await act(async () => {
      await expect(useTripStore.getState().hydrateActiveTrip(trip)).rejects.toThrow();
    });
    expect(useTripStore.getState().trip).toBe(before);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not authorized/);
    expect(screen.getByRole('button', { name: 'Edit location' })).toBeDisabled();
    denyTasks = false;
    fireEvent.click(screen.getByRole('button', { name: /Try again|trip.load.retry/ }));
    await ready();
    await permitted();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

describe('Family trip file read and Retry', () => {
  function fileReads() {
    actualFileRoute = createFamilyApplicationHandler(repo);
    return vi.spyOn(repo.readers.files, 'listTripFiles').mockResolvedValue([]);
  }

  it('publishes an empty files list from one successful read without an alert', async () => {
    const readFiles = fileReads();
    open();
    await ready();
    await permitted();

    expect(useTripStore.getState().files).toEqual([]);
    expect(useFamilyReadState.getState().reads[readKey(trip, 'files')]?.phase).toBe('ready');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(readFiles).toHaveBeenCalledExactlyOnceWith(trip, { trash: false });

    readFiles.mockClear();
    await act(async () => {
      const response = await api.get(`/trips/${trip}/files?trash=true`);
      expect(response.data).toEqual({ files: [] });
    });
    expect(readFiles).toHaveBeenCalledExactlyOnceWith(trip, { trash: true });
  });

  it('keeps the last valid files on failure and retries the current trip from one alert', async () => {
    const file = {
      id: uuid(9200),
      tripId: trip,
      storagePath: `${family}/${trip}/receipt.pdf`,
      originalName: 'Train receipt.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 14,
      uploadedBy: session.personId,
      starred: false,
      description: null,
      deletedAt: null,
      createdAt: '2027-04-01T12:00:00Z',
      links: [],
    };
    const readFiles = fileReads().mockResolvedValue([file]);
    open();
    await ready();
    await permitted();
    const store = useTripStore.getState();
    expect(store.files.map((item) => item.original_name)).toEqual(['Train receipt.pdf']);

    readFiles.mockClear().mockRejectedValue(new Error('Trip files temporarily unavailable'));
    await act(async () => {
      await store.loadFiles(trip);
    });

    expect(useTripStore.getState().trip?.id).toBe(store.trip?.id);
    expect(useTripStore.getState().files).toBe(store.files);
    expect(readFiles).toHaveBeenCalledExactlyOnceWith(trip, { trash: false });
    expect(useFamilyReadState.getState().reads[readKey(trip, 'files')]?.phase).toBe('error');
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Trip files temporarily unavailable');
    expect(screen.getByRole('button', { name: 'Edit location' })).toBeDisabled();

    readFiles.mockClear().mockResolvedValue([{ ...file, originalName: 'Refreshed receipt.pdf' }]);
    fireEvent.click(within(alerts[0]).getByRole('button', { name: /Try again|trip.load.retry/ }));
    await permitted();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(useTripStore.getState().trip?.id).toBe(store.trip?.id);
    expect(useTripStore.getState().files.map((item) => item.original_name)).toEqual(['Refreshed receipt.pdf']);
    expect(readFiles).toHaveBeenCalledExactlyOnceWith(trip, { trash: false });
  });

  it('keeps the file-specific alert and its Retry for an independent files read', async () => {
    const readFiles = fileReads();
    open();
    await ready();
    await permitted();
    readFiles.mockClear().mockRejectedValue(new Error('Independent files read failed'));
    await act(async () => {
      await expect(api.get(`/trips/${trip}/files`)).rejects.toThrow('Independent files read failed');
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load files. Independent files read failed');
    expect(screen.getByRole('button', { name: 'Edit location' })).toBeEnabled();
    expect(readFiles).toHaveBeenCalledExactlyOnceWith(trip, { trash: false });

    readFiles.mockClear().mockResolvedValue([]);
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await permitted();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(useFamilyReadState.getState().reads[readKey(trip, 'files')]?.phase).toBe('ready');
    expect(readFiles).toHaveBeenCalledExactlyOnceWith(trip, { trash: false });
  });
});

describe('U03-D11 actual cohort cold-entry recovery contract', () => {
  it('exposes original task recovery at the blocked read and publishes fresh canonical state only after confirmation', async () => {
    const ids = (await repo.views()).ids;
    const scope = {
      version: 1 as const,
      trip_id: trip,
      family_id: family,
      user_id: session.userId,
      person_id: session.personId,
      layer: 'published' as const,
      trip_lifecycle_revision: 0,
    };
    const packet = {
      version: 1,
      source_url: source,
      view_layer: 'published',
      command: {
        version: 1,
        scope,
        operation_id: uuid(860),
        action: 'create',
        target_id: uuid(861),
        expected_revision: null,
        expected_collection_revision: null,
        values: { name: 'Original cold native task' },
      },
    } satisfies TaskEnvelope;
    await retainTaskIntent(captureWriteSession(), packet as TaskEnvelope, ids.register('trip', trip));
    useTripStore.getState().resetTrip();
    const dispatch = sdk.rpc.getMockImplementation();
    if (!dispatch) throw Error('Missing fixture');
    let committed = false;
    sdk.rpc.mockImplementation(async (name, args) => {
      if (name === 'get_family_trip_task_receipt_v1')
        return {
          data: {
            version: 1,
            scope,
            trip_id: trip,
            operation_id: packet.command.operation_id,
            status: 'unknown',
            result: null,
          },
          error: null,
        };
      if (name === 'execute_family_trip_task_v1') {
        committed = true;
        return {
          data: {
            version: 1,
            scope,
            trip_id: trip,
            operation_id: packet.command.operation_id,
            action: 'create',
            target_id: packet.command.target_id,
            collection_revision: 1,
            task: canonicalTask({
              id: packet.command.target_id,
              trip_id: trip,
              name: 'Original cold native task',
              revision: 1,
            }),
            ordered_ids: null,
          },
          error: null,
        };
      }
      if (name === 'get_family_trip_tasks_v1' && committed)
        return {
          data: {
            version: 1,
            scope,
            collection_revision: 2,
            trash_count: 0,
            tasks: [
              canonicalTask({
                id: packet.command.target_id,
                trip_id: trip,
                name: 'Current canonical task after original acknowledgement',
                revision: 2,
              }),
            ],
          },
          error: null,
        };
      return dispatch(name, args);
    });
    open();
    const button = await screen.findByRole('button', { name: 'Check retained task save' });
    expect(useTripStore.getState().trip).toBeNull();
    expect(sdk.rpc.mock.calls.some(([name]) => name === 'get_family_trip_tasks_v1')).toBe(false);
    fireEvent.click(button);
    await screen.findByText(/original save is still unresolved/);
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry original task save' }));
    await ready();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(useTripStore.getState().todoItems[0].name).toBe('Current canonical task after original acknowledgement');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

it('U03-D11 repeated blocked read Retry remains available without clearing unknown work', async () => {
  const native = (await repo.views()).ids.register('trip', trip);
  const row = {
    id: uuid(899),
    tripId: native,
    method: 'POST' as const,
    url: '/trips/' + trip + '/family/future',
    body: { future: 'preserve' },
    createdAt: 1,
    schemaVersion: 99,
    retentionPolicy: 'family-original-v1' as const,
    status: 'pending' as const,
    attempts: 0,
    lastError: null,
  };
  await offlineDb.mutationQueue.add(row);
  useTripStore.getState().resetTrip();
  open();
  await screen.findByText(/This work cannot be retried here/);
  const before = currentPlannerBoundaryOwner()?.getProblem();
  fireEvent.click(screen.getByRole('button', { name: /Try again|trip.load.retry/ }));
  await waitFor(() => expect(currentPlannerBoundaryOwner()?.getProblem()).not.toBe(before));
  await screen.findByText(/This work cannot be retried here/);
  expect(screen.getByRole('button', { name: /Try again|trip.load.retry/ })).toBeEnabled();
  expect(await offlineDb.mutationQueue.toArray()).toEqual([row]);
});

it('a completed packing original revalidates a paused real boundary after releasing its queue lease', async () => {
  outcomes['trip.packing.manage'] = 'direct';
  let state: PackingList | null = null;
  const original = sdk.rpc.getMockImplementation();
  if (!original) throw new Error('Missing service fixture');
  sdk.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_family_trip_packing_v1' && state) return { data: structuredClone(state), error: null };
    if (name !== 'execute_family_trip_packing_v1') return original(name, args);
    const command = packingCommand.parse({
      version: 1,
      scope: args.p_scope,
      operation_id: args.p_operation_id,
      action: args.p_action,
      target_id: args.p_target_id,
      expected_revision: args.p_expected_revision,
      expected_collection_revision: args.p_expected_collection_revision,
      values: args.p_values,
    });
    const ack = canonicalPackingAck(command);
    if (!ack.item) throw new Error('Expected a created item');
    state = {
      ...canonicalPackingList(command.scope, true),
      collection_revision: ack.collection_revision,
      items: [ack.item],
    };
    currentPlannerBoundaryOwner()?.pause();
    expect(familyCanDo('packing_edit', getPermission())).toBe(false);
    return { data: ack, error: null };
  });
  open();
  await ready();
  await permitted();
  await act(async () => {
    await cohort.packingWrites.bind(null, trip).save({ name: 'Survives paused refresh' });
  });
  await waitFor(() => expect(familyCanDo('packing_edit', getPermission())).toBe(true));
  expect(useTripStore.getState().packingItems.map((item) => item.name)).toEqual(['Survives paused refresh']);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
  expect(sdk.rpc.mock.calls.filter(([name]) => name === 'execute_family_trip_packing_v1')).toHaveLength(1);
});

it('a warm canonical reload preserves an opened packing original without rebasing it', async () => {
  outcomes['trip.packing.manage'] = 'direct';
  open();
  await ready();
  await permitted();
  const origin = cohort.packingWrites.bind(null, trip);
  expect(origin.current()).toBe(true);
  await act(async () => {
    await cohort.loadTrip(trip);
  });
  await permitted();
  expect(origin.current()).toBe(true);
  source = 'https://retired.invalid';
  expect(origin.current()).toBe(false);
});
