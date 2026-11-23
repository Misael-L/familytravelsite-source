import type { StayActionScope, useStayActionScope } from '../Planner/stayActionScope';
export interface LinkState<P> {
  token: string | null;
  loading: boolean;
  busy: boolean;
  perms: P;
}

/** One view's private link state; queued commands cannot start after its owner ends. */
export function createLinkLifetime<P extends Record<string, boolean>>(
  capture: ReturnType<typeof useStayActionScope>,
  initial: LinkState<P>,
  publish: (state: LinkState<P>) => void
) {
  let state = { ...initial, perms: { ...initial.perms } },
    revision = 0,
    reads = 0,
    pending = 0;
  let chain = Promise.resolve();
  const jobs = new Map<string, Promise<void>>();
  let lastKey: string | undefined;
  const peek = () => ({ ...state, perms: { ...state.perms } });
  const change = (patch: Partial<LinkState<P>>) => {
    if (!capture().current()) return;
    state = { ...state, ...patch };
    publish(peek());
  };
  const load = async <T>(request: () => Promise<T>, project: (value: T) => Partial<LinkState<P>>) => {
    const version = revision,
      read = ++reads;
    const action = capture(() => version === revision && read === reads);
    try {
      const value = await action.perform(request);
      action.effect(() => change(project(value)));
    } catch {
      /* A missing or refused link keeps the native empty state. */
    } finally {
      action.effect(() => change({ loading: false }));
    }
  };
  const execute = (
    key: string | undefined,
    operation: (action: StayActionScope) => Promise<void>,
    failure: () => void
  ) => {
    const existing = key !== undefined && key === lastKey ? jobs.get(key) : undefined;
    if (existing !== undefined) return existing;
    const action = capture();
    if (!action.current()) return Promise.resolve();
    lastKey = key;
    revision++;
    pending++;
    change({ loading: false, busy: true });
    const task = chain
      .then(() => action.perform(() => operation(action)))
      .catch(() => action.effect(failure))
      .finally(() => {
        pending--;
        if (key && jobs.get(key) === task) jobs.delete(key);
        change({ busy: pending > 0 });
      });
    chain = task;
    if (key) jobs.set(key, task);
    return task;
  };
  const stage = (perms: P) => {
    revision++;
    change({ perms, loading: false });
  };
  return { peek, change, load, execute, stage };
}
