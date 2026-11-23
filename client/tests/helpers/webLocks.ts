/** Synthetic shared/exclusive Web Locks; real browser coordination has a separate localhost harness. */
export function installTestLocks() {
  type Job = { mode: LockMode; run: () => void };
  const states = new Map<string, { held: LockMode[]; waiting: Job[] }>();
  const request = (
    name: string,
    options: LockOptions | LockGrantedCallback<unknown>,
    callback?: LockGrantedCallback<unknown>
  ) => {
    const action = typeof options === 'function' ? options : callback;
    const signal = typeof options === 'function' ? undefined : options.signal;
    const mode = typeof options === 'function' ? 'exclusive' : (options.mode ?? 'exclusive');
    const state = states.get(name) ?? { held: [], waiting: [] };
    states.set(name, state);
    const pump = () => {
      while (state.waiting.length && !state.held.includes('exclusive')) {
        if (state.waiting[0].mode === 'exclusive' && state.held.length) return;
        state.waiting.shift()?.run();
      }
    };
    return new Promise<unknown>((resolve, reject) => {
      let granted = false;
      const abort = () => {
        if (granted) return;
        state.waiting = state.waiting.filter((item) => item !== job);
        reject(new DOMException('Aborted', 'AbortError'));
        pump();
      };
      const job: Job = {
        mode,
        run: () => {
          granted = true;
          signal?.removeEventListener('abort', abort);
          state.held.push(mode);
          void Promise.resolve()
            .then(() => action?.({ name, mode } as Lock))
            .then(resolve, reject)
            .finally(() => {
              state.held.splice(state.held.indexOf(mode), 1);
              pump();
            });
        },
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });
      state.waiting.push(job);
      pump();
    });
  };
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
}
