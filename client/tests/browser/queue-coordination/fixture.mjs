const { window, crypto, document, location, navigator, URL, URLSearchParams } = globalThis;
import { currentOfflineDatabase, invalidateOfflineSession, reopenForUser } from '../../../src/db/offlineDb.ts';
import { activateFamilyFrontend } from '../../../src/integrations/family/runtime.ts';
import { setAuthed } from '../../../src/sync/authGate.ts';
import { isForcedOffline, setForcedOffline } from '../../../src/sync/networkMode.ts';
import { watchQueueStatus } from '../../../src/sync/queueStatus.ts';

activateFamilyFrontend();
const previous = new URLSearchParams(location.search).has('previous');
const moduleUrl =
  new URL('../../../src/sync/mutationQueue.ts', import.meta.url).href + (previous ? '?p04ap-previous' : '');
const { mutationQueue } = await import(/* @vite-ignore */ moduleUrl);
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
