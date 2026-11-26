import { useServerVersionStore } from '../../store/serverVersionStore';
import { isEffectivelyOffline } from '../../sync/networkMode';

export type BuildDescriptor = Readonly<{
  format: 'family.build.v1';
  version: string;
  entry: Readonly<{ path: string; bytes: number; sha256: string }>;
}>;
type BuildContract = {
  read: (
    fetcher: typeof fetch,
    origin: string,
    options?: { signal?: AbortSignal; verifyEntry?: boolean }
  ) => Promise<BuildDescriptor | null>;
};
declare global {
  var FamilyBuildContract: BuildContract | undefined;
}

/** Public deployment observation never grants identity, membership or replay authority. */
export function createFamilyReleaseObserver(
  fetcher: typeof fetch,
  source: () => string,
  options: {
    window?: Window;
    document?: Document;
    offline?: () => boolean;
    report?: (version: string) => void;
    contract?: () => BuildContract | undefined;
  } = {}
) {
  const host = options.window ?? window,
    document = options.document ?? host.document;
  const offline = options.offline ?? isEffectivelyOffline;
  const report =
    options.report ??
    ((version: string) => {
      if (useServerVersionStore.getState().first !== null) useServerVersionStore.getState().note(version);
    });
  const contract = options.contract ?? (() => globalThis.FamilyBuildContract);
  let disposed = false,
    pending: Promise<string | null> | undefined,
    active: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined,
    started = 0;
  async function readVersion(signal?: AbortSignal): Promise<string | null> {
    if (disposed || offline() || signal?.aborted) return null;
    if (pending === undefined) {
      const originalSource = source(),
        controller = new AbortController();
      active = controller;
      started = Date.now();
      const task = (async () => {
        try {
          const value = await contract()?.read(fetcher, host.location.origin, { signal: controller.signal });
          return !disposed && !controller.signal.aborted && !offline() && source() === originalSource
            ? (value?.version ?? null)
            : null;
        } catch {
          return null;
        }
      })();
      pending = task;
      void task.finally(() => {
        if (pending === task) {
          pending = undefined;
          active = undefined;
        }
      });
    }
    const task = pending;
    if (!signal) return task;
    return new Promise((resolve) => {
      const abort = () => resolve(null);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      void task
        .then((v) => resolve(signal.aborted ? null : v))
        .finally(() => signal.removeEventListener('abort', abort));
    });
  }
  const trigger = () => {
    if (disposed || document.visibilityState === 'hidden' || offline() || timer) return;
    timer = setTimeout(
      () => {
        timer = undefined;
        if (disposed || document.visibilityState === 'hidden' || offline()) return;
        void readVersion().then((version) => {
          if (!disposed && !offline() && version) report(version);
        });
      },
      Math.max(200, 1000 - (Date.now() - started))
    );
  };
  let workers: ServiceWorkerContainer | undefined;
  try {
    workers = host.navigator.serviceWorker;
  } catch {
    /* optional observation must not block startup */
  }
  host.addEventListener('online', trigger);
  host.addEventListener('focus', trigger);
  document.addEventListener('visibilitychange', trigger);
  workers?.addEventListener?.('controllerchange', trigger);
  const interval = setInterval(trigger, 60000);
  return {
    readVersion,
    dispose() {
      if (disposed) return;
      disposed = true;
      active?.abort();
      clearTimeout(timer);
      clearInterval(interval);
      host.removeEventListener('online', trigger);
      host.removeEventListener('focus', trigger);
      document.removeEventListener('visibilitychange', trigger);
      workers?.removeEventListener?.('controllerchange', trigger);
    },
  };
}
