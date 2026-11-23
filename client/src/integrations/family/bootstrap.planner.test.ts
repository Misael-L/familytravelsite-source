import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../../api/client';
import { notifyPrivateSessionEnd } from '../../db/privateSessionEvents';
import { useAuthStore } from '../../store/authStore';
import { installFamilyFrontend } from './bootstrap';
import { familyFrontend } from './repository';
vi.mock('../../api/websocket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/websocket')>()),
  installRealtimeDriver: vi.fn(),
}));
const state = vi.hoisted(() => ({
  event: null as null | ((event: string, session: unknown) => void),
  refresh: vi.fn(),
  capture: vi.fn(),
  bindings: [] as Array<{ handle: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
}));
vi.mock('./legacy/data/supabase/env', () => ({
  getDataPlane: () => 'supabase',
  getSupabaseUrl: () => 'http://127.0.0.1:55331',
  getSupabaseAnonKey: () => 'local-public-key',
}));
vi.mock('./legacy/data/supabase/auth', () => ({
  onSupabaseAuthStateChange: (fn: typeof state.event) => {
    state.event = fn;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  },
}));
vi.mock('./plannerAuthRefresh', async (original) => ({
  ...(await original<typeof import('./plannerAuthRefresh')>()),
  capturePlannerAuthRefresh: state.capture,
}));
vi.mock('./plannerBootstrap', () => ({
  installFamilyPlanner: vi.fn(() => {
    const binding = { handle: vi.fn(async (r: { pathname: string }) => ({ path: r.pathname })), dispose: vi.fn() };
    state.bindings.push(binding);
    return binding;
  }),
}));
let release: (() => void) | undefined;
afterEach(() => {
  release?.();
  release = undefined;
  state.bindings.length = 0;
});
describe('normal bootstrap planner transport ownership', () => {
  it('ordinary Family bootstrap retires legacy shared private caches on raw session retirement', async () => {
    const remove = vi.fn(async () => true);
    vi.stubGlobal('caches', { delete: remove });
    try {
      release = installFamilyFrontend();
      await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
      notifyPrivateSessionEnd();
      await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(4));
      release?.();
      notifyPrivateSessionEnd();
      expect(remove).toHaveBeenCalledTimes(4);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('dispatches native Axios and same-origin fetch through the same composition', async () => {
    const adapter = api.defaults.adapter,
      network = window.fetch;
    const dispose = installFamilyFrontend();
    if (!dispose) throw new Error('Family bootstrap was not installed');
    release = dispose;
    expect(api.defaults.adapter).not.toBe(adapter);
    expect(window.fetch).not.toBe(network);
    const binding = state.bindings[0];
    await expect(api.get('/trips/original/bundle')).resolves.toMatchObject({
      data: { path: '/trips/original/bundle' },
    });
    const response = await window.fetch('/api/trips/original/days');
    expect(await response.json()).toEqual({ path: '/trips/original/days' });
    expect(binding.handle).toHaveBeenCalledTimes(2);
    dispose();
    dispose();
    expect(binding.dispose).toHaveBeenCalledTimes(1);
    expect(api.defaults.adapter).toBe(adapter);
    expect(window.fetch).toBe(network);
  });
  it('retires the previous composition before reinstalling and does not let stale cleanup remove the new transport', async () => {
    const adapter = api.defaults.adapter,
      network = window.fetch;
    const first = installFamilyFrontend();
    if (!first) throw new Error('Family bootstrap was not installed');
    release = first;
    const second = installFamilyFrontend();
    if (!second) throw new Error('Family bootstrap was not reinstalled');
    release = second;
    expect(state.bindings[0].dispose).toHaveBeenCalledTimes(1);
    first();
    await expect(api.get('/trips/new/bundle')).resolves.toMatchObject({ data: { path: '/trips/new/bundle' } });
    const response = await window.fetch('/api/trips/new/days');
    expect(await response.json()).toEqual({ path: '/trips/new/days' });
    expect(state.bindings[0].handle).not.toHaveBeenCalled();
    expect(state.bindings[1].handle).toHaveBeenCalledTimes(2);
    second();
    expect(state.bindings[1].dispose).toHaveBeenCalledTimes(1);
    expect(api.defaults.adapter).toBe(adapter);
    expect(window.fetch).toBe(network);
  });
});

it('captures refresh before repository retirement and rehydrates only after successful Auth validation', async () => {
  const order: string[] = [];
  state.capture.mockImplementation(() => {
    order.push('capture');
    return state.refresh;
  });
  state.refresh.mockImplementation(async () => {
    order.push('hydrate');
  });
  const clear = vi.spyOn(familyFrontend, 'clear').mockImplementation(() => {
    order.push('retire');
  });
  const load = vi.spyOn(useAuthStore.getState(), 'loadUser').mockImplementation(async () => {
    order.push('validate');
  });
  release = installFamilyFrontend();
  order.length = 0;
  if (!state.event) throw new Error('Missing installed Auth callback');
  state.event('TOKEN_REFRESHED', null);
  await vi.waitFor(() => expect(state.refresh).toHaveBeenCalledTimes(1));
  expect(order).toEqual(['capture', 'retire', 'validate', 'hydrate']);
  clear.mockRestore();
  load.mockRestore();
  state.capture.mockReset();
  state.refresh.mockReset();
});
it('does not rehydrate after a failed refreshed Auth validation', async () => {
  state.capture.mockReturnValue(state.refresh);
  const load = vi.spyOn(useAuthStore.getState(), 'loadUser').mockRejectedValue(new Error('Auth unavailable'));
  release = installFamilyFrontend();
  if (!state.event) throw new Error('Missing installed Auth callback');
  state.event('TOKEN_REFRESHED', null);
  await vi.waitFor(() => expect(load).toHaveBeenCalled());
  expect(state.refresh).not.toHaveBeenCalled();
  load.mockRestore();
  state.capture.mockReset();
  state.refresh.mockReset();
});
