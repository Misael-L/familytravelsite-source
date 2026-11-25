import { act, cleanup, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { http, HttpResponse } from 'msw';
import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDay, buildPlace, buildTrip, buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import api, { healthApi, reservationsApi } from '../../api/client';
import { deleteImportFiles, getImportFiles, offlineDb, reopenAnonymous, saveImportFiles } from '../../db/offlineDb';
import type { Translate } from '../../pages/tripPlanner/plannerTypes';
import { useBookingEdits } from '../../pages/tripPlanner/useBookingEdits';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { waitForLogout } from '../../sync/logoutCoordinator';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { tripSyncManager } from '../../sync/tripSyncManager';
import * as runtime from './runtime';

vi.mock('../../sync/syncTriggers', () => ({ registerSyncTriggers: vi.fn(), unregisterSyncTriggers: vi.fn() }));
vi.mock('../../push/webPush', () => ({
  forgetPushDeviceOnLogout: vi.fn(async () => {}),
  resyncPushSubscription: vi.fn(async () => {}),
}));
const originalAdapter = api.defaults.adapter;
const A = buildUser({ id: 1201, email: 'stay-original@fixture.invalid' }),
  B = buildUser({ id: 1202, email: 'stay-replacement@fixture.invalid' });
const trip = buildTrip({ id: 101 }),
  otherTrip = buildTrip({ id: 102 });
const place = buildPlace({
  id: 301,
  trip_id: 101,
  name: 'Original hotel',
  image_url: '/storage/v1/object/public/catalog/variants/v1/original/thumb-fixture.webp',
});
const day = buildDay({ id: 70, trip_id: 101, day_number: 1 }),
  departure = buildDay({ id: 71, trip_id: 101, day_number: 2 });
const releases: (() => void)[] = [],
  pending: Promise<unknown>[] = [],
  disposers: (() => void)[] = [];
function deferred<T>(fallback: T) {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  releases.push(() => resolve(fallback));
  return { promise, resolve };
}
function observe(promise: Promise<unknown>) {
  const result = promise.catch((error) => error);
  pending.push(result);
  return result;
}
async function login(user = A) {
  const automatic = vi
    .spyOn(tripSyncManager, 'syncAll')
    .mockResolvedValueOnce({ status: 'skipped', reason: 'offline' });
  await useAuthStore.getState().login(user.email, 'fixture-password');
  automatic.mockRestore();
  setForcedOffline(false);
}
async function seed(replacement = false) {
  await offlineDb.places.put(place);
  await offlineDb.days.bulkPut([day, departure]);
  useTripStore.setState({
    trip: replacement ? otherTrip : trip,
    days: [day, departure],
    assignments: {},
    places: [place],
    reservations: [],
  });
}
async function switchAccount(same = false) {
  api.defaults.adapter = originalAdapter;
  setForcedOffline(true);
  await useAuthStore.getState().logout();
  await login(same ? A : B);
  await seed(true);
}
function navigate() {
  useTripStore.getState().resetTrip();
  useTripStore.setState({ trip: otherTrip, days: [buildDay({ id: 99, trip_id: 102 })], assignments: {} });
}
beforeEach(async () => {
  vi.stubGlobal('File', NodeFile);
  await waitForLogout();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  resetAllStores();
  _resetNetworkMode();
  setAuthed(false);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(mutationQueue, 'sendSoon').mockImplementation(() => {});
  useBackgroundTasksStore.setState({ tasks: [] });
  server.use(
    http.post('/api/auth/login', async ({ request }) =>
      HttpResponse.json({ user: ((await request.json()) as { email: string }).email === B.email ? B : A })
    ),
    http.post('/api/auth/logout', () => HttpResponse.json({ success: true })),
    http.get('/api/trips/101/accommodations', () => HttpResponse.json({ accommodations: [] })),
    http.get('/api/trips/102/accommodations', () => HttpResponse.json({ accommodations: [] })),
    http.get('/api/trips/:trip/reservations', () => HttpResponse.json({ reservations: [] }))
  );
  await login();
  await seed();
});
afterEach(async () => {
  cleanup();
  for (const dispose of disposers.splice(0)) dispose();
  api.defaults.adapter = originalAdapter;
  for (const release of releases.splice(0)) release();
  await Promise.allSettled(pending.splice(0));
  await waitForLogout();
  await resetOfflineTestDatabase();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  await Dexie.delete('trek-offline-u1201');
  await Dexie.delete('trek-offline-u1202');
  setAuthed(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

import { render } from '../../../tests/helpers/render';
import * as socket from '../../api/websocket';
import BackgroundTasksWidget from '../../components/BackgroundTasks/BackgroundTasksWidget';
import { useReceiptScan } from '../../components/Budget/useReceiptScan';
import BookingImportModal from '../../components/Planner/BookingImportModal';
import { TranslationProvider } from '../../i18n/TranslationContext';
import { useBookingExpenseEditor } from '../../pages/tripPlanner/useBookingExpenseEditor';
import { llmRepo } from '../../repo/llmRepo';
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore';
const wrapper = ({ children }: { children: React.ReactNode }) => <TranslationProvider>{children}</TranslationProvider>;
const source = new NodeFile(['original-source'], 'ticket.pdf', { type: 'application/pdf' }) as unknown as File;
function importInput() {
  const input = document.querySelector('input[type=file]');
  if (!input) throw new Error('Missing import input');
  return input;
}
const photo = new NodeFile(['private-receipt'], 'receipt.jpg', { type: 'image/jpeg' }) as unknown as File;
const item = { type: 'flight', title: 'Original flight', source: { fileName: 'ticket.pdf', index: 0 } };
const receipt = { merchant: 'Original cafe', total: 12, currency: 'EUR', date: '2026-11-07', items: [] };
function task(id = 'original-job', cost = false) {
  return {
    id,
    tripId: '101',
    label: cost ? photo.name : source.name,
    status: 'done' as const,
    done: 1,
    total: 1,
    reviewRequested: true,
    ...(cost ? { kind: 'costs' as const, receipt } : { kind: 'transports' as const, items: [item] }),
  };
}
function options() {
  return {
    tripId: 101,
    trip,
    tripActions: useTripStore.getState(),
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    t: ((k: string) => k) as Translate,
    places: [place],
    selectedDayId: 70,
    canUploadFiles: true,
    setTripAccommodations: vi.fn(),
    editingReservation: null,
    setEditingReservation: vi.fn(),
    setShowReservationModal: vi.fn(),
    editingTransport: null,
    setEditingTransport: vi.fn(),
    setShowTransportModal: vi.fn(),
    setTransportModalDayId: vi.fn(),
  };
}
function pausedFiles() {
  const read = deferred([{ jobId: 'original-job', fileName: source.name, blob: source, createdAt: 1 }]);
  const table = offlineDb.importFiles;
  vi.spyOn(table, 'where').mockReturnValueOnce({ equals: () => ({ toArray: () => read.promise }) } as never);
  return read;
}
async function replacementFile() {
  await offlineDb.importFiles.put({
    jobId: 'original-job',
    fileName: source.name,
    blob: new Blob(['replacement-source']),
    createdAt: 1,
  });
}

describe('P04ah real source-file ownership and retention', () => {
  it.each([false, true])('a file read cannot return old bytes after the %s-user session changes', async (same) => {
    const r = pausedFiles();
    const old = observe(getImportFiles('original-job'));
    await switchAccount(same);
    r.resolve([{ jobId: 'original-job', fileName: source.name, blob: source, createdAt: 1 }]);
    expect(await old).toEqual([]);
  });
  it('a delayed delete cannot remove another account source with the same job identity', async () => {
    const check = deferred([]);
    vi.spyOn(offlineDb.mutationQueue, 'toArray').mockReturnValueOnce(Dexie.Promise.resolve(check.promise));
    const old = observe(deleteImportFiles('original-job'));
    await switchAccount();
    await replacementFile();
    check.resolve([]);
    await old;
    expect(await offlineDb.importFiles.count()).toBe(1);
  });
  it('a delayed save cannot prune replacement-account files', async () => {
    const put = deferred(undefined);
    vi.spyOn(offlineDb.importFiles, 'bulkPut').mockReturnValueOnce(Dexie.Promise.resolve(put.promise) as never);
    const old = observe(saveImportFiles('old-save', [source]));
    await switchAccount();
    await replacementFile();
    put.resolve(undefined);
    await old;
    expect(await offlineDb.importFiles.count()).toBe(1);
  });
  it('elapsed time alone does not prove original import bytes are abandoned', async () => {
    await replacementFile();
    await saveImportFiles('new-job', [photo]);
    expect(await getImportFiles('original-job')).toHaveLength(1);
  });
  it('explicit cleanup respects retained original work', async () => {
    await saveImportFiles('original-job', [source]);
    await offlineDb.mutationQueue.put({
      id: 'retained',
      tripId: 101,
      resource: 'files',
      method: 'POST',
      url: '/held',
      body: {},
      createdAt: 1,
      attempts: 0,
      schemaVersion: 2,
      recoveryHold: 'fixture',
    } as never);
    await deleteImportFiles('original-job');
    expect(await getImportFiles('original-job')).toHaveLength(1);
  });
  it('healthy helpers preserve filenames, MIME and bytes and delete only the requested job', async () => {
    await saveImportFiles('original-job', [source]);
    await saveImportFiles('other-job', [photo]);
    const files = await getImportFiles('original-job');
    expect(files[0].name).toBe(source.name);
    expect(files[0].type).toBe(source.type);
    expect(files[0].size).toBe(source.size);
    expect(await files[0].text()).toBe(await source.text());
    await deleteImportFiles('original-job');
    expect(await getImportFiles('other-job')).toHaveLength(1);
  });
});

describe('P04ah actual background-to-review bridge', () => {
  it.each([false, true])('a pending %s receipt/booking lookup cannot publish after an account change', async (cost) => {
    const r = pausedFiles();
    useBackgroundTasksStore.setState({ tasks: [task('original-job', cost)] });
    const o = options();
    const h = renderHook((p) => useBookingEdits(p), { initialProps: o });
    await waitFor(() => expect(offlineDb.importFiles.where).toHaveBeenCalled());
    await act(async () => {
      await switchAccount();
    });
    h.rerender({ ...o, tripId: 102, trip: otherTrip });
    r.resolve([{ jobId: 'original-job', fileName: source.name, blob: source, createdAt: 1 }]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
    expect(h.result.current.receiptExpense).toBeNull();
    expect(h.result.current.reservationPrefill).toBeNull();
    expect(h.result.current.transportPrefill).toBeNull();
    expect(o.setShowTransportModal).not.toHaveBeenCalled();
  });
  it('a navigation during lookup keeps the task and its original source for a later review', async () => {
    await saveImportFiles('original-job', [source]);
    const r = pausedFiles();
    useBackgroundTasksStore.setState({ tasks: [task()] });
    const o = options();
    const h = renderHook((p) => useBookingEdits(p), { initialProps: o });
    await waitFor(() => expect(offlineDb.importFiles.where).toHaveBeenCalled());
    act(navigate);
    h.rerender({ ...o, tripId: 102, trip: otherTrip });
    r.resolve([{ jobId: 'original-job', fileName: source.name, blob: source, createdAt: 1 }]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
    expect(useBackgroundTasksStore.getState().tasks.map((t) => t.id)).toContain('original-job');
    expect(await getImportFiles('original-job')).toHaveLength(1);
    expect(o.setShowTransportModal).not.toHaveBeenCalled();
  });
  it('a lookup cannot resurrect a task explicitly dismissed during its wait', async () => {
    const r = pausedFiles();
    useBackgroundTasksStore.setState({ tasks: [task()] });
    const o = options();
    renderHook(() => useBookingEdits(o));
    await waitFor(() => expect(offlineDb.importFiles.where).toHaveBeenCalled());
    act(() => useBackgroundTasksStore.getState().dismiss('original-job'));
    r.resolve([{ jobId: 'original-job', fileName: source.name, blob: source, createdAt: 1 }]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
    expect(o.setShowTransportModal).not.toHaveBeenCalled();
  });
  it('a second completed job waits until the current review finishes', async () => {
    useBackgroundTasksStore.setState({
      tasks: [
        { ...task('first'), sourceFiles: [source] },
        { ...task('second'), sourceFiles: [source], items: [{ ...item, title: 'Second flight' }] },
      ],
    });
    const o = options();
    const h = renderHook(() => useBookingEdits(o));
    await waitFor(() => expect(h.result.current.transportPrefill?.title).toBe(item.title));
    expect(useBackgroundTasksStore.getState().tasks.map((x) => x.id)).toEqual(['second']);
    act(() => {
      h.result.current.advanceImportReview();
    });
    await waitFor(() => expect(h.result.current.transportPrefill?.title).toBe('Second flight'));
  });
  it('permission changes during receipt lookup cannot attach the old uploader files', async () => {
    await saveImportFiles('original-job', [photo]);
    const r = pausedFiles();
    useBackgroundTasksStore.setState({ tasks: [task('original-job', true)] });
    const o = options();
    const h = renderHook((p) => useBookingEdits(p), { initialProps: o });
    await waitFor(() => expect(offlineDb.importFiles.where).toHaveBeenCalled());
    h.rerender({ ...o, canUploadFiles: false });
    r.resolve([{ jobId: 'original-job', fileName: source.name, blob: source, createdAt: 1 }]);
    await waitFor(() => expect(h.result.current.receiptExpense?.name).toBe(receipt.merchant));
    expect(h.result.current.receiptExpense?.receiptFiles).toEqual([]);
  });
  it('a successful handoff keeps persisted source bytes while preserving native editor mapping', async () => {
    await saveImportFiles('original-job', [source]);
    useBackgroundTasksStore.setState({ tasks: [task()] });
    const o = options();
    const h = renderHook(() => useBookingEdits(o));
    await waitFor(() => expect(h.result.current.transportPrefill?._sourceFiles?.[0].name).toBe(source.name));
    expect(useBackgroundTasksStore.getState().tasks).toEqual([]);
    expect(await getImportFiles('original-job')).toHaveLength(1);
  });
  it('a failed strict source lookup retains the task for retry', async () => {
    vi.spyOn(offlineDb.importFiles, 'where').mockImplementationOnce(() => {
      throw new Error('fixture read failure');
    });
    useBackgroundTasksStore.setState({ tasks: [task()] });
    const o = options();
    renderHook(() => useBookingEdits(o));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
    expect(useBackgroundTasksStore.getState().tasks.map((t) => t.id)).toContain('original-job');
    expect(o.setShowTransportModal).not.toHaveBeenCalled();
  });
  it('already loaded private receipt and review data disappear with their account', async () => {
    const o = options();
    const h = renderHook(() => useBookingEdits(o));
    act(() => {
      h.result.current.startImportReview([item], [source], 'transports');
      h.result.current.setReceiptExpense({ name: 'Private receipt', receiptFiles: [photo] });
    });
    expect(h.result.current.transportPrefill).not.toBeNull();
    await act(async () => {
      await switchAccount();
    });
    expect(h.result.current.transportPrefill).toBeNull();
    expect(h.result.current.receiptExpense).toBeNull();
    expect(h.result.current.importReviewActive).toBe(false);
  });
  it('an old advance callback cannot replace a newer review in the same view', () => {
    const o = options();
    const h = renderHook(() => useBookingEdits(o));
    act(() => {
      h.result.current.startImportReview([item, { ...item, title: 'Old second' }], [source]);
    });
    const old = h.result.current.advanceImportReview;
    act(() => {
      h.result.current.startImportReview([{ ...item, title: 'New review' }], [source]);
    });
    act(old);
    expect(h.result.current.transportPrefill?.title).toBe('New review');
  });
  it('a retained old start callback cannot open an editor after unmount', () => {
    const o = options();
    const h = renderHook(() => useBookingEdits(o));
    const start = h.result.current.startImportReview;
    h.unmount();
    start([item], [source]);
    expect(o.setShowTransportModal).not.toHaveBeenCalled();
  });
  it('unsupported Family review keeps its task and original files gated', async () => {
    vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
    await saveImportFiles('original-job', [source]);
    useBackgroundTasksStore.setState({ tasks: [task()] });
    const o = options();
    const h = renderHook(() => useBookingEdits(o));
    act(() => {
      h.result.current.startImportReview([item], [source]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(h.result.current.importReviewActive).toBe(false);
    expect(o.setShowTransportModal).not.toHaveBeenCalled();
    expect(useBackgroundTasksStore.getState().tasks).toHaveLength(1);
    expect(await getImportFiles('original-job')).toHaveLength(1);
  });
});

describe('P04ah actual background source producers', () => {
  it('a late booking-start reply cannot save files or publish a task in a new account', async () => {
    const r = deferred({ jobId: 'late-job' });
    let sent = false;
    vi.spyOn(healthApi, 'features').mockResolvedValue({ bookingImport: true, aiParsing: false });
    vi.spyOn(llmRepo, 'readsPhotos').mockResolvedValue(false);
    vi.spyOn(reservationsApi, 'importBookingAsync').mockImplementation(async () => {
      sent = true;
      return r.promise;
    });
    const close = vi.fn();
    render(<BookingImportModal isOpen tripId={101} onClose={close} />);
    fireEvent.change(importInput(), { target: { files: [source] } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(sent).toBe(true));
    await act(async () => {
      await switchAccount();
    });
    r.resolve({ jobId: 'late-job' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
    expect(await offlineDb.importFiles.count()).toBe(0);
    expect(useBackgroundTasksStore.getState().tasks).toEqual([]);
    expect(close).not.toHaveBeenCalled();
  });
  it('a same-account job survives normal modal unmount and keeps its original trip/file/kind', async () => {
    const r = deferred({ jobId: 'background-job' });
    let sent = false;
    vi.spyOn(healthApi, 'features').mockResolvedValue({ bookingImport: true, aiParsing: false });
    vi.spyOn(llmRepo, 'readsPhotos').mockResolvedValue(false);
    vi.spyOn(reservationsApi, 'importBookingAsync').mockImplementation(async () => {
      sent = true;
      return r.promise;
    });
    const close = vi.fn();
    const h = render(<BookingImportModal isOpen tripId={101} kind="transports" onClose={close} />);
    fireEvent.change(importInput(), { target: { files: [source] } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(sent).toBe(true));
    h.unmount();
    act(navigate);
    r.resolve({ jobId: 'background-job' });
    await waitFor(() => expect(useBackgroundTasksStore.getState().tasks[0]?.id).toBe('background-job'));
    expect(await getImportFiles('background-job')).toHaveLength(1);
    expect(useBackgroundTasksStore.getState().tasks[0]).toMatchObject({ tripId: '101', kind: 'transports' });
    expect(close).not.toHaveBeenCalled();
  });
  it('a late receipt-start reply cannot publish into the next account', async () => {
    const r = deferred('receipt-job');
    let sent = false;
    vi.spyOn(llmRepo, 'readsPhotos').mockResolvedValue(true);
    vi.spyOn(llmRepo, 'scanReceipt').mockImplementation(async () => {
      sent = true;
      return r.promise;
    });
    const h = renderHook(() => useReceiptScan(101, true), { wrapper });
    act(() => h.result.current.choose([photo]));
    const old = observe(h.result.current.start());
    await waitFor(() => expect(sent).toBe(true));
    await act(async () => {
      await switchAccount();
    });
    r.resolve('receipt-job');
    await old;
    expect(useBackgroundTasksStore.getState().tasks).toEqual([]);
    expect(await offlineDb.importFiles.count()).toBe(0);
    expect(h.result.current.photo).toBeNull();
  });
  it('logout clears private background cards and in-memory source handles', async () => {
    useBackgroundTasksStore
      .getState()
      .addTask({ id: 'old', tripId: '101', label: 'Private file', total: 1, files: [source] });
    await switchAccount();
    expect(useBackgroundTasksStore.getState().tasks).toEqual([]);
  });
});

describe('P04ah actual widget account ownership', () => {
  it('Family widget keeps completed job files and explains the unavailable review', async () => {
    vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
    vi.spyOn(healthApi, 'features').mockResolvedValue({ bookingImport: false, aiParsing: false });
    vi.spyOn(reservationsApi, 'importJobStatus').mockResolvedValue({
      status: 'done',
      done: 1,
      total: 1,
      result: { items: [item], warnings: [] },
    });
    await saveImportFiles('original-job', [source]);
    useBackgroundTasksStore.setState({ tasks: [task()] });

    render(<BackgroundTasksWidget />);

    expect(await screen.findByText('Reading booking files isn’t available here.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
    expect(useBackgroundTasksStore.getState().tasks).toHaveLength(1);
    expect(await getImportFiles('original-job')).toHaveLength(1);
  });

  it('Family widget retains an unavailable job and its original bytes after a status 404', async () => {
    vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
    vi.spyOn(healthApi, 'features').mockResolvedValue({ bookingImport: false, aiParsing: false });
    vi.spyOn(reservationsApi, 'importJobStatus').mockRejectedValue({ response: { status: 404 } });
    await saveImportFiles('original-job', [source]);
    useBackgroundTasksStore.setState({ tasks: [task()] });

    render(<BackgroundTasksWidget />);

    await waitFor(() =>
      expect(useBackgroundTasksStore.getState().tasks).toMatchObject([{ id: 'original-job', status: 'unavailable' }])
    );
    const savedTasks = localStorage.getItem(useBackgroundTasksStore.persist.getOptions().name ?? '');
    expect(JSON.parse(savedTasks ?? '{}')).toMatchObject({
      state: { tasks: [{ id: 'original-job', tripId: '101', status: 'unavailable' }] },
    });
    const files = await getImportFiles('original-job');
    expect(files.map((file) => file.name)).toEqual([source.name]);
    expect(await files[0]?.text()).toBe(await source.text());
  });

  it('late reconciliation cannot insert a job into a replacement account', async () => {
    const r = deferred({ status: 'done', result: { items: [item], warnings: [] } });
    let read = false;
    vi.spyOn(healthApi, 'features').mockResolvedValue({ bookingImport: true, aiParsing: false });
    vi.spyOn(reservationsApi, 'importJobStatus').mockImplementation(async () => {
      read = true;
      return (await r.promise) as never;
    });
    useBackgroundTasksStore.setState({
      tasks: [{ ...task(), reviewRequested: false, status: 'running', items: undefined }],
    });
    render(<BackgroundTasksWidget />);
    await waitFor(() => expect(read).toBe(true));
    await act(async () => {
      await switchAccount();
    });
    r.resolve({ status: 'done', result: { items: [item], warnings: [] } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
    expect(useBackgroundTasksStore.getState().tasks).toEqual([]);
  });
  it('a retained socket callback cannot publish after unmount', () => {
    vi.spyOn(healthApi, 'features').mockReturnValue(new Promise(() => {}));
    const add = vi.spyOn(socket, 'addListener');
    const h = render(<BackgroundTasksWidget />);
    const cb = add.mock.calls[0][0];
    h.unmount();
    cb({ type: 'import:done', jobId: 'old', tripId: '101', result: { items: [item], warnings: [] } });
    expect(useBackgroundTasksStore.getState().tasks).toEqual([]);
  });
  it('a late AI retry cannot publish or persist its files in the next account', async () => {
    const r = deferred({ jobId: 'retry-job' });
    let sent = false;
    vi.spyOn(healthApi, 'features').mockResolvedValue({ bookingImport: true, aiParsing: true });
    vi.spyOn(reservationsApi, 'importJobStatus').mockReturnValue(new Promise(() => {}));
    vi.spyOn(reservationsApi, 'importBookingAsync').mockImplementation(async () => {
      sent = true;
      return r.promise;
    });
    useBackgroundTasksStore.setState({
      tasks: [{ ...task(), reviewRequested: false, items: [], sourceFiles: [source] }],
    });
    render(<BackgroundTasksWidget />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try AI parsing' }));
    await waitFor(() => expect(sent).toBe(true));
    await act(async () => {
      await switchAccount();
    });
    await act(async () => {
      r.resolve({ jobId: 'retry-job' });
      await new Promise((r) => setTimeout(r, 15));
    });
    expect(useBackgroundTasksStore.getState().tasks).toEqual([]);
    expect(await offlineDb.importFiles.count()).toBe(0);
  });
  it('an older retry failure cannot clear the newer retry busy state', async () => {
    const one = deferred<{ jobId: string } | Error>(new Error('first failed')),
      two = deferred({ jobId: 'retry-second' });
    let calls = 0;
    vi.spyOn(healthApi, 'features').mockResolvedValue({ bookingImport: true, aiParsing: true });
    vi.spyOn(reservationsApi, 'importJobStatus').mockReturnValue(new Promise(() => {}));
    vi.spyOn(reservationsApi, 'importBookingAsync').mockImplementation(async () => {
      const value = await (++calls === 1 ? one.promise : two.promise);
      if (value instanceof Error) throw value;
      return value;
    });
    useBackgroundTasksStore.setState({
      tasks: [
        { ...task('retry-one'), reviewRequested: false, items: [], sourceFiles: [source] },
        { ...task('retry-two'), reviewRequested: false, items: [], sourceFiles: [source] },
      ],
    });
    render(<BackgroundTasksWidget />);
    const buttons = await screen.findAllByRole('button', { name: 'Try AI parsing' });
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    await waitFor(() => expect(calls).toBe(2));
    await act(async () => {
      one.resolve(new Error('first failed'));
    });
    await waitFor(() =>
      expect(useBackgroundTasksStore.getState().tasks.find((t) => t.id === 'retry-one')?.status).toBe('error')
    );
    expect(buttons[1]).toBeDisabled();
    two.resolve({ jobId: 'retry-second' });
    await waitFor(() =>
      expect(useBackgroundTasksStore.getState().tasks.some((t) => t.id === 'retry-second')).toBe(true)
    );
  });
  it('a healthy AI retry keeps the original transport kind and persisted source', async () => {
    vi.spyOn(healthApi, 'features').mockResolvedValue({ bookingImport: true, aiParsing: true });
    vi.spyOn(reservationsApi, 'importJobStatus').mockReturnValue(new Promise(() => {}));
    const start = vi.spyOn(reservationsApi, 'importBookingAsync').mockResolvedValue({ jobId: 'retry-job' });
    useBackgroundTasksStore.setState({
      tasks: [{ ...task(), reviewRequested: false, items: [], sourceFiles: [source] }],
    });
    render(<BackgroundTasksWidget />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try AI parsing' }));
    await waitFor(() => expect(useBackgroundTasksStore.getState().tasks[0]?.id).toBe('retry-job'));
    expect(start).toHaveBeenCalledWith('101', [source], 'force-ai');
    expect(useBackgroundTasksStore.getState().tasks[0]?.kind).toBe('transports');
    expect(await getImportFiles('retry-job')).toHaveLength(1);
  });
  it('same-account reconciliation survives navigation while its widget stays mounted', async () => {
    const r = deferred({ status: 'done', result: { items: [item], warnings: [] } });
    let read = false;
    vi.spyOn(healthApi, 'features').mockResolvedValue({ bookingImport: true, aiParsing: false });
    vi.spyOn(reservationsApi, 'importJobStatus').mockImplementation(async () => {
      read = true;
      return (await r.promise) as never;
    });
    useBackgroundTasksStore.setState({
      tasks: [{ ...task(), status: 'running', items: undefined, reviewRequested: false }],
    });
    render(<BackgroundTasksWidget />);
    await waitFor(() => expect(read).toBe(true));
    act(navigate);
    r.resolve({ status: 'done', result: { items: [item], warnings: [] } });
    await waitFor(() => expect(useBackgroundTasksStore.getState().tasks[0]?.status).toBe('done'));
  });
});

describe('P04ah actual receipt expense continuation', () => {
  it('an old save callback cannot close a newer expense editor', () => {
    const clear = vi.fn();
    const h = renderHook(() =>
      useBookingExpenseEditor({ tripId: 101, tripCurrency: 'EUR', receiptExpense: null, clearReceiptExpense: clear })
    );
    act(() => h.result.current.openBookingExpense({ prefill: { name: 'Old' } }));
    const old = h.result.current.onExpenseSaved;
    act(() => h.result.current.openBookingExpense({ prefill: { name: 'New' } }));
    act(old);
    expect(h.result.current.expenseEditor?.prefill?.name).toBe('New');
  });
});
