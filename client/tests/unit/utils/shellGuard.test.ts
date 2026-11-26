/**
 * public/shell-guard.js (#2524): the classic boot script that recovers a shell
 * whose entry module cannot load. It is not a module, so it is run here from its
 * source, the way the browser runs it from index.html.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Mock } from 'vitest';

const SOURCE = readFileSync(resolve(process.cwd(), 'public/shell-guard.js'), 'utf8');
const ENTRY = '/assets/index-BZcJ9-lk.js';
const MARKER = 'trek:shell-reload';

type Listener = [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined];
let listeners: Listener[] = [];
let scripts: HTMLElement[] = [];
let onlineListeners: Listener[] = [];

/** Runs the guard and keeps its listeners, so every test starts with exactly one set. */
function runGuard(): void {
  const online = vi.spyOn(window, 'addEventListener');
  const add = vi.spyOn(document, 'addEventListener');
  new Function(SOURCE)();
  listeners = add.mock.calls.map(call => call as unknown as Listener);
  add.mockRestore();
  onlineListeners = online.mock.calls.filter(call => call[0] === 'online').map(call => call as unknown as Listener);
  online.mockRestore();
}

function moduleScript(src: string, type = 'module'): HTMLScriptElement {
  const el = document.createElement('script');
  el.type = type;
  el.src = src;
  document.head.appendChild(el);
  scripts.push(el);
  return el;
}

function fail(el: Element): void {
  el.dispatchEvent(new Event('error'));
}

/** Lets the guard's promise chain run to its end. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0));
}

function healthAnswer(ok: boolean, type: string) {
  return { ok, headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? type : null) } };
}

interface Env {
  replace: ReturnType<typeof vi.fn>;
  fetch: Mock<() => Promise<ReturnType<typeof healthAnswer>>>;
  unregister: ReturnType<typeof vi.fn>;
  deleted: string[];
}

/** A page a service worker served, unless `controlled` is false. */
function install(href = 'http://localhost/trips/4?tab=plan#day-2', controlled = true): Env {
  const replace = vi.fn();
  Object.defineProperty(window, 'location', { value: { ...window.location, href, replace }, writable: true, configurable: true });
  const fetch = vi.fn(async () => healthAnswer(true, 'application/json; charset=utf-8'));
  vi.stubGlobal('fetch', fetch);
  const unregister = vi.fn(async () => true);
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { controller: controlled ? { scriptURL: 'http://localhost/sw.js' } : null, getRegistration: vi.fn(async () => ({ unregister, scope: 'http://localhost/' })) },
    configurable: true,
  });
  const deleted: string[] = [];
  Object.defineProperty(globalThis, 'caches', {
    value: {
      keys: vi.fn(async () => ['workbox-precache-v2-http://localhost/', 'map-tiles', 'gl-map-offline', 'user-uploads']),
      delete: vi.fn(async (name: string) => { deleted.push(name); return true; }),
    },
    configurable: true,
  });
  return { replace, fetch, unregister, deleted };
}

const originalLocation = Object.getOwnPropertyDescriptor(window, 'location');

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  for (const [type, fn, options] of listeners) document.removeEventListener(type, fn, options);
  listeners = [];
  for (const [type, fn, options] of onlineListeners) window.removeEventListener(type, fn, options);
  onlineListeners = [];
  document.getElementById('trek-shell-recovery')?.remove();
  for (const el of scripts) el.remove();
  scripts = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(globalThis, 'caches');
  if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
});

