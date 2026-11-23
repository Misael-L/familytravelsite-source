import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import retainedClient, {
  apiClient,
  isAuthPublicPath,
  parseInDev,
  postMultipart,
} from '../../../src/integrations/family/legacy/api/client';
import type { ProbeState } from '../../../src/integrations/family/legacy/sync/connectivity';

const controls = vi.hoisted(() => ({
  socket: vi.fn<() => string | null>(),
  probe: vi.fn<() => Promise<ProbeState>>(),
}));
vi.mock('../../../src/integrations/family/legacy/api/websocket', () => ({ getSocketId: controls.socket }));
vi.mock('../../../src/integrations/family/legacy/sync/connectivity', () => ({ probeNow: controls.probe }));

const originalAdapter = apiClient.defaults.adapter;
const originalLocation = Object.getOwnPropertyDescriptor(window, 'location');
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
function locationFixture() {
  return { pathname: '/trips/25', search: '?view=days', hash: '#plan', href: 'unchanged', reload: vi.fn() };
}
let location = locationFixture();
const unregister = vi.fn<() => Promise<boolean>>();
const getRegistration = vi.fn<() => Promise<{ unregister: typeof unregister }>>();
function reply(config: InternalAxiosRequestConfig, data: unknown = { transportFixture: true }): AxiosResponse<unknown> {
  return { config, data, status: 200, statusText: 'OK', headers: new AxiosHeaders() };
}
function refusal(status: number, data: unknown, headers = new AxiosHeaders()) {
  const config: InternalAxiosRequestConfig = { headers: new AxiosHeaders() };
  return new AxiosError('controlled refusal', AxiosError.ERR_BAD_RESPONSE, config, undefined, {
    config,
    data,
    status,
    statusText: 'Controlled refusal',
    headers,
  });
}
function rejectsWith(error: AxiosError<unknown>) {
  apiClient.defaults.adapter = () => Promise.reject(error);
}
beforeEach(() => {
  vi.clearAllMocks();
  controls.socket.mockReturnValue('fixture-socket');
  controls.probe.mockResolvedValue('offline');
  unregister.mockResolvedValue(true);
  getRegistration.mockResolvedValue({ unregister });
  location = locationFixture();
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: location });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration } });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  apiClient.defaults.adapter = async (config) => reply(config);
});
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
  if (originalServiceWorker) Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
  else Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('retained Family transport through its actual public entry', () => {
  it('keeps one named/default instance and one request interceptor across repeated imports', async () => {
    const again = await import('../../../src/integrations/family/legacy/api/client');
    expect(retainedClient).toBe(apiClient);
    expect(again.default).toBe(retainedClient);
    expect(again.apiClient).toBe(apiClient);
    await again.default.get('/transport-fixture');
    expect(controls.socket).toHaveBeenCalledExactlyOnceWith();
  });
  it('retains its own instance rather than replacing the separate current-native client', async () => {
    const native = await import('../../../src/api/client');
    expect(native.apiClient).not.toBe(apiClient);
  });
  it('keeps base URL, credential, timeout, JSON and socket defaults on actual dispatch', async () => {
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => reply(config));
    apiClient.defaults.adapter = adapter;
    await apiClient.get('/transport-fixture');
    const config = adapter.mock.calls[0]?.[0];
    expect(config).toMatchObject({ baseURL: '/api', withCredentials: true, timeout: 8000 });
    expect(config?.headers.get('Content-Type')).toBe('application/json');
    expect(config?.headers.get('X-Socket-Id')).toBe('fixture-socket');
  });
  it.each(['post', 'put', 'patch', 'delete'] as const)('preserves the caller operation key on %s', async (method) => {
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => reply(config));
    apiClient.defaults.adapter = adapter;
    const random = vi.spyOn(crypto, 'randomUUID');
    await apiClient.request({
      method,
      url: '/transport-fixture',
      headers: { 'X-Idempotency-Key': 'fixture-original-operation' },
    });
    expect(adapter.mock.calls[0]?.[0].headers.get('X-Idempotency-Key')).toBe('fixture-original-operation');
    expect(random).not.toHaveBeenCalled();
  });
  it('mints one operation key when a write has none', async () => {
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => reply(config));
    apiClient.defaults.adapter = adapter;
    const random = vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000016');
    await apiClient.post('/transport-fixture', {});
    expect(adapter.mock.calls[0]?.[0].headers.get('X-Idempotency-Key')).toBe('00000000-0000-4000-8000-000000000016');
    expect(random).toHaveBeenCalledTimes(1);
  });
  it('still supplies a write key when the platform UUID API is unavailable', async () => {
    vi.stubGlobal('crypto', {});
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => reply(config));
    apiClient.defaults.adapter = adapter;
    await apiClient.post('/transport-fixture', {});
    expect(adapter.mock.calls[0]?.[0].headers.get('X-Idempotency-Key')).toMatch(/^[a-z0-9]+$/);
    expect(random).toHaveBeenCalledTimes(1);
  });
  it.each(['get', 'head', 'options'] as const)('does not mint a write key on %s', async (method) => {
    const random = vi.spyOn(crypto, 'randomUUID');
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => reply(config));
    apiClient.defaults.adapter = adapter;
    await apiClient.request({ method, url: '/transport-fixture' });
    expect(adapter.mock.calls[0]?.[0].headers.has('X-Idempotency-Key')).toBe(false);
    expect(random).not.toHaveBeenCalled();
  });
  it('omits an unavailable socket ID and clears proxy reauth state after a successful response', async () => {
    controls.socket.mockReturnValue(null);
    sessionStorage.setItem('proxy_reauth_attempted', '1');
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => reply(config));
    apiClient.defaults.adapter = adapter;
    await apiClient.get('/transport-fixture');
    expect(adapter.mock.calls[0]?.[0].headers.has('X-Socket-Id')).toBe(false);
    expect(sessionStorage.getItem('proxy_reauth_attempted')).toBeNull();
  });
  it.each([
    ['/login', true],
    ['/register', true],
    ['/forgot-password', true],
    ['/reset-password', true],
    ['/shared/trip', true],
    ['/public/journey/trip', true],
    ['/dashboard', false],
    ['/login-extra', false],
    ['/native-handoff', false],
    ['/reset-password-extra', false],
  ] as const)('keeps the retained auth-path contract for %s', (path, expected) => {
    expect(isAuthPublicPath(path)).toBe(expected);
  });
  it('preserves search/hash when redirecting a private JSON auth refusal', async () => {
    const error = refusal(401, { code: 'AUTH_REQUIRED' });
    rejectsWith(error);
    await expect(apiClient.get('/transport-fixture')).rejects.toBe(error);
    expect(location.href).toBe('/login?redirect=%2Ftrips%2F25%3Fview%3Ddays%23plan');
    expect(getRegistration).not.toHaveBeenCalled();
    expect(controls.probe).not.toHaveBeenCalled();
  });
  it.each(['/login', '/shared/trip', '/public/journey/trip'])(
    'does not redirect a public JSON auth refusal on %s',
    async (path) => {
      location.pathname = path;
      const error = refusal(401, { code: 'AUTH_REQUIRED' });
      rejectsWith(error);
      await expect(apiClient.get('/transport-fixture')).rejects.toBe(error);
      expect(location.href).toBe('unchanged');
    }
  );
  it.each([
    ['/trips/25', '/settings?mfa=required'],
    ['/settings/security', 'unchanged'],
  ])('retains the MFA route rule on %s', async (path, expected) => {
    location.pathname = path;
    const error = refusal(403, { code: 'MFA_REQUIRED' });
    rejectsWith(error);
    await expect(apiClient.get('/transport-fixture')).rejects.toBe(error);
    expect(location.href).toBe(expected);
  });
  it('waits for SW unregistration before reloading an HTML auth wall and prevents a reload loop', async () => {
    let finish = () => {};
    unregister.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = () => resolve(true);
        })
    );
    const error = refusal(401, '<html>controlled proxy</html>', new AxiosHeaders({ 'content-type': 'text/html' }));
    rejectsWith(error);
    const pending = apiClient.get('/transport-fixture').catch((value: unknown) => value);
    await vi.waitFor(() => expect(unregister).toHaveBeenCalledTimes(1));
    expect(location.reload).not.toHaveBeenCalled();
    finish();
    expect(await pending).toBe(error);
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('proxy_reauth_attempted')).toBe('1');
    await expect(apiClient.get('/transport-fixture')).rejects.toBe(error);
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(getRegistration).toHaveBeenCalledTimes(1);
  });
  it('does not unregister the SW when a public page meets an HTML auth wall', async () => {
    location.pathname = '/login';
    const error = refusal(401, '<html>controlled proxy</html>', new AxiosHeaders({ 'content-type': 'text/html' }));
    rejectsWith(error);
    await expect(apiClient.get('/transport-fixture')).rejects.toBe(error);
    expect(getRegistration).not.toHaveBeenCalled();
    expect(location.reload).not.toHaveBeenCalled();
  });
  it.each(['offline', 'online'] as const)('keeps a response-free %s failure without proxy reauth', async (state) => {
    controls.probe.mockResolvedValue(state);
    const error = new AxiosError('controlled network error', AxiosError.ERR_NETWORK);
    rejectsWith(error);
    await expect(apiClient.get('/transport-fixture')).rejects.toBe(error);
    expect(controls.probe).toHaveBeenCalledTimes(1);
    expect(getRegistration).not.toHaveBeenCalled();
    expect(location.reload).not.toHaveBeenCalled();
  });
  it('does not probe a disconnected navigator', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const error = new AxiosError('controlled network error', AxiosError.ERR_NETWORK);
    rejectsWith(error);
    await expect(apiClient.get('/transport-fixture')).rejects.toBe(error);
    expect(controls.probe).not.toHaveBeenCalled();
    expect(location.reload).not.toHaveBeenCalled();
  });
  it('only a positively identified private proxy wall unregisters and reloads on a network failure', async () => {
    controls.probe.mockResolvedValue('proxy-wall');
    const error = new AxiosError('controlled network error', AxiosError.ERR_NETWORK);
    rejectsWith(error);
    await expect(apiClient.get('/transport-fixture')).rejects.toBe(error);
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(location.reload).toHaveBeenCalledTimes(1);
  });
  it('still reloads an identified proxy wall if SW cleanup itself fails', async () => {
    getRegistration.mockRejectedValueOnce(new Error('controlled cleanup failure'));
    const error = refusal(401, '<html>controlled proxy</html>', new AxiosHeaders({ 'content-type': 'text/html' }));
    rejectsWith(error);
    await expect(apiClient.get('/transport-fixture')).rejects.toBe(error);
    expect(location.reload).toHaveBeenCalledTimes(1);
  });
  it('translates a rate limit once while retaining the existing response object and other fields', async () => {
    localStorage.setItem('app_language', 'es');
    const body = { error: 'untranslated', retained: true };
    const error = refusal(429, body);
    const get = vi.spyOn(Storage.prototype, 'getItem');
    rejectsWith(error);
    await expect(apiClient.get('/transport-fixture')).rejects.toBe(error);
    expect(error.response?.data).toBe(body);
    expect(body).toEqual({ error: 'Demasiados intentos. Inténtelo de nuevo más tarde.', retained: true });
    expect(error.message).toBe('Demasiados intentos. Inténtelo de nuevo más tarde.');
    expect(get.mock.calls.filter(([key]) => key === 'app_language')).toHaveLength(1);
  });
  it('uses the English fallback and repairs a primitive rate-limit body', async () => {
    localStorage.setItem('app_language', 'not-a-language');
    const error = refusal(429, 'untranslated');
    rejectsWith(error);
    await expect(apiClient.get('/transport-fixture')).rejects.toBe(error);
    expect(error.response?.data).toEqual({ error: 'Too many attempts. Please try again later.' });
  });
  it('uses the English rate-limit fallback if browser storage cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('controlled storage failure');
    });
    const error = refusal(429, {});
    rejectsWith(error);
    await expect(apiClient.get('/transport-fixture')).rejects.toBe(error);
    expect(error.message).toBe('Too many attempts. Please try again later.');
  });
  it('keeps multipart data, zero timeout, original key, progress callback, abort signal and response identity', async () => {
    const form = new FormData();
    form.append('fixture', 'controlled');
    const controller = new AbortController();
    const progress = vi.fn();
    const data = { transportFixture: true };
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => reply(config, data));
    apiClient.defaults.adapter = adapter;
    await expect(
      postMultipart<typeof data>('/transport-fixture/files', form, {
        idempotencyKey: 'fixture-upload-operation',
        onUploadProgress: progress,
        signal: controller.signal,
      })
    ).resolves.toBe(data);
    const config = adapter.mock.calls[0]?.[0];
    expect(config?.data).toBe(form);
    expect(config?.timeout).toBe(0);
    expect(config?.signal).toBe(controller.signal);
    expect(config?.onUploadProgress).toBe(progress);
    expect(config?.headers.get('X-Idempotency-Key')).toBe('fixture-upload-operation');
  });
  it('warns about dev schema drift without coercing, copying or throwing away the original payload', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const payload = { retained: true };
    expect(parseInDev(z.object({ id: z.number() }), payload, 'retained-transport-fixture')).toBe(payload);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
