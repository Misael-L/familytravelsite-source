import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertCoreHttpsTaskRequest, coreHttpsTaskFetch } from './coreHttpsTaskBoundary';
import { coreHttpsTaskProfileEnabled } from './coreHttpsTaskProfile';
const source = ['https://family-core-fixture.', 'supabase', '.co'].join('');
beforeEach(() => {
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  vi.stubEnv('VITE_SUPABASE_URL', source);
  vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', 'isolated-task-v1');
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});
describe('task-only HTTPS command boundary', () => {
  it.each([
    '/trips/7/places',
    '/trips/7/packing',
    '/family/collections/7/commands',
    '/auth/me',
    '/vacay',
    '/trips/7/family/packing/commands',
  ])('refuses non-task native mutation %s', (pathname) => {
    expect(() => assertCoreHttpsTaskRequest({ method: 'POST', pathname })).toThrow('task commands only');
  });
  it.each(['/trips/7/family/tasks/commands', '/auth/login', '/auth/logout', '/auth/mfa/verify-login'])(
    'allows original task/auth transport %s',
    (pathname) => {
      expect(() => assertCoreHttpsTaskRequest({ method: 'POST', pathname })).not.toThrow();
    }
  );
  it.each([
    'execute_family_trip_packing_v1',
    'execute_family_trip_packing_group_v1',
    'execute_family_collection_content_v1',
    'cancel_family_collection_content_v1',
    'execute_family_trip_location_v1',
    'unknown_read_v1',
  ])('refuses unqualified RPC %s before native fetch', (rpc) => {
    const next = vi.fn<typeof fetch>();
    const fetch = coreHttpsTaskFetch(next);
    expect(() => fetch(source + '/rest/v1/rpc/' + rpc, { method: 'POST' })).toThrow('task commands only');
    expect(next).not.toHaveBeenCalled();
  });
  it.each([
    '/rest/v1/trips',
    '/storage/v1/object/private/new',
    '/rest/v1/rpc/execute_family_trip_task_v1?x=1',
    '/rest/v1/rpc/execute_family_trip_task_v1/',
  ])('refuses alternate mutation path %s', (path) => {
    const next = vi.fn<typeof fetch>();
    expect(() => coreHttpsTaskFetch(next)(source + path, { method: 'POST' })).toThrow();
    expect(next).not.toHaveBeenCalled();
  });
  it('refuses GET command RPC, transformations and cross-source mutation', () => {
    const next = vi.fn<typeof fetch>();
    const fetch = coreHttpsTaskFetch(next);
    expect(() => fetch(source + '/rest/v1/rpc/execute_family_trip_task_v1')).toThrow();
    expect(() => fetch(source + '/render/image/public/catalog/file')).toThrow();
    expect(() =>
      fetch('https://foreign.invalid/rest/v1/rpc/execute_family_trip_task_v1', { method: 'POST' })
    ).toThrow();
    expect(next).not.toHaveBeenCalled();
  });
  it.each([
    'get_family_trip_tasks_v1',
    'get_family_trip_task_receipt_v1',
    'execute_family_trip_task_v1',
    'get_my_auth_bootstrap',
    'get_family_collection_page_v1',
  ])('forwards the exact %s request and result', async (rpc) => {
    const response = new Response('{}'),
      next = vi.fn<typeof fetch>().mockResolvedValue(response),
      input = source + '/rest/v1/rpc/' + rpc,
      init = { method: 'POST', body: 'original-body' };
    expect(await coreHttpsTaskFetch(next)(input, init)).toBe(response);
    expect(next).toHaveBeenCalledExactlyOnceWith(input, init);
  });
  it('the installed SDK resolves the real global fence for an unsupported RPC and direct table write', async () => {
    const next = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', coreHttpsTaskFetch(next));
    try {
      const client = createClient(source, ['sb_', 'publishable_', 'fixture_supported_core'].join(''), {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const rpc = await client.rpc('execute_family_trip_packing_v1', {});
      const table = await client.from('trips').insert({ id: 'unqualified' });
      expect(rpc.error).not.toBeNull();
      expect(table.error).not.toBeNull();
      expect(next).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('does not change an ordinary unselected or old local profile', async () => {
    vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', '');
    expect(coreHttpsTaskProfileEnabled()).toBe(false);
    const next = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    await coreHttpsTaskFetch(next)(source + '/rest/v1/rpc/execute_family_trip_packing_v1', { method: 'POST' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(() => assertCoreHttpsTaskRequest({ method: 'PUT', pathname: '/trips/7/places' })).not.toThrow();
  });
});
