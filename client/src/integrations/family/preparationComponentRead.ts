import { liveQuery } from 'dexie';
import { onPrivateSessionEnd } from '../../db/privateSessionEvents';
import type { PreparedFileRead } from '../../repo/preparedFilePreview';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline, onNetworkModeChange } from '../../sync/networkMode';
import { onFamilyActorChange } from './actorContext';
import type { admitCompletePreparation } from './completePreparationAdmission';
import type { StoredCompleteTrip } from './completeTripV4';

/** Shared lifecycle of online preparation components; preserves the original image guards. */
export async function attachPreparationComponent<T extends { dispose: () => void }, E extends StoredCompleteTrip>(
  admission: Omit<Awaited<ReturnType<typeof admitCompletePreparation>>, 'envelope'> & { envelope: E },
  create: (read: Omit<PreparedFileRead, 'envelope'> & { envelope: E; current: () => boolean }) => T,
  failure: () => Error
) {
  const { envelope, read, check, observe, serialized, repo, trip, native, state } = admission;
  const deadline = performance.now() + Math.max(0, envelope.expiresAt - Date.now());
  const cleanup: (() => void)[] = [];
  let component: T | undefined;
  function dispose() {
    if (state.ended) return;
    state.ended = true;
    component?.dispose();
    for (const stop of cleanup) stop();
  }
  function checkRead() {
    check();
    if (Date.now() < envelope.verifiedAt || Date.now() >= envelope.expiresAt || performance.now() >= deadline)
      throw failure();
  }
  const verify = async () => {
    try {
      checkRead();
      const next = await observe();
      checkRead();
      if (JSON.stringify(next) !== serialized) throw failure();
    } catch (error) {
      dispose();
      throw error;
    }
  };
  try {
    component = create({
      envelope,
      check: checkRead,
      verify,
      current: () => {
        try {
          checkRead();
          return true;
        } catch {
          return false;
        }
      },
    });
    cleanup.push(
      onFamilyActorChange(dispose),
      onPrivateSessionEnd(dispose),
      onNetworkModeChange(() => {
        if (isEffectivelyOffline()) dispose();
      }),
      repo.subscribeContext((id) => {
        if (!id || id === trip) dispose();
      }),
      useTripStore.subscribe((state) => {
        if (state.trip?.id !== native) dispose();
      })
    );
    const scopeWatch = setInterval(() => {
      try {
        checkRead();
      } catch {
        dispose();
      }
    }, 1000);
    cleanup.push(() => clearInterval(scopeWatch));
    const timer = setTimeout(dispose, Math.max(0, envelope.expiresAt - Date.now()));
    cleanup.push(() => clearTimeout(timer));
    const watch = liveQuery(async () => {
      await read.db.mutationQueue.toArray();
      await read.db.importFiles.count();
      await verify();
    }).subscribe({ error: dispose });
    cleanup.push(() => watch.unsubscribe());
    await verify();
    return { ...component, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
