import 'fake-indexeddb/auto';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlace, buildTrip } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import OfflineTab from '../../components/Settings/OfflineTab';
import { MUTATION_SCHEMA_VERSION, offlineDb, type QueuedMutation } from '../../db/offlineDb';
import MSettingsOffline from '../../mobile/screens/settings/MSettingsOffline';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode } from '../../sync/networkMode';
import { _resetOfflinePrefs, setConflictStrategy } from '../../sync/offlinePrefs';
import { installFamilyCommandRetention, RetainedCommandError } from '../../sync/retainedCommand';

const neighbors = vi.hoisted(() => ({ syncAll: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock('../../sync/tripSyncManager', () => ({
  tripSyncManager: { syncAll: neighbors.syncAll },
  isDateEligible: () => true,
}));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => neighbors }));
vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'en' }) }));
const originalBody = {
  operation_id: '50000000-0000-4000-8000-000000000001',
  scope: { user_id: 'original-user', family_id: 'original-family', layer: 'myDraft' },
  observation: { revision: 3 },
  changes: { notes: 'Keep my personal notes' },
};
const url = '/trips/1/family/planner-editor-command';
let release: (() => void) | undefined;
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  _resetOfflinePrefs();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  neighbors.syncAll.mockReset();
  neighbors.error.mockReset();
  neighbors.success.mockReset();
  server.use(http.get('/api/trips', () => HttpResponse.json({ trips: [] })));
});
afterEach(() => {
  cleanup();
  release?.();
  release = undefined;
  setAuthed(false);
  vi.restoreAllMocks();
});
async function enqueue(over: Partial<Parameters<typeof mutationQueue.enqueue>[0]> = {}) {
  const id = crypto.randomUUID();
  await mutationQueue.enqueue({
    id,
    tripId: 1,
    method: 'POST',
    url,
    body: structuredClone(originalBody),
    baseUpdatedAt: 'Original precise token',
    ...over,
  });
  return id;
}
const conflict = () => HttpResponse.json({ error: 'stale original observation' }, { status: 409 });
function expectOriginal(row: QueuedMutation | undefined) {
  expect(row?.body).toEqual(originalBody);
  expect(row?.baseUpdatedAt).toBe('Original precise token');
}
describe('P04s original Family commands through the real native queue', () => {
  it.each(['ask', 'mine', 'server'] as const)(
    'preference %s never discards, strips the token or loops on a command refusal',
    async (strategy) => {
      setConflictStrategy(strategy);
      let calls = 0;
      server.use(
        http.post('/api' + url, () => {
          calls++;
          return conflict();
        })
      );
      const id = await enqueue();
      await mutationQueue.flush();
      await mutationQueue.flush();
      const row = await offlineDb.mutationQueue.get(id);
      expectOriginal(row);
      expect(row?.status).toBe('conflict');
      expect(row?.retentionPolicy).toBe('family-original-v1');
      expect(calls).toBe(1);
    }
  );
  it.each(['planner-arrange-command', 'calendar', 'booking-details/booking', 'plan-changes/draft/submit'])(
    'retains the %s protocol across a server-wins preference',
    async (suffix) => {
      setConflictStrategy('server');
      const path = '/trips/1/family/' + suffix;
      server.use(http.post('/api' + path, conflict));
      const id = await enqueue({ url: path });
      await mutationQueue.flush();
      expectOriginal(await offlineDb.mutationQueue.get(id));
      expect(await mutationQueue.conflictCount()).toBe(1);
    }
  );
  it('holds creation for its qualified original owner instead of generic queue dispatch', async () => {
    const dispatch = vi.fn(conflict);
    server.use(http.post('/api/trips/1/family/planner-create-command', dispatch));
    const id = await enqueue({ url: '/trips/1/family/planner-create-command' });
    await mutationQueue.flush();
    expectOriginal(await offlineDb.mutationQueue.get(id));
    expect((await offlineDb.mutationQueue.get(id))?.status).toBe('pending');
    expect(dispatch).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404, 409, 422])(
    'status %s keeps the complete original and optimistic bytes without treating it as a row rollback',
    async (status) => {
      const place = buildPlace({ id: -7, trip_id: 1, name: 'Retained local data' });
      await offlineDb.places.put(place);
      server.use(http.post('/api' + url, () => HttpResponse.json({ error: 'refused' }, { status })));
      const id = await enqueue({ resource: 'places', tempId: -7 });
      await mutationQueue.flush();
      expectOriginal(await offlineDb.mutationQueue.get(id));
      expect(await offlineDb.places.get(-7)).toEqual(place);
      expect((await offlineDb.mutationQueue.get(id))?.status).toBe(
        status === 409 ? 'conflict' : status === 401 ? 'pending' : 'failed'
      );
    }
  );
  it('a retained DELETE 404 is a refusal, not successful deletion of intent', async () => {
    server.use(http.delete('/api' + url, () => HttpResponse.json({ error: 'unavailable' }, { status: 404 })));
    const id = await enqueue({ method: 'DELETE' });
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(id))?.status).toBe('failed');
    expectOriginal(await offlineDb.mutationQueue.get(id));
  });
  it('a parked command holds newer command domains in its Trip while another Trip proceeds', async () => {
    const calls: string[] = [];
    server.use(
      http.post('/api/trips/:trip/family/:command', ({ params }) => {
        calls.push(String(params.trip) + ':' + String(params.command));
        return params.trip === '1' ? conflict() : HttpResponse.json({ ok: true });
      })
    );
    const first = await enqueue();
    const later = await enqueue({ url: '/trips/1/family/calendar' });
    const other = await enqueue({ tripId: 2, url: '/trips/2/family/calendar' });
    await mutationQueue.flush();
    await mutationQueue.flush();
    expect(calls).toEqual(['1:planner-editor-command', '2:calendar']);
    expect((await offlineDb.mutationQueue.get(later))?.status).toBe('pending');
    expect(await offlineDb.mutationQueue.get(other)).toBeUndefined();
    expectOriginal(await offlineDb.mutationQueue.get(first));
  });
  it('a newer-format retained command also holds later commands without being sent', async () => {
    const first = await enqueue();
    await offlineDb.mutationQueue.update(first, { schemaVersion: MUTATION_SCHEMA_VERSION + 1 });
    const later = await enqueue({ url: '/trips/1/family/calendar' });
    let calls = 0;
    server.use(
      http.post('/api/trips/1/family/:command', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      })
    );
    await mutationQueue.flush();
    expect(calls).toBe(0);
    expect((await offlineDb.mutationQueue.get(later))?.status).toBe('pending');
  });
  it('native legacy work is stamped before HTTP and remains protected after cohort release', async () => {
    release = installFamilyCommandRetention();
    setConflictStrategy('server');
    const path = '/trips/1/places/42';
    let wasStamped = false;
    server.use(
      http.put('/api' + path, async () => {
        wasStamped = (await offlineDb.mutationQueue.toArray())[0].retentionPolicy === 'family-original-v1';
        release?.();
        release = undefined;
        return conflict();
      })
    );
    const id = await enqueue({ method: 'PUT', url: path, resource: 'places', entityId: 42 });
    await mutationQueue.flush();
    expect(wasStamped).toBe(true);
    expect((await offlineDb.mutationQueue.get(id))?.status).toBe('conflict');
    expectOriginal(await offlineDb.mutationQueue.get(id));
  });
  it('releasing one of two cohort guards does not release the other', async () => {
    const one = installFamilyCommandRetention();
    release = installFamilyCommandRetention();
    one();
    one();
    setConflictStrategy('server');
    server.use(http.put('/api/trips/1/places/42', conflict));
    const id = await enqueue({ method: 'PUT', url: '/trips/1/places/42' });
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(id))?.status).toBe('conflict');
  });
  it('a retained native row still makes later online writes join the original entity queue', async () => {
    const id = await enqueue({
      method: 'PUT',
      url: '/trips/1/places/42',
      resource: 'places',
      entityId: 42,
      retentionPolicy: 'family-original-v1',
    });
    await offlineDb.mutationQueue.update(id, { status: 'failed' });
    expect(await mutationQueue.mustQueue('places', 42)).toBe(true);
    expect(await mutationQueue.mustQueue('places', 43)).toBe(false);
  });
  it('retained work holds a later ordinary row after the cohort is gone', async () => {
    const id = await enqueue({
      method: 'PUT',
      url: '/trips/1/places/42',
      resource: 'places',
      entityId: 42,
      retentionPolicy: 'family-original-v1',
    });
    await offlineDb.mutationQueue.update(id, { status: 'failed' });
    const later = await enqueue({ method: 'PUT', url: '/trips/1/places/42', resource: 'places', entityId: 42 });
    let calls = 0;
    server.use(
      http.put('/api/trips/1/places/42', () => {
        calls++;
        return HttpResponse.json({ place: buildPlace({ id: 42 }) });
      })
    );
    await mutationQueue.flush();
    expect(calls).toBe(0);
    expect((await offlineDb.mutationQueue.get(later))?.status).toBe('pending');
  });
  it('Keep mine retries the exact original body and both retry headers, then clears only its acknowledgement', async () => {
    let calls = 0;
    const bodies: unknown[] = [],
      headers: unknown[] = [];
    server.use(
      http.post('/api' + url, async ({ request }) => {
        bodies.push(await request.json());
        headers.push([request.headers.get('X-Idempotency-Key'), request.headers.get('X-Base-Updated-At')]);
        return ++calls === 1 ? conflict() : HttpResponse.json({ ok: true });
      })
    );
    const id = await enqueue();
    await mutationQueue.flush();
    await mutationQueue.resolveKeepMine(id);
    expect(bodies).toEqual([originalBody, originalBody]);
    expect(headers).toEqual([
      [id, 'Original precise token'],
      [id, 'Original precise token'],
    ]);
    expect(await offlineDb.mutationQueue.get(id)).toBeUndefined();
  });
  it('Keep server refuses without adopting a synthetic row or deleting original work', async () => {
    server.use(http.post('/api' + url, conflict));
    const id = await enqueue();
    await mutationQueue.flush();
    const before = await offlineDb.mutationQueue.get(id);
    await expect(mutationQueue.resolveKeepServer(id)).rejects.toBeInstanceOf(RetainedCommandError);
    expect(await offlineDb.mutationQueue.get(id)).toEqual(before);
  });
  it('Discard failed refuses the complete mixed batch without deleting unrelated failures', async () => {
    const id = await enqueue();
    const ordinary = await enqueue({ url: '/trips/2/packing/4', tripId: 2 });
    await offlineDb.mutationQueue.toCollection().modify({ status: 'failed' });
    await expect(mutationQueue.discardFailed()).rejects.toBeInstanceOf(RetainedCommandError);
    expectOriginal(await offlineDb.mutationQueue.get(id));
    expect(await offlineDb.mutationQueue.get(ordinary)).toBeDefined();
  });
  it('Retry failed retains the original scope/body/token and parks revoked permission once', async () => {
    const id = await enqueue();
    await offlineDb.mutationQueue.update(id, { status: 'failed' });
    let calls = 0;
    server.use(
      http.post('/api' + url, () => {
        calls++;
        return HttpResponse.json({ error: 'revoked' }, { status: 403 });
      })
    );
    await mutationQueue.retryFailed();
    await mutationQueue.flush();
    expect(calls).toBe(1);
    expectOriginal(await offlineDb.mutationQueue.get(id));
    expect((await offlineDb.mutationQueue.get(id))?.status).toBe('failed');
  });
});
describe('P04s existing native desktop/phone settings callbacks with real IndexedDB and queue', () => {
  it.each(['desktop', 'phone'])(
    '%s Keep server reports retained work and leaves the conflict visible',
    async (shell) => {
      const id = await enqueue();
      await offlineDb.mutationQueue.update(id, { status: 'conflict', retentionPolicy: 'family-original-v1' });
      await offlineDb.trips.put(buildTrip({ id: 1 }));
      render(shell === 'desktop' ? <OfflineTab /> : <MSettingsOffline />);
      fireEvent.click(await screen.findByRole('button', { name: 'settings.offline.conflicts.keepServer' }));
      await waitFor(() => expect(neighbors.error).toHaveBeenCalled());
      expectOriginal(await offlineDb.mutationQueue.get(id));
      expect(await screen.findByRole('button', { name: 'settings.offline.conflicts.keepServer' })).toBeInTheDocument();
      expect(neighbors.syncAll).not.toHaveBeenCalled();
    }
  );
  it.each(['desktop', 'phone'])(
    '%s Keep mine sends the original command and clears an acknowledged conflict',
    async (shell) => {
      const id = await enqueue();
      await offlineDb.mutationQueue.update(id, { status: 'conflict' });
      const sent: unknown[] = [];
      server.use(
        http.post('/api' + url, async ({ request }) => {
          sent.push([
            await request.json(),
            request.headers.get('X-Idempotency-Key'),
            request.headers.get('X-Base-Updated-At'),
          ]);
          return HttpResponse.json({ ok: true });
        })
      );
      render(shell === 'desktop' ? <OfflineTab /> : <MSettingsOffline />);
      fireEvent.click(await screen.findByRole('button', { name: 'settings.offline.conflicts.keepMine' }));
      await waitFor(() => expect(sent).toEqual([[originalBody, id, 'Original precise token']]));
      await waitFor(async () => expect(await offlineDb.mutationQueue.get(id)).toBeUndefined());
      expect(neighbors.error).not.toHaveBeenCalled();
    }
  );
  it.each(['desktop', 'phone'])(
    '%s Discard failed refuses without starting a full sync or hiding work',
    async (shell) => {
      const id = await enqueue();
      await offlineDb.mutationQueue.update(id, { status: 'failed' });
      render(shell === 'desktop' ? <OfflineTab /> : <MSettingsOffline />);
      fireEvent.click(await screen.findByRole('button', { name: 'settings.offline.failed.discard' }));
      await waitFor(() => expect(neighbors.error).toHaveBeenCalled());
      expectOriginal(await offlineDb.mutationQueue.get(id));
      expect(neighbors.syncAll).not.toHaveBeenCalled();
      expect(await screen.findByRole('button', { name: 'settings.offline.failed.discard' })).toBeInTheDocument();
    }
  );
});