describe('shell-guard.js', () => {
  it('FE-SHELLGUARD-001: strips the fresh-reload parameter and keeps the rest of the URL', () => {
    window.history.replaceState({ usr: 1 }, '', '/trips/4?tab=plan&trek-reload=mfz3x1&x=2#day-2');
    runGuard();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/trips/4?tab=plan&x=2#day-2');
    expect(window.history.state).toEqual({ usr: 1 });
    window.history.replaceState(null, '', '/');
  });

  it('FE-SHELLGUARD-002: leaves a URL without the parameter alone', () => {
    window.history.replaceState(null, '', '/dashboard?tab=trips');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    runGuard();
    expect(replaceState).not.toHaveBeenCalled();
    window.history.replaceState(null, '', '/');
  });

  it('FE-SHELLGUARD-003: an entry that cannot load drops the app shell and loads the page afresh', async () => {
    const env = install();
    vi.spyOn(Date, 'now').mockReturnValue(1790358416100);
    runGuard();
    fail(moduleScript(ENTRY));
    await vi.waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1));

    expect(env.fetch).toHaveBeenCalledWith('/api/health', expect.objectContaining({ cache: 'no-store', redirect: 'manual' }));
    // Only the precache: offline map regions and cached uploads were downloaded on purpose.
    expect(env.deleted).toEqual(['workbox-precache-v2-http://localhost/']);
    expect(env.unregister).toHaveBeenCalledTimes(1);
    const target = new URL(env.replace.mock.calls[0][0] as string);
    expect(target.pathname + target.hash).toBe('/trips/4#day-2');
    expect(target.searchParams.get('tab')).toBe('plan');
    expect(target.searchParams.get('trek-reload')).toBe((1790358416100).toString(36));
  });

  it.each([
    ['offline', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a proxy login page', async () => healthAnswer(true, 'text/html')],
    ['a server error', async () => healthAnswer(false, 'application/json')],
  ])('FE-SHELLGUARD-004: keeps the shell when the server does not answer (%s)', async (_case, answer) => {
    const env = install();
    env.fetch.mockImplementation(answer);
    runGuard();
    fail(moduleScript(ENTRY));
    await settle();
    // Offline, the precache is the only way the app starts at all.
    expect(env.fetch).toHaveBeenCalledTimes(1);
    expect(env.deleted).toEqual([]);
    expect(env.unregister).not.toHaveBeenCalled();
    expect(env.replace).not.toHaveBeenCalled();
    // Nothing was tried, so a later load may still recover.
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });

  it('FE-SHELLGUARD-005: recovers once per session, so a broken build cannot loop', async () => {
    const env = install();
    runGuard();
    fail(moduleScript(ENTRY));
    await vi.waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1));

    // The reloaded page fails the same way: the marker is still set.
    fail(moduleScript(ENTRY));
    await settle();
    expect(env.fetch).toHaveBeenCalledTimes(1);
    expect(env.replace).toHaveBeenCalledTimes(1);
  });

  it('FE-SHELLGUARD-006: an entry that loaded clears the marker, so a later update may recover too', async () => {
    const env = install();
    sessionStorage.setItem(MARKER, '1790358416100');
    runGuard();
    moduleScript(ENTRY).dispatchEvent(new Event('load'));
    expect(sessionStorage.getItem(MARKER)).toBeNull();

    fail(moduleScript(ENTRY));
    await vi.waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1));
  });

  it('FE-SHELLGUARD-007: does nothing without session storage, where it could not stop a loop', async () => {
    const env = install();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    runGuard();
    fail(moduleScript(ENTRY));
    await settle();
    expect(env.fetch).not.toHaveBeenCalled();
    expect(env.replace).not.toHaveBeenCalled();
  });

  it('FE-SHELLGUARD-008: still reloads when dropping the shell fails', async () => {
    const env = install();
    env.unregister.mockRejectedValue(new Error('InvalidStateError'));
    runGuard();
    fail(moduleScript(ENTRY));
    await vi.waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1));
  });

  it('FE-SHELLGUARD-011: a page that came from the network is reloaded afresh and its worker kept', async () => {
    // Nothing the worker keeps answered this load, so throwing it away would only
    // cost the offline shell.
    const env = install('http://localhost/dashboard', false);
    runGuard();
    fail(moduleScript(ENTRY));
    await vi.waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1));
    expect(env.deleted).toEqual([]);
    expect(env.unregister).not.toHaveBeenCalled();
    expect(new URL(env.replace.mock.calls[0][0] as string).searchParams.has('trek-reload')).toBe(true);
  });

  it('FE-SHELLGUARD-009: works where there is no service worker and no Cache Storage', async () => {
    const env = install();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(globalThis, 'caches');
    runGuard();
    fail(moduleScript(ENTRY));
    // A proxy that kept a stale index.html is bypassed by the fresh URL alone.
    await vi.waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1));
  });

  it('FE-SHELLGUARD-010: ignores every other failure', async () => {
    const env = install();
    runGuard();
    // Vite's dev entry, a classic script, a lazy chunk's stylesheet, an image.
    fail(moduleScript('/src/main.tsx'));
    fail(moduleScript('/registerSW.js', 'text/javascript'));
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/DashboardPage-v4ODOTOr.css';
    document.head.appendChild(link);
    scripts.push(link);
    fail(link);
    const img = document.createElement('img');
    img.src = '/uploads/covers/missing.jpg';
    document.body.appendChild(img);
    scripts.push(img);
    fail(img);
    // A runtime error of the app is an ErrorEvent on window, not a failed script.
    window.dispatchEvent(new Event('error'));
    await settle();
    expect(env.fetch).not.toHaveBeenCalled();
    expect(env.replace).not.toHaveBeenCalled();
  });

  it('FE-SHELLGUARD-012: a static host without API health still offers an explicit non-destructive retry', async () => {
    const env = install();
    env.fetch.mockResolvedValue(healthAnswer(false, 'text/html'));
    runGuard();
    fail(moduleScript(ENTRY));
    await settle();
    const fallback = document.getElementById('trek-shell-recovery');
    expect(fallback?.getAttribute('role')).toBe('alert');
    expect(fallback?.textContent).toContain('Your saved work has not been removed.');
    fallback?.querySelector('button')?.click();
    expect(env.replace).toHaveBeenCalledTimes(1);
    expect(env.deleted).toEqual([]);
    expect(env.unregister).not.toHaveBeenCalled();
  });

  it('FE-SHELLGUARD-013: an offline entry failure retries once on reconnect without clearing any cache', async () => {
    const env = install();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    env.fetch.mockRejectedValue(new TypeError('Offline'));
    runGuard();
    fail(moduleScript(ENTRY));
    await settle();
    expect(document.getElementById('trek-shell-recovery')?.textContent).toContain('You appear to be offline');
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));
    expect(env.replace).toHaveBeenCalledTimes(1);
    expect(env.deleted).toEqual([]);
    expect(env.unregister).not.toHaveBeenCalled();
    expect(env.fetch).toHaveBeenCalledTimes(1);
  });

  it('FE-SHELLGUARD-014: reconnect without an entry failure never reloads a running app', () => {
    const env = install();
    runGuard();
    window.dispatchEvent(new Event('online'));
    expect(env.replace).not.toHaveBeenCalled();
    expect(document.getElementById('trek-shell-recovery')).toBeNull();
  });

  it('FE-SHELLGUARD-015: a successful entry retires its fallback and reconnect retry', async () => {
    const env = install();
    env.fetch.mockRejectedValue(new TypeError('Offline'));
    runGuard();
    const entry = moduleScript(ENTRY);
    fail(entry);
    await settle();
    expect(document.getElementById('trek-shell-recovery')).not.toBeNull();
    entry.dispatchEvent(new Event('load'));
    expect(document.getElementById('trek-shell-recovery')).toBeNull();
    window.dispatchEvent(new Event('online'));
    expect(env.replace).not.toHaveBeenCalled();
  });

  it('FE-SHELLGUARD-016: a failed automatic retry leaves the manual action available without looping', async () => {
    const env = install();
    sessionStorage.setItem(MARKER, 'previous-attempt');
    runGuard();
    fail(moduleScript(ENTRY));
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(env.fetch).not.toHaveBeenCalled();
    expect(env.replace).not.toHaveBeenCalled();
    document.getElementById('trek-shell-recovery')?.querySelector('button')?.click();
    expect(env.replace).toHaveBeenCalledTimes(1);
    expect(env.deleted).toEqual([]);
  });

  it('FE-SHELLGUARD-017: the early fallback does not cover an already rendered application', async () => {
    const env = install();
    env.fetch.mockRejectedValue(new TypeError('Offline'));
    const root = document.createElement('div');
    root.id = 'root';
    root.appendChild(document.createElement('p'));
    document.body.appendChild(root);
    scripts.push(root);
    runGuard();
    fail(moduleScript(ENTRY));
    await settle();
    expect(document.getElementById('trek-shell-recovery')).toBeNull();
    expect(root.childElementCount).toBe(1);
  });

  it('FE-SHELLGUARD-018: blocked session storage still permits an explicit retry, never automatic reload', async () => {
    const env = install();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    runGuard();
    fail(moduleScript(ENTRY));
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(env.replace).not.toHaveBeenCalled();
    document.getElementById('trek-shell-recovery')?.querySelector('button')?.click();
    expect(env.replace).toHaveBeenCalledTimes(1);
    expect(env.deleted).toEqual([]);
  });


  it('FE-SHELLGUARD-019: a late health result cannot clear the cache after the entry recovered', async () => {
    const env = install();
    let answer: ((value: ReturnType<typeof healthAnswer>) => void) | undefined;
    const pending = new Promise<ReturnType<typeof healthAnswer>>(resolve => { answer = resolve; });
    env.fetch.mockReturnValue(pending);
    runGuard();
    const entry = moduleScript(ENTRY);
    fail(entry);
    expect(env.fetch).toHaveBeenCalledTimes(1);
    entry.dispatchEvent(new Event('load'));
    if (!answer) throw new Error('Expected a pending health reply');
    answer(healthAnswer(true, 'application/json'));
    await settle();
    expect(env.replace).not.toHaveBeenCalled();
    expect(env.deleted).toEqual([]);
    expect(env.unregister).not.toHaveBeenCalled();
  });

  it('FE-SHELLGUARD-020: explicit static retry requires validated network proof before deleting only its own public shell', async () => {
    const env = install();
    env.fetch.mockResolvedValue(healthAnswer(false, 'text/html'));
    const read = vi.fn(async () => ({ format: 'family.build.v1' }));
    vi.stubGlobal('FamilyBuildContract', { read });
    vi.mocked(caches.keys).mockResolvedValue([
      'workbox-precache-v2-http://localhost/',
      'workbox-precache-v2-http://localhost/other/',
      'map-tiles',
      'user-uploads',
    ]);
    runGuard();
    fail(moduleScript(ENTRY));
    await settle();
    expect(env.deleted).toEqual([]);
    document.getElementById('trek-shell-recovery')?.querySelector('button')?.click();
    await vi.waitFor(() => expect(env.replace).toHaveBeenCalledTimes(1));
    expect(read).toHaveBeenCalledWith(expect.any(Function), 'http://localhost', { verifyEntry: true });
    expect(env.deleted).toEqual(['workbox-precache-v2-http://localhost/']);
    expect(env.unregister).toHaveBeenCalledTimes(1);
  });
  it.each(['missing', 'invalid', 'rejected'])(
    'FE-SHELLGUARD-021: %s static proof cannot delete any cache',
    async (reason) => {
      const env = install();
      env.fetch.mockResolvedValue(healthAnswer(false, 'text/html'));
      const read = vi.fn(async () => {
        if (reason === 'rejected') throw new Error('Unavailable');
        return null;
      });
      vi.stubGlobal('FamilyBuildContract', reason === 'missing' ? undefined : { read });
      runGuard();
      fail(moduleScript(ENTRY));
      await settle();
      document.getElementById('trek-shell-recovery')?.querySelector('button')?.click();
      await settle();
      expect(env.deleted).toEqual([]);
      expect(env.unregister).not.toHaveBeenCalled();
    }
  );
  it('FE-SHELLGUARD-022: late static proof and duplicate clicks cannot clear a recovered entry', async () => {
    const env = install();
    env.fetch.mockResolvedValue(healthAnswer(false, 'text/html'));
    let finish: ((value: unknown) => void) | undefined;
    const read = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    vi.stubGlobal('FamilyBuildContract', { read });
    runGuard();
    const entry = moduleScript(ENTRY);
    fail(entry);
    await settle();
    const button = document.getElementById('trek-shell-recovery')?.querySelector('button');
    button?.click();
    button?.click();
    expect(read).toHaveBeenCalledTimes(1);
    entry.dispatchEvent(new Event('load'));
    if (!finish) throw new Error('Expected a pending static build proof');
    finish({ format: 'family.build.v1' });
    await settle();
    expect(env.deleted).toEqual([]);
    expect(env.unregister).not.toHaveBeenCalled();
    expect(env.replace).not.toHaveBeenCalled();
  });
  it('FE-SHELLGUARD-023: an unrelated controlling worker registration never authorizes cache removal', async () => {
    const env = install();
    env.fetch.mockResolvedValue(healthAnswer(false, 'text/html'));
    vi.mocked(navigator.serviceWorker.getRegistration).mockResolvedValue({
      scope: 'http://localhost/other/',
      unregister: env.unregister,
    } as unknown as ServiceWorkerRegistration);
    vi.stubGlobal('FamilyBuildContract', { read: vi.fn(async () => ({ format: 'family.build.v1' })) });
    runGuard();
    fail(moduleScript(ENTRY));
    await settle();
    document.getElementById('trek-shell-recovery')?.querySelector('button')?.click();
    await settle();
    expect(env.deleted).toEqual([]);
    expect(env.unregister).not.toHaveBeenCalled();
  });
  it('FE-SHELLGUARD-024: denied session storage still permits one explicit validated repair with no automatic loop', async () => {
    const env = install();
    env.fetch.mockResolvedValue(healthAnswer(false, 'text/html'));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Denied');
    });
    vi.stubGlobal('FamilyBuildContract', { read: vi.fn(async () => ({ format: 'family.build.v1' })) });
    runGuard();
    fail(moduleScript(ENTRY));
    await settle();
    expect(env.replace).not.toHaveBeenCalled();
    document.getElementById('trek-shell-recovery')?.querySelector('button')?.click();
    await settle();
    expect(env.deleted).toEqual(['workbox-precache-v2-http://localhost/']);
    expect(env.replace).toHaveBeenCalledTimes(1);
  });

});
