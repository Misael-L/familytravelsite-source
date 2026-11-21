import { liveQuery } from 'dexie';
import { onPrivateSessionEnd } from '../../db/privateSessionEvents';
import { currentFilePreviewPort, onFilePreviewChange } from '../../repo/filePreview';
import { installPreparedFilePool } from '../../repo/preparedFilePreview';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline, onNetworkModeChange } from '../../sync/networkMode';
import { onFamilyActorChange } from './actorEvents';
import { admitPrivateFilePreparation } from './completePreparationAdmission';
import { openCoherentTripRead, openCompleteTripRead } from './completeTripRead';
import { acquirePreparationFile } from './privateFileAcquisition';
import { createPrivateFileMemory } from './privateFileMemory';
import { familyFrontend, type FamilyFrontendRepository } from './repository';
import { installSavedPrivateFiles } from './savedPrivateFiles';
/** Explicit local online admission; retained RAM bytes require an independently admitted saved read. */
export async function openPrivateFilePreparation(
  value: number | string,
  repo: FamilyFrontendRepository = familyFrontend,
  network: typeof fetch = fetch
) {
  const a = await admitPrivateFilePreparation(value, repo),
    provider = currentFilePreviewPort(),
    cleanup: (() => void)[] = [];
  let ended = false;
  const verify = async (saved = false) => {
    (saved ? a.checkOwner : a.check)();
    const observed = await (saved ? a.observeOwner() : a.observe());
    (saved ? a.checkOwner : a.check)();
    if (JSON.stringify(observed) !== a.serialized) throw new Error('The original file preparation generation changed.');
  };
  const pool = createPrivateFileMemory({ envelope: a.envelope, check: a.checkOwner }, (fileId, signal) => {
    let listed = false;
    return acquirePreparationFile({
      repo,
      fileId,
      signal,
      intent: 'user-request',
      network,
      read: {
        envelope: a.envelope,
        check: a.check,
        verify: async () => {
          await verify();
          if (!listed) {
            await repo.fileList(a.trip);
            listed = true;
            await verify();
          }
        },
      },
    });
  });
  function dispose() {
    if (ended) return;
    ended = true;
    a.state.ended = true;
    pool.dispose();
    for (const stop of cleanup) stop();
  }
  try {
    cleanup.push(installPreparedFilePool({ borrow: pool.borrow, inspect: pool.inspect, dispose }));
    watchPreparation({ a, pool, provider, verify, dispose, cleanup });
    await verify();
    return {
      prepare: async (
        intent: 'user-request',
        fileId: string,
        options?: { signal?: AbortSignal; refresh?: boolean }
      ) => {
        await verify();
        return pool.prepare(intent, fileId, options);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

function watchPreparation({
  a,
  pool,
  provider,
  verify,
  dispose,
  cleanup,
}: {
  a: Awaited<ReturnType<typeof admitPrivateFilePreparation>>;
  pool: ReturnType<typeof createPrivateFileMemory>;
  provider: ReturnType<typeof currentFilePreviewPort>;
  verify: (saved?: boolean) => Promise<void>;
  dispose: () => void;
  cleanup: (() => void)[];
}) {
  let offline = false;
  const warm = async () => {
    const saved = await (a.envelope.format === 'family.offline-trip.v4'
      ? openCoherentTripRead(a.trip)
      : openCompleteTripRead(a.trip));
    try {
      a.checkOwner();
      if (
        a.state.ended ||
        saved.envelope.generation !== a.envelope.generation ||
        saved.envelope.digest !== a.envelope.digest
      )
        throw new Error('The prepared file generation changed.');
      const release = installSavedPrivateFiles({
        envelope: saved.envelope,
        check: saved.check,
        verify: () => saved.publish(() => {}),
      });
      cleanup.push(() => {
        release.retire();
        saved.close();
      });
    } catch (error) {
      saved.close();
      throw error;
    }
  };
  cleanup.push(
    onFamilyActorChange(dispose),
    onPrivateSessionEnd(dispose),
    a.repo.subscribeContext((trip) => {
      if (!trip || trip === a.trip) dispose();
    }),
    onFilePreviewChange(() => {
      if (currentFilePreviewPort() !== provider) dispose();
    }),
    useTripStore.subscribe((s) => {
      if (s.trip?.id !== a.native && (!isEffectivelyOffline() || s.trip !== null)) dispose();
    }),
    onNetworkModeChange(() => {
      if (isEffectivelyOffline()) {
        offline = true;
        pool.cancelPending();
        void warm().catch(dispose);
      } else if (offline) dispose();
    })
  );
  const watcher = liveQuery(async () => {
    await a.read.db.mutationQueue.toArray();
    await a.read.db.importFiles.count();
    await verify(true);
  }).subscribe({ error: dispose });
  cleanup.push(() => watcher.unsubscribe());
  const timer = setInterval(() => {
    try {
      a.checkOwner();
      if (a.state.ended) throw Error('Retired');
    } catch {
      dispose();
    }
  }, 1000);
  const expiry = setTimeout(dispose, Math.max(0, a.envelope.expiresAt - Date.now()));
  cleanup.push(
    () => clearInterval(timer),
    () => clearTimeout(expiry)
  );
}
