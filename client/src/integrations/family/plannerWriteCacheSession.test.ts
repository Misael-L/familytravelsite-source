import { waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAssignment,
  buildDay,
  buildDayNote,
  buildPlace,
  buildTrip,
  buildUser,
} from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import { offlineDb, reopenAnonymous } from '../../db/offlineDb';
import { assignmentRepo } from '../../repo/assignmentRepo';
import { dayNoteRepo } from '../../repo/dayNoteRepo';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { waitForLogout } from '../../sync/logoutCoordinator';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { tripSyncManager } from '../../sync/tripSyncManager';
import { createFamilyAxiosAdapter } from './transport';

vi.mock('../../sync/syncTriggers', () => ({ registerSyncTriggers: vi.fn(), unregisterSyncTriggers: vi.fn() }));
vi.mock('../../push/webPush', () => ({
  forgetPushDeviceOnLogout: vi.fn(async () => {}),
  resyncPushSubscription: vi.fn(async () => {}),
}));
const originalAdapter = api.defaults.adapter;
const A = buildUser({ id: 1101, email: 'original@fixture.invalid' });
const B = buildUser({ id: 1102, email: 'replacement@fixture.invalid' });
const trip = buildTrip({ id: 101 }),
  otherTrip = buildTrip({ id: 102 });
const place = buildPlace({ id: 301, trip_id: 101, name: 'Original venue' });
const visit = buildAssignment({
  id: 501,
  day_id: 70,
  place_id: 301,
  order_index: 0,
  place,
  notes: 'Original visit note',
});
const neighbor = buildAssignment({ id: 502, day_id: 71, place_id: 301, place });
const note = buildDayNote({
  id: 601,
  day_id: 70,
  text: 'Original day note',
  color: '#123456',
  time: '08:00',
  icon: 'Ticket',
});
const savedNote = { ...note, text: 'Saved note' };
const savedVisit = { ...visit, notes: 'Saved visit', end_day: true };
const releases: (() => void)[] = [],
  pending: Promise<unknown>[] = [];
function deferred<T>(fallback: T) {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  releases.push(() => resolve(fallback));
  return { promise, resolve };
}
function observe(promise: Promise<unknown>) {
  const settled = promise.catch((error) => error);
  pending.push(settled);
  return settled;
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
  const n = replacement ? { ...note, text: 'Replacement private note' } : note;
  const v = replacement ? { ...visit, notes: 'Replacement visit note' } : visit;
  const days = [
    buildDay({ id: 70, trip_id: replacement ? 102 : 101, assignments: [v], notes_items: [n] }),
    buildDay({ id: 71, trip_id: replacement ? 102 : 101, assignments: [neighbor], notes_items: [] }),
  ];
  await offlineDb.days.bulkPut(days);
  useTripStore.setState({
    trip: replacement ? otherTrip : trip,
    places: [place],
    days,
    assignments: { '70': [v], '71': [neighbor] },
    dayNotes: { '70': [n], '71': [] },
  });
}
async function switchAccount(same = false) {
  api.defaults.adapter = originalAdapter;
  setForcedOffline(true);
  await useAuthStore.getState().logout();
  await login(same ? A : B);
  await seed(true);
}
async function expectReplacementIntact() {
  expect((await offlineDb.days.get(70))?.notes_items).toEqual([{ ...note, text: 'Replacement private note' }]);
  expect((await offlineDb.days.get(70))?.assignments).toEqual([{ ...visit, notes: 'Replacement visit note' }]);
  expect((await offlineDb.days.get(71))?.assignments).toEqual([neighbor]);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
  expect(useTripStore.getState().dayNotes['70']).toEqual([{ ...note, text: 'Replacement private note' }]);
}
beforeEach(async () => {
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
  server.use(
    http.post('/api/auth/login', async ({ request }) =>
      HttpResponse.json({ user: ((await request.json()) as { email: string }).email === B.email ? B : A })
    ),
    http.post('/api/auth/logout', () => HttpResponse.json({ success: true }))
  );
  await login();
  await seed();
});
afterEach(async () => {
  api.defaults.adapter = originalAdapter;
  for (const release of releases.splice(0)) release();
  await Promise.allSettled(pending.splice(0));
  await waitForLogout();
  await resetOfflineTestDatabase();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  await Dexie.delete('trek-offline-u1101');
  await Dexie.delete('trek-offline-u1102');
  setAuthed(false);
  vi.restoreAllMocks();
});

