import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTrip, buildUser } from '../../../tests/helpers/factories';
import {
  canonicalPackingList,
  canonicalPackingRow,
  packingFixtureId as id,
} from '../../../tests/helpers/familyPacking';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { act, cleanup, renderHook } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { packingApi } from '../../api/client';
import { BAG_COLORS, PACKING_PLACEHOLDER_NAME } from '../../components/Packing/packingListPanel.constants';
import { usePackingExport } from '../../components/Packing/usePackingExport';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { installReadOnlySession } from '../../db/readOnlySession';
import { installPlannerPackingPort, type PackingView, type PlannerPackingPort } from '../../repo/plannerPackingPort';
import { installSavedPackingReadPort } from '../../repo/savedPackingReadPort';
import { useAddonStore } from '../../store/addonStore';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { downloadBlob } from '../../utils/fileDownload';
import { FamilyIdentityRegistry } from './identity';
import { PlannerCohortPacking } from './plannerCohortPacking';
import { projectPacking, type NativePacking } from './plannerPacking';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createSavedPackingReader } from './savedPackingReader';
vi.mock('../../utils/fileDownload', () => ({ downloadBlob: vi.fn() }));
let stop = () => {},
  stopSaved = () => {},
  readonlyStop = () => {};
let view: PackingView, native: number, port: PlannerPackingPort;
let session: FamilySession,
  source: string,
  disposed: boolean,
  repo: FamilyFrontendRepository,
  cohort: PlannerCohortPacking;
