const { window, crypto, document, location, navigator, URL, URLSearchParams, fetch } = globalThis;
import Dexie from 'dexie';
import { currentOfflineDatabase, invalidateOfflineSession, reopenForUser } from '../../../src/db/offlineDb.ts';
import { guardedPlannerCache, plannerCacheDb } from '../../../src/integrations/family/plannerCache.ts';
import { guardedPlannerRead } from '../../../src/integrations/family/plannerReadGuard.ts';
import { activateFamilyFrontend } from '../../../src/integrations/family/runtime.ts';
import { setAuthed } from '../../../src/sync/authGate.ts';
import { isForcedOffline, setForcedOffline } from '../../../src/sync/networkMode.ts';
import { watchQueueStatus } from '../../../src/sync/queueStatus.ts';
import { captureReadSession } from '../../../src/sync/readSession.ts';

activateFamilyFrontend();
const previous = new URLSearchParams(location.search).has('previous');
const moduleUrl =
  new URL('../../../src/sync/mutationQueue.ts', import.meta.url).href + (previous ? '?p04ap-previous' : '');
const { mutationQueue } = await import(/* @vite-ignore */ moduleUrl);
const uuid = (n) => `d0400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { user_id: uuid(90), family_id: uuid(2), person_id: uuid(91), trip_id: uuid(1), layer: 'published' };
const source = 'https://cohort-fixture.invalid';
const pair = (revision) => ({
  view: {
    version: 1,
    scope,
    state: {
      version: 1,
      trip_id: scope.trip_id,
      family_id: scope.family_id,
      trip_revision: revision,
      locations: [],
      days: [],
      visits: [],
      notes: [],
      destinations: [],
    },
    operations: [],
    bindings: [],
    draft_token: null,
    readiness: { ready: true, blockers: [] },
  },
  variants: [],
});
let releaseCache = () => {},
  holdCache = false;
const put = plannerCacheDb.snapshots.put.bind(plannerCacheDb.snapshots);
plannerCacheDb.snapshots.put = async (row) => {
  if (holdCache) {
    fixture.cacheEntered = true;
    await Dexie.waitFor(
      new Promise((resolve) => {
        releaseCache = resolve;
      })
    );
  }
  return put(row);
};
let unwatch = () => {},
  release = () => {};
const fixture = {
  status: null,
  done: true,
  error: null,
  async select(user = 'p04ap-browser-A') {
    unwatch();
    await reopenForUser(user);
    setAuthed(true);
    unwatch = watchQueueStatus(
      (value) => {
        fixture.status = value;
        document.querySelector('output').textContent = JSON.stringify(value);
      },
      () => {
        fixture.error = 'status-read';
      },
      () => {
        fixture.status = null;
      }
    );
  },
  async seed(over = {}) {
    const row = {
      id: crypto.randomUUID(),
      tripId: 1,
      method: 'POST',
      url: '/trips/1/family/planner-editor-command',
      body: { name: 'Synthetic browser edit' },
      baseUpdatedAt: 'Original browser token',
      status: 'pending',
      attempts: 0,
      createdAt: Date.now(),
      lastError: null,
      schemaVersion: 2,
      ...over,
    };
    await currentOfflineDatabase().mutationQueue.put(row);
    return row;
  },
  async seedCache(revision = 1) {
    await plannerCacheDb.snapshots.put({
      key: JSON.stringify([1, source, scope.user_id, scope.family_id, scope.person_id, scope.trip_id, scope.layer]),
      storedAt: 1,
      value: pair(revision),
    });
    fixture.visible = revision;
  },
  cacheRows: () => plannerCacheDb.snapshots.toArray(),
  holdCache: () => {
    holdCache = true;
    fixture.cacheEntered = false;
  },
  releaseCache: () => {
    holdCache = false;
    releaseCache();
  },
  startRead() {
    fixture.readDone = false;
    fixture.readError = null;
    const owner = captureReadSession(),
      target = { uuid: scope.trip_id, native: 1 },
      blocked = () => new Error('Local work held');
    void guardedPlannerRead(owner, target, blocked, async (guard) => {
      const cache = await guardedPlannerCache(guard, source, scope, Date.now, blocked);
      const remote = await (await fetch('/api/view')).json();
      await guardedPlannerRead(
        owner,
        target,
        blocked,
        async (nested) => {
          await cache.write(pair(remote.revision), () => owner.assertCurrent());
          await nested.commit(() => {
            fixture.visible = remote.revision;
          });
        },
        guard
      );
    })
      .catch((error) => {
        fixture.readError = error.message;
      })
      .finally(() => {
        fixture.readDone = true;
      });
  },
  queueAsync() {
    fixture.queueDone = false;
    void fixture
      .seed()
      .then((row) => {
        fixture.queuedOriginal = row;
      })
      .finally(() => {
        fixture.queueDone = true;
      });
  },
  rows: () => currentOfflineDatabase().mutationQueue.toArray(),
  async hold() {
    await new Promise((acquired) => {
      void navigator.locks.request(
        `trek-mutation-flush:${currentOfflineDatabase().name}`,
        () =>
          new Promise((done) => {
            release = done;
            acquired();
          })
      );
    });
  },
  release: () => release(),
  start() {
    fixture.done = false;
    fixture.error = null;
    void mutationQueue
      .flush()
      .catch((error) => {
        fixture.error = error.name;
      })
      .finally(() => {
        fixture.done = true;
      });
  },
  force: setForcedOffline,
  forced: isForcedOffline,
  retire: invalidateOfflineSession,
};
window.fixture = fixture;
await fixture.select();
fixture.ready = true;