const writes = [
  {
    name: 'note create',
    run: () => useTripStore.getState().addDayNote(101, 70, { text: 'Saved note' }),
    decision: false,
  },
  {
    name: 'note update',
    run: () => useTripStore.getState().updateDayNote(101, 70, 601, { text: 'Saved note' }),
    decision: true,
  },
  { name: 'note delete', run: () => useTripStore.getState().deleteDayNote(101, 70, 601), decision: true },
  { name: 'visit create', run: () => useTripStore.getState().assignPlaceToDay(101, 70, place.id), decision: false },
  { name: 'visit remove', run: () => useTripStore.getState().removeAssignment(101, 70, visit.id), decision: true },
  {
    name: 'visit reorder',
    run: () => useTripStore.getState().reorderAssignments(101, 70, [visit.id]),
    decision: false,
  },
  { name: 'visit move', run: () => useTripStore.getState().moveAssignment(101, visit.id, 70, 71, 0), decision: true },
  { name: 'participants', run: () => assignmentRepo.setParticipants(101, visit.id, [A.id]), decision: true },
  { name: 'leg mode', run: () => assignmentRepo.setLegMode(101, visit.id, 'walking'), decision: true },
  { name: 'day clear', run: () => assignmentRepo.clearDay(101, 70), decision: true },
  { name: 'day end', run: () => assignmentRepo.setEndDay(101, visit, true), decision: true },
  { name: 'route exclusion', run: () => assignmentRepo.setRouteExcluded(101, visit, true), decision: true },
  {
    name: 'times',
    run: () => assignmentRepo.setTimes(101, visit, { place_time: '09:00', end_time: null }),
    decision: true,
  },
  { name: 'visit notes', run: () => assignmentRepo.setNotes(101, visit, 'Saved visit'), decision: true },
];
const queuedWrites = [
  { name: 'note create', run: () => dayNoteRepo.create(101, 70, { text: 'Offline new note' }) },
  { name: 'note update', run: () => dayNoteRepo.update(101, 70, note, { text: 'Offline changed note' }) },
  { name: 'note delete', run: () => dayNoteRepo.delete(101, 70, note.id) },
  { name: 'visit create', run: () => assignmentRepo.create(101, 70, place) },
  { name: 'visit remove', run: () => assignmentRepo.remove(101, 70, visit.id) },
  { name: 'visit reorder', run: () => assignmentRepo.reorder(101, 70, [visit.id]) },
  { name: 'visit move', run: () => assignmentRepo.move(101, visit, 71, 0, [visit.id, neighbor.id]) },
  { name: 'participants', run: () => assignmentRepo.setParticipants(101, visit.id, [A.id]) },
  ...writes.filter((w) =>
    ['leg mode', 'day clear', 'day end', 'route exclusion', 'times', 'visit notes'].includes(w.name)
  ),
];