const write = vi.fn();
const download = vi.mocked(downloadBlob);
function held<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
async function text() {
  return download.mock.calls[download.mock.calls.length - 1]?.[0].text() ?? '';
}
function seed(packet = canonicalPackingList()) {
  packet.items = [
    canonicalPackingRow({ name: 'Coat <&>', owner_person_id: null, is_private: false }),
    canonicalPackingRow({
      id: id(90),
      name: 'Private diary',
      owner_person_id: packet.scope.person_id,
      is_private: true,
      bag_id: null,
    }),
  ];
  const ids = new FamilyIdentityRegistry(packet.scope.user_id);
  native = ids.register('trip', packet.scope.trip_id);
  view = { ...projectPacking(packet, ids, []), unassigned_weight_grams: 987654321 };
  // Deliberately different generic store rows: the owned snapshot is the only source.
  useTripStore.setState({ trip: buildTrip({ id: native, title: 'Original <&> Trip' }), packingItems: [] });
  return { packet, ids };
}
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  _resetNetworkMode();
  setAuthed(true);
  useAuthStore.setState({ user: buildUser({ id: 123 }), isAuthenticated: true });
  seed();
  useAddonStore.setState({ bagTracking: false });
  write.mockReset();
  vi.spyOn(packingApi, 'listBags').mockImplementation(write);
  port = {
    snapshot: () => view,
    subscribe: () => () => {},
    bind: write,
    packed: write,
    reorder: write,
    trashPage: write,
    restore: write,
    reconcile: write,
  };
  stop = installPlannerPackingPort(port);
});
afterEach(async () => {
  cleanup();
  stop();
  stopSaved();
  readonlyStop();
  stopSaved = readonlyStop = () => {};
  vi.restoreAllMocks();
  vi.clearAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
const hook = (list: 'common' | 'personal' = 'common') => renderHook(() => usePackingExport(native, list));
async function output(h: ReturnType<typeof hook>, format: string) {
  await act(async () => {
    if (format === 'csv') await h.result.current.exportCsv();
    else if (format === 'print') await h.result.current.openPrint();
    else h.result.current.exportMarkdown();
  });
  return format === 'print' ? (h.result.current.printHtml ?? '') : text();
}
describe('qualified publication, independent of write and global bag flags', () => {
  for (const offline of [false, true])
    for (const format of ['csv', 'print', 'markdown'])
      it(`${offline ? 'offline' : 'online'} ${format} reads only admitted Common rows and qualified bags`, async () => {
        setForcedOffline(offline);
        readonlyStop = installReadOnlySession();
        const body = await output(hook(), format);
        expect(body).toContain(format === 'print' ? 'Coat &lt;&amp;&gt;' : 'Coat <&>');
        if (format !== 'markdown') expect(body).toContain('Cabin bag');
        expect(body).not.toContain('Private diary');
        expect(body).not.toContain('987654321');
        expect(write).not.toHaveBeenCalled();
        expect(await offlineDb.mutationQueue.count()).toBe(0);
      });
  for (const format of ['csv', 'print', 'markdown'])
    it(`Personal ${format} never imports Common rows`, async () => {
      const body = await output(hook('personal'), format);
      expect(body).toContain('Private diary');
      expect(body).not.toContain('Coat');
    });
  it('keeps identity grouping, raw labels, order, quantity and check state without virtual rows or hidden totals', async () => {
    const packet = canonicalPackingList();
    packet.bags[0] = { ...packet.bags[0], name: 'Bag, "A" <&>', color: null };
    seed(packet);

    const a = view.items[0];
    view = {
      ...view,
      items: [
        {
          ...a,
          category: 'Same label',
          checked: 1,
          family_packing: { ...('family_packing' in a ? (a.family_packing as object) : {}), category_id: id(41) },
        } as never,
        {
          ...a,
          id: a.id + 1,
          name: 'Second',
          bag_id: null,
          category: 'Same label',
          family_packing: { ...('family_packing' in a ? (a.family_packing as object) : {}), category_id: id(42) },
        } as never,
        { ...a, id: a.id + 2, name: PACKING_PLACEHOLDER_NAME },
      ],
    };
    const h = hook();
    const md = await output(h, 'markdown');
    expect(md.match(/## Same label/g)).toHaveLength(2);
    expect(md).toContain('[x] 3 × Coat');
    expect(md).not.toContain(PACKING_PLACEHOLDER_NAME);
    const csv = await output(h, 'csv');
    expect(csv).toContain('"Bag, ""A"" <&>"');
    expect(csv).toContain(',checked');
    const html = await output(h, 'print');
    expect(html).toContain(`<i style="background:${BAG_COLORS[0]}"></i>Bag, &quot;A&quot; &lt;&amp;&gt;`);
    expect(html).not.toContain('987654321');
  });
  it('a qualified empty publication does not export generic store rows', () => {
    view = { ...view, items: [] };
    useTripStore.setState({
      packingItems: [{ ...view.bags[0], name: 'Foreign raw row', checked: 0, is_private: 0 } as never],
    });
    const h = hook();
    expect(h.result.current.hasItems).toBe(false);
    act(() => h.result.current.exportMarkdown());
    expect(download.mock.calls[0]?.[0]).toBeDefined(); // Explicit empty export is native format, with no item details.
  });
});
const retirements = [
  'trip',
  'logout',
  'relogin',
  'account',
  'port-remove',
  'port-replace',
  'publication',
  'unmount',
] as const;
for (const change of retirements)
  for (const format of ['csv', 'print', 'markdown'])
    it(`old ${format} callback refuses after ${change}`, async () => {
      const h = hook(),
        old = h.result.current;
      act(() => {
        if (change === 'trip') useTripStore.setState({ trip: buildTrip({ id: native + 1, title: 'Replacement' }) });
        if (change === 'logout') {
          setAuthed(false);
          invalidateOfflineSession();
        }
        if (change === 'relogin') {
          invalidateOfflineSession();
          setAuthed(true);
        }
        if (change === 'account') useAuthStore.setState({ user: buildUser({ id: 456 }) });
        if (change === 'port-remove' || change === 'port-replace') {
          stop();
          if (change === 'port-replace') stop = installPlannerPackingPort({ ...port });
        }
        if (change === 'publication') view = structuredClone(view);
        if (change === 'unmount') h.unmount();
      });
      await act(async () => {
        if (format === 'csv') await old.exportCsv();
        else if (format === 'print') await old.openPrint();
        else old.exportMarkdown();
      });
      expect(download).not.toHaveBeenCalled();
      expect(h.result.current.printHtml).toBeNull();
      expect(write).not.toHaveBeenCalled();
    });
for (const format of ['csv', 'print'])
  for (const reject of [false, true])
    it(`late ordinary ${format} ${reject ? 'failure' : 'success'} is fenced after Trip/session retirement`, async () => {
      stop();
      useTripStore.setState({
        packingItems: view.items.map((item) => {
          const { family_packing: _family, ...r } = item as NativePacking;
          void _family;
          return r;
        }),
      });
      useAddonStore.setState({ bagTracking: true });
      const d = held<{ bags: never[] }>();
      write.mockReturnValue(d.promise);
      const h = hook();
      let work!: Promise<void>;
      act(() => {
        work = format === 'csv' ? h.result.current.exportCsv() : h.result.current.openPrint();
      });
      expect(write).toHaveBeenCalledOnce();
      act(() => {
        invalidateOfflineSession();
        useTripStore.setState({ trip: buildTrip({ id: native + 99 }) });
      });
      await act(async () => {
        if (reject) d.reject(Error('Original lookup ended'));
        else d.resolve({ bags: [] });
        await work;
      });
      expect(download).not.toHaveBeenCalled();
      expect(h.result.current.printHtml).toBeNull();
    });
for (const change of ['trip', 'logout', 'port-remove', 'port-replace'] as const)
  it(`already-open print clears synchronously for ${change} and cannot return`, async () => {
    const h = hook();
    await output(h, 'print');
    expect(h.result.current.printHtml).toContain('Original');
    act(() => {
      if (change === 'trip') useTripStore.setState({ trip: buildTrip({ id: native + 1 }) });
      if (change === 'logout') invalidateOfflineSession();
      if (change.startsWith('port-')) {
        stop();
        if (change === 'port-replace') stop = installPlannerPackingPort({ ...port });
      }
    });
    expect(h.result.current.printHtml).toBeNull();
  });
it('retired owned port cannot fall back to raw native names even after generic rows replace it', async () => {
  const h = hook();
  act(() => {
    stop();
    useTripStore.setState({ packingItems: [{ ...view.items[0], name: 'Raw forbidden' }] });
  });
  expect(h.result.current.hasItems).toBe(false);
  await output(h, 'csv');
  expect(download).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});
it('changing Common/Personal retires old callbacks and print state', async () => {
  const h = renderHook(({ list }) => usePackingExport(native, list), {
    initialProps: { list: 'common' as 'common' | 'personal' },
  });
  await output(h, 'print');
  const old = h.result.current;
  h.rerender({ list: 'personal' });
  expect(h.result.current.printHtml).toBeNull();
  await act(async () => old.exportCsv());
  expect(download).not.toHaveBeenCalled();
});
describe('admitted saved lease, no writer or permission promotion', () => {
  for (const format of ['csv', 'print', 'markdown'])
    it(`saved ${format} keeps bag labels and personal visibility`, async () => {
      stop();
      setForcedOffline(true);
      readonlyStop = installReadOnlySession();
      const { ids } = seed();
      const reader = createSavedPackingReader({ view, categories: null, ids, check: () => {} });
      stopSaved = installSavedPackingReadPort(reader);
      const body = await output(hook(), format);
      expect(body).not.toContain('Private diary');
      if (format !== 'markdown') expect(body).toContain('Cabin bag');
      expect(write).not.toHaveBeenCalled();
    });
  for (const format of ['csv', 'print', 'markdown'])
    it(`retired saved ${format} refuses without online/raw fallback`, async () => {
      stop();
      const { ids } = seed();
      let valid = true;
      const reader = createSavedPackingReader({
        view,
        categories: null,
        ids,
        check: () => {
          if (!valid) throw Error('Lease ended');
        },
      });
      stopSaved = installSavedPackingReadPort(reader);
      const h = hook(),
        old = h.result.current;
      act(() => {
        valid = false;
        stopSaved();
      });
      await act(async () => {
        if (format === 'csv') await old.exportCsv();
        else if (format === 'print') await old.openPrint();
        else old.exportMarkdown();
      });
      expect(h.result.current.hasItems).toBe(false);
      expect(h.result.current.printHtml).toBeNull();
      expect(write).not.toHaveBeenCalled();
      expect(download).not.toHaveBeenCalled();
    });
  it('foreign saved Trip is not admitted despite generic rows', async () => {
    stop();
    const { ids } = seed();
    const reader = createSavedPackingReader({
      view,
      categories: null,
      ids,
      check: () => {
        throw Error('Foreign Trip');
      },
    });
    stopSaved = installSavedPackingReadPort(reader);
    useTripStore.setState({ packingItems: view.items });
    const h = hook();
    expect(h.result.current.hasItems).toBe(false);
    await output(h, 'csv');
    expect(download).not.toHaveBeenCalled();
  });
});
describe('actual cohort owns Family, Person, layer, source and disposal', () => {
  beforeEach(async () => {
    stop();
    const { packet } = seed();
    const s = packet.scope;
    source = 'http://127.0.0.1:56041';
    disposed = false;
    session = {
      userId: s.user_id,
      familyId: s.family_id,
      personId: s.person_id,
      user: { username: 'Read-only', email: 'read@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
    };
    repo = new FamilyFrontendRepository(
      async () => session,
      undefined,
      () => ({ userId: session.userId, familyId: session.familyId, personId: session.personId, source })
    );
    await repo.session();
    const ids = (await repo.views()).ids;
    native = ids.register('trip', s.trip_id);
    useTripStore.setState({ trip: buildTrip({ id: native, title: 'Cohort original' }) });
    cohort = new PlannerCohortPacking(repo, { source: () => source, disposed: () => disposed, allowed: () => false });
    cohort.publish(packet, projectPacking(packet, ids, []));
    stop = installPlannerPackingPort(cohort);
  });
  for (const change of ['family', 'person', 'source', 'layer', 'disposed'] as const)
    for (const format of ['csv', 'print', 'markdown'])
      it(`${change} replacement retires ${format} without replacement authority`, async () => {
        const h = hook(),
          old = h.result.current;
        act(() => {
          if (change === 'family') session = { ...session, familyId: id(81) };
          if (change === 'person') session = { ...session, personId: id(82) };
          if (change === 'source') source = 'http://127.0.0.1:56099';
          if (change === 'layer') repo.setLayer(id(1), 'myDraft');
          if (change === 'disposed') disposed = true;
        });
        await act(async () => {
          if (format === 'csv') await old.exportCsv();
          else if (format === 'print') await old.openPrint();
          else old.exportMarkdown();
        });
        expect(download).not.toHaveBeenCalled();
        expect(h.result.current.printHtml).toBeNull();
        expect(write).not.toHaveBeenCalled();
      });
});

for (const format of ['csv', 'print'] as const)
  it(`in-flight qualified ${format} cannot finish after logout`, async () => {
    const h = hook();
    let work!: Promise<void>;
    act(() => {
      work = format === 'csv' ? h.result.current.exportCsv() : h.result.current.openPrint();
      invalidateOfflineSession();
    });
    await act(async () => {
      await work;
    });
    expect(download).not.toHaveBeenCalled();
    expect(h.result.current.printHtml).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });
it('closing print cancels a pending ordinary optional bag lookup', async () => {
  stop();
  useTripStore.setState({
    packingItems: view.items.map((item) => {
      const { family_packing: _family, ...row } = item as NativePacking;
      void _family;
      return row;
    }),
  });
  useAddonStore.setState({ bagTracking: true });
  const d = held<{ bags: never[] }>();
  write.mockReturnValue(d.promise);
  const h = hook();
  let work!: Promise<void>;
  act(() => {
    work = h.result.current.openPrint();
    h.result.current.closePrint();
  });
  await act(async () => {
    d.resolve({ bags: [] });
    await work;
  });
  expect(h.result.current.printHtml).toBeNull();
});
it('retiring a saved lease clears an already-open print without a writer', async () => {
  stop();
  const { ids } = seed();
  stopSaved = installSavedPackingReadPort(createSavedPackingReader({ view, categories: null, ids, check: () => {} }));
  const h = hook();
  await output(h, 'print');
  expect(h.result.current.printHtml).toContain('Cabin bag');
  act(() => stopSaved());
  expect(h.result.current.printHtml).toBeNull();
  expect(write).not.toHaveBeenCalled();
});

it('reinstalling the identical live port cannot revive an old export callback', async () => {
  const h = hook(),
    old = h.result.current;
  act(() => {
    stop();
    stop = installPlannerPackingPort(port);
  });
  await act(async () => old.exportCsv());
  expect(download).not.toHaveBeenCalled();
  await output(h, 'csv');
  expect(download).toHaveBeenCalledOnce();
});
it('reinstalling the identical saved reader cannot revive an old export callback', async () => {
  stop();
  const { ids } = seed();
  const reader = createSavedPackingReader({ view, categories: null, ids, check: () => {} });
  stopSaved = installSavedPackingReadPort(reader);
  const h = hook(),
    old = h.result.current;
  act(() => {
    stopSaved();
    stopSaved = installSavedPackingReadPort(reader);
  });
  await act(async () => old.exportCsv());
  expect(download).not.toHaveBeenCalled();
  await output(h, 'csv');
  expect(download).toHaveBeenCalledOnce();
});