describe('P04ae native write/cache ownership through real consumers', () => {
  it.each(writes)('a late $name response cannot mutate the replacement account cache', async (entry) => {
    const reply = deferred({ note: savedNote, assignment: savedVisit, participants: [], success: true });
    let requested = 0;
    server.use(
      http.all('/api/trips/101/*', async () => {
        requested++;
        return HttpResponse.json(await reply.promise);
      })
    );
    const old = observe(entry.run());
    await waitFor(() => expect(requested).toBe(1));
    await switchAccount();
    reply.resolve({ note: savedNote, assignment: savedVisit, participants: [], success: true });
    expect(await old).toBeInstanceOf(Error);
    await expectReplacementIntact();
    expect(requested).toBe(1);
  });
  it.each(writes.filter((w) => w.name === 'note create' || w.name === 'visit create'))(
    'same-user logout/relogin also invalidates a late $name',
    async (entry) => {
      const reply = deferred({ note: savedNote, assignment: savedVisit });
      let requested = false;
      server.use(
        http.all('/api/trips/101/*', async () => {
          requested = true;
          return HttpResponse.json(await reply.promise);
        })
      );
      const old = observe(entry.run());
      await waitFor(() => expect(requested).toBe(true));
      await switchAccount(true);
      reply.resolve({ note: savedNote, assignment: savedVisit });
      expect(await old).toBeInstanceOf(Error);
      await expectReplacementIntact();
    }
  );
  it.each(writes.filter((w) => w.decision))(
    'a suspended queue decision cannot launch $name in the next account',
    async (entry) => {
      const decision = deferred(false);
      vi.spyOn(mutationQueue, 'mustQueue').mockImplementationOnce(() => decision.promise);
      let calls = 0;
      server.use(
        http.all('/api/trips/101/*', () => {
          calls++;
          return HttpResponse.json({ note: savedNote, assignment: savedVisit, participants: [], success: true });
        })
      );
      const old = observe(entry.run());
      await switchAccount();
      decision.resolve(false);
      expect(await old).toBeInstanceOf(Error);
      expect(calls).toBe(0);
      await expectReplacementIntact();
    }
  );
  it.each(queuedWrites)(
    'an interrupted offline $name rolls back its cache and newly enqueued mutation together',
    async (entry) => {
      setForcedOffline(true);
      const before = await offlineDb.days.toArray();
      const enqueue = mutationQueue.enqueue.bind(mutationQueue);
      vi.spyOn(mutationQueue, 'enqueue').mockImplementationOnce(async (mutation) => {
        const result = await enqueue(mutation);
        setAuthed(false);
        return result;
      });
      const result = await observe(entry.run());
      setAuthed(true);
      expect(result).toBeInstanceOf(Error);
      expect(await offlineDb.days.toArray()).toEqual(before);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it('a paused member lookup cannot queue participants after a session change', async () => {
    setForcedOffline(true);
    const read = deferred([{ tripId: 101, id: A.id, username: A.username, avatar: null }]);
    const table = offlineDb.tripMembers,
      where = table.where.bind(table);
    let waiting = false;
    vi.spyOn(table, 'where').mockImplementation(((...args: Parameters<typeof table.where>) => {
      const clause = where(...args);
      const equals = clause.equals.bind(clause);
      vi.spyOn(clause, 'equals').mockImplementation((value) => {
        const collection = equals(value);
        vi.spyOn(collection, 'toArray').mockReturnValue(read.promise);
        waiting = true;
        return collection;
      });
      return clause;
    }) as typeof table.where);
    const old = observe(assignmentRepo.setParticipants(101, visit.id, [A.id]));
    await waitFor(() => expect(waiting).toBe(true));
    await switchAccount();
    read.resolve([{ tripId: 101, id: A.id, username: A.username, avatar: null }]);
    expect(await old).toBeInstanceOf(Error);
    await expectReplacementIntact();
  });
  it('an online move cannot send its follow-up reorder after an account change', async () => {
    const moved = deferred({ assignment: { ...visit, day_id: 71 } });
    let moves = 0,
      reorders = 0;
    server.use(
      http.put('/api/trips/101/assignments/501/move', async () => {
        moves++;
        return HttpResponse.json(await moved.promise);
      }),
      http.put('/api/trips/101/days/71/assignments/reorder', () => {
        reorders++;
        return HttpResponse.json({ success: true });
      })
    );
    const old = observe(useTripStore.getState().moveAssignment(101, visit.id, 70, 71, 0));
    await waitFor(() => expect(moves).toBe(1));
    await switchAccount();
    moved.resolve({ assignment: { ...visit, day_id: 71 } });
    await old;
    expect(reorders).toBe(0);
    await expectReplacementIntact();
  });
  it('a note move cannot delete either original-account note after a replacement login', async () => {
    const created = deferred({ note: { ...note, id: 602, day_id: 71 } });
    let posts = 0,
      deletes = 0;
    server.use(
      http.post('/api/trips/101/days/71/notes', async () => {
        posts++;
        return HttpResponse.json(await created.promise);
      }),
      http.delete('/api/trips/101/days/:day/notes/:id', () => {
        deletes++;
        return HttpResponse.json({ success: true });
      })
    );
    const old = observe(useTripStore.getState().moveDayNote(101, 70, 71, 601));
    await waitFor(() => expect(posts).toBe(1));
    await switchAccount();
    created.resolve({ note: { ...note, id: 602, day_id: 71 } });
    await old;
    expect(deletes).toBe(0);
    await expectReplacementIntact();
  });
  it('a source-delete lost acknowledgement retains the confirmed note copy instead of deleting the last server copy', async () => {
    let sourceExists = true,
      targetExists = false,
      compensated = 0;
    const copy = { ...note, id: 602, day_id: 71 };
    server.use(
      http.post('/api/trips/101/days/71/notes', () => {
        targetExists = true;
        return HttpResponse.json({ note: copy });
      }),
      http.delete('/api/trips/101/days/70/notes/601', () => {
        sourceExists = false;
        return HttpResponse.json({ error: 'Lost acknowledgement after commit' }, { status: 503 });
      }),
      http.delete('/api/trips/101/days/71/notes/602', () => {
        compensated++;
        targetExists = false;
        return HttpResponse.json({ success: true });
      })
    );
    await expect(useTripStore.getState().moveDayNote(101, 70, 71, 601)).rejects.toThrow();
    expect(sourceExists).toBe(false);
    expect(targetExists).toBe(true);
    expect(compensated).toBe(0);
    expect(useTripStore.getState().dayNotes['71']).toEqual([copy]);
  });
  it('same-account navigation keeps an acknowledged original-trip note cached without replacing the current trip view', async () => {
    const reply = deferred({ note: savedNote });
    let requested = false;
    server.use(
      http.put('/api/trips/101/days/70/notes/601', async () => {
        requested = true;
        return HttpResponse.json(await reply.promise);
      })
    );
    const old = observe(useTripStore.getState().updateDayNote(101, 70, 601, { text: 'Saved note' }));
    await waitFor(() => expect(requested).toBe(true));
    useTripStore.getState().resetTrip();
    useTripStore.setState({
      trip: otherTrip,
      dayNotes: { '72': [{ ...note, day_id: 72, text: 'Current trip note' }] },
    });
    reply.resolve({ note: savedNote });
    await old;
    await waitFor(async () => expect((await offlineDb.days.get(70))?.notes_items).toEqual([savedNote]));
    expect(useTripStore.getState().dayNotes['72'][0].text).toBe('Current trip note');
  });
  it('healthy real Family Axios dispatch preserves the visit body and updates its original cache and native store', async () => {
    const requests: unknown[] = [];
    api.defaults.adapter = createFamilyAxiosAdapter(async (request) => {
      requests.push({ method: request.method, path: request.pathname, body: request.body });
      return { assignment: savedVisit };
    });
    await useTripStore.getState().assignPlaceToDay(101, 70, place.id);
    expect(requests).toEqual([
      { method: 'POST', path: '/trips/101/days/70/assignments', body: { place_id: place.id } },
    ]);
    expect((await offlineDb.days.get(70))?.assignments?.find((v) => v.id === visit.id)?.notes).toBe('Saved visit');
    expect(useTripStore.getState().assignments['70'].some((v) => v.id === visit.id)).toBe(true);
  });
  it('healthy offline note and move retain exact replay routes, fields and original retained command identities', async () => {
    setForcedOffline(true);
    const retained = {
      id: crypto.randomUUID(),
      tripId: 101,
      method: 'POST' as const,
      url: '/trips/original/family/governance/commands',
      body: { exact: ['Preserve original intent'] },
      baseUpdatedAt: 'original-base',
      status: 'conflict' as const,
      attempts: 3,
      createdAt: 1,
      lastError: 'original',
      schemaVersion: 2,
    };
    await offlineDb.mutationQueue.put(retained);
    const created = await dayNoteRepo.create(101, 70, {
      text: 'Keep colour',
      icon: 'Ticket',
      color: '#123456',
      time: '08:00',
      sort_order: 3,
    });
    await assignmentRepo.move(101, visit, 71, 0, [visit.id, neighbor.id]);
    const rows = (await offlineDb.mutationQueue.toArray()).sort((a, b) => a.createdAt - b.createdAt);
    expect(rows[0]).toEqual(retained);
    expect(rows.slice(1)).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/trips/101/days/70/notes',
        tempId: created.note.id,
        body: { text: 'Keep colour', icon: 'Ticket', color: '#123456', time: '08:00', sort_order: 3 },
      }),
      expect.objectContaining({
        method: 'PUT',
        url: '/trips/101/assignments/501/move',
        body: { new_day_id: 71, order_index: 0 },
      }),
      expect.objectContaining({
        method: 'PUT',
        url: '/trips/101/days/71/assignments/reorder',
        body: { orderedIds: [501, 502] },
      }),
    ]);
    expect((await offlineDb.days.get(71))?.assignments?.map((v) => v.id)).toEqual([501, 502]);
  });
});
