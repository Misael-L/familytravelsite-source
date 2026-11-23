import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertCoreHttpsPlannerPackingRequest, coreHttpsPlannerPackingFetch } from './coreHttpsPlannerPackingBoundary';
import { coreHttpsPlannerPackingProfileEnabled } from './coreHttpsPlannerPackingProfile';
import { assertCoreHttpsTaskRequest, coreHttpsTaskFetch } from './coreHttpsTaskBoundary';
import * as primaryProfile from './corePrimaryProfile';
const source = ['https://family-core-fixture.', 'supabase', '.co'].join('');
beforeEach(() => {
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  vi.stubEnv('VITE_SUPABASE_URL', source);
  vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', 'isolated-planner-packing-v1');
  vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each([
  '/trips/7/family/planner-editor-command',
  '/trips/7/family/planner-create-command',
  '/trips/7/family/planner-arrange-command',
  '/trips/7/family/plan-locations/3/form',
  '/trips/7/family/visits/3/form',
  '/trips/7/family/visits/3/trash',
  '/trips/7/family/packing/commands',
  '/trips/7/family/packing/group-commands',
  '/auth/login',
  '/auth/logout',
])('admits the bounded native %s request', (pathname) => {
  expect(() => assertCoreHttpsPlannerPackingRequest({ method: 'POST', pathname })).not.toThrow();
});
it.each([
  '/trips/7/places',
  '/trips/7/packing',
  '/trips/7/family/tasks/commands',
  '/trips/7/family/packing/bag-commands',
  '/trips/7/family/packing/category-commands',
  '/family/collections/7/commands',
  '/vacay',
  '/auth/me',
])('refuses unqualified native %s before dispatch', (pathname) => {
  expect(() => assertCoreHttpsPlannerPackingRequest({ method: 'POST', pathname })).toThrow(
    'base packing commands only'
  );
});
it.each([
  'create_family_native_plan_v1',
  'arrange_family_native_visits_v1',
  'save_family_trip_location_form_v1',
  'save_family_trip_visit_form_v1',
  'set_family_trip_visit_timing_v1',
  'execute_family_trip_packing_v1',
  'execute_family_trip_packing_group_v1',
  'get_family_trip_packing_receipt_v1',
  'get_family_trip_visit_form_v1',
  'get_family_trip_location_form_receipt_v1',
  'get_family_trip_visit_form_receipt_v1',
  'get_family_native_plan_receipt_v1',
  'get_family_native_plan_receipt_v2',
  'get_family_native_arrangement_receipt_v1',
  'cancel_family_native_plan_v1',
])('forwards the exact %s request and response', async (name) => {
  const out = new Response('{}'),
    next = vi.fn<typeof fetch>().mockResolvedValue(out);
  const input = source + '/rest/v1/rpc/' + name,
    init = { method: 'POST', body: 'original-body' };
  expect(await coreHttpsPlannerPackingFetch(next)(input, init)).toBe(out);
  expect(next).toHaveBeenCalledExactlyOnceWith(input, init);
});
it.each([
  '/rest/v1/rpc/execute_family_trip_task_v1',
  '/rest/v1/rpc/execute_family_collection_content_v1',
  '/rest/v1/rpc/execute_family_trip_packing_bag_v1',
  '/rest/v1/rpc/execute_family_trip_packing_category_v1',
  '/rest/v1/rpc/create_family_native_plan_v1?x=1',
  '/rest/v1/rpc/create_family_native_plan_v1/',
  '/rest/v1/rpc/cancel_family_native_plan_v1?x=1',
  '/rest/v1/rpc/cancel_family_native_plan_v1/',
  '/rest/v1/rpc/get_family_native_plan_receipt_v2?x=1',
  '/rest/v1/rpc/get_family_native_arrangement_receipt_v1?x=1',
  '/rest/v1/rpc/get_family_native_arrangement_receipt_v1/',
  '/rest/v1/rpc/get_family_native_arrangement_receipt_v2',
  '/rest/v1/trips',
  '/storage/v1/object/private/new',
  '/auth/v1/admin/users',
])('refuses alternate or unsupported %s before egress', (path) => {
  const next = vi.fn<typeof fetch>();
  expect(() => coreHttpsPlannerPackingFetch(next)(source + path, { method: 'POST' })).toThrow();
  expect(next).not.toHaveBeenCalled();
});
it('refuses GET commands, transformations and foreign mutations', () => {
  const next = vi.fn<typeof fetch>(),
    call = coreHttpsPlannerPackingFetch(next);
  expect(() => call(source + '/rest/v1/rpc/create_family_native_plan_v1')).toThrow();
  expect(() => call(source + '/rest/v1/rpc/cancel_family_native_plan_v1')).toThrow();
  expect(() => call(source + '/render/image/public/catalog/file')).toThrow();
  expect(() => call(source + '/storage/v1/render/image/public/catalog/file')).toThrow();
  expect(() => call('https://foreign.invalid/path', { method: 'POST' })).toThrow();
  expect(next).not.toHaveBeenCalled();
});
it('the real SDK cannot bypass the fence for other domains or table writes', async () => {
  const next = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', coreHttpsPlannerPackingFetch(next));
  const client = createClient(source, ['sb_', 'publishable_', 'fixture_supported_core'].join(''), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  expect((await client.rpc('execute_family_trip_task_v1', {})).error).not.toBeNull();
  expect((await client.from('trips').insert({ id: 'unqualified' })).error).not.toBeNull();
  expect(next).not.toHaveBeenCalled();
});
it.each(['', 'isolated-task-v1', 'local-v1', 'unknown'])('does not replace existing profile %s', (value) => {
  vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', value);
  expect(coreHttpsPlannerPackingProfileEnabled()).toBe(false);
});
it('does not admit a primary or other source, or an advanced qualification', () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://other.invalid');
  expect(coreHttpsPlannerPackingProfileEnabled()).toBe(false);
  vi.stubEnv('VITE_SUPABASE_URL', source);
  vi.stubEnv('VITE_FAMILY_PACKING_BAG_QUALIFICATION', 'local-v1');
  expect(coreHttpsPlannerPackingProfileEnabled()).toBe(false);
});

it.each(['GET', 'HEAD', 'PUT', 'DELETE'])('refuses %s on the arrangement reader before egress', (method) => {
  const next = vi.fn<typeof fetch>();
  expect(() =>
    coreHttpsPlannerPackingFetch(next)(source + '/rest/v1/rpc/get_family_native_arrangement_receipt_v1', { method })
  ).toThrow();
  expect(next).not.toHaveBeenCalled();
});
it('the actual SDK forwards only the selected original-bound reader without changing its payload', async () => {
  const payload = {
    p_trip_id: 'observed-trip',
    p_operation_id: 'observed-operation',
    p_scope: { version: 1 },
    p_plan: { version: 1 },
  };
  const next = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ status: 'unknown', result: null }), {
      headers: { 'content-type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', coreHttpsPlannerPackingFetch(next));
  const client = createClient(source, ['sb_', 'publishable_', 'fixture_supported_core'].join(''), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const result = await client.rpc('get_family_native_arrangement_receipt_v1', payload);
  expect(result.error).toBeNull();
  expect(result.data).toEqual({ status: 'unknown', result: null });
  expect(next).toHaveBeenCalledOnce();
  const [url, init] = next.mock.calls[0];
  expect(String(url)).toBe(source + '/rest/v1/rpc/get_family_native_arrangement_receipt_v1');
  expect(init?.method).toBe('POST');
  expect(JSON.parse(String(init?.body))).toEqual(payload);
});

describe('combined task, planner and base packing writer', () => {
  beforeEach(() => vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', 'isolated-task-planner-packing-v1'));

  it('passes each observed command through the same native fence', () => {
    for (const pathname of [
      '/trips/7/family/tasks/commands',
      '/trips/7/family/planner-editor-command',
      '/trips/7/family/packing/commands',
      '/trips/7/family/packing/group-commands',
    ]) {
      const request = { method: 'POST', pathname };
      expect(() => assertCoreHttpsTaskRequest(request)).not.toThrow();
      expect(() => assertCoreHttpsPlannerPackingRequest(request)).not.toThrow();
    }
    for (const pathname of [
      '/trips/7/todo',
      '/trips/7/packing',
      '/trips/7/family/packing/bag-commands',
      '/trips/7/family/packing/category-commands',
      '/family/collections/7/commands',
    ]) {
      expect(() => assertCoreHttpsPlannerPackingRequest({ method: 'POST', pathname })).toThrow();
    }
  });

  it('preserves the command body and keeps task receipt and Trash reads available through the real SDK', async () => {
    const next = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}'));
    vi.stubGlobal('fetch', coreHttpsPlannerPackingFetch(coreHttpsTaskFetch(next)));
    const client = createClient(source, ['sb_', 'publishable_', 'fixture_supported_core'].join(''), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const args = { p_operation_id: 'original-operation', p_scope: { version: 1 } };
    for (const name of [
      'execute_family_trip_task_v1',
      'get_family_trip_task_receipt_v1',
      'list_family_trip_task_trash_v1',
      'save_family_trip_visit_form_v1',
      'execute_family_trip_packing_v1',
      'get_family_trip_packing_receipt_v1',
      'execute_family_trip_packing_group_v1',
    ]) {
      expect((await client.rpc(name, args)).error).toBeNull();
      const [url, init] = next.mock.lastCall ?? [];
      expect(String(url)).toBe(source + '/rest/v1/rpc/' + name);
      expect(init?.body).toBe(JSON.stringify(args));
    }
    next.mockClear();
    expect((await client.from('todo_items').insert({ id: 'unqualified' })).error).not.toBeNull();
    expect((await client.from('packing_items').insert({ id: 'unqualified' })).error).not.toBeNull();
    expect((await client.rpc('execute_family_trip_packing_bag_v1', args)).error).not.toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    [source + '/auth/v1/admin/users', 'POST'],
    [source + '/storage/v1/render/image/public/catalog/file', 'GET'],
    [source + '/rest/v1/rpc/get_family_trip_task_receipt_v1?x=1', 'POST'],
    [source + '/rest/v1/rpc/execute_family_trip_task_v1', 'GET'],
    ['https://foreign.invalid/unsupported', 'POST'],
  ])('rejects %s using %s before forwarding', (url, method) => {
    const next = vi.fn<typeof fetch>();
    expect(() => coreHttpsPlannerPackingFetch(coreHttpsTaskFetch(next))(url, { method })).toThrow();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('primary Cloudflare cutover', () => {
  const taskPath = '/trips/7/family/tasks/commands';
  const taskRpc = '/rest/v1/rpc/execute_family_trip_task_v1';

  it('allows selected commands from a bound writer and refuses unrelated work', () => {
    vi.spyOn(primaryProfile, 'primaryCoreMode').mockReturnValue('write');
    expect(() => assertCoreHttpsPlannerPackingRequest({ method: 'POST', pathname: taskPath })).not.toThrow();
    expect(() => assertCoreHttpsPlannerPackingRequest({ method: 'POST', pathname: '/trips/7/packing' })).toThrow(
      'This release supports'
    );
  });

  it('keeps the receipt and sign-out paths available while preventing fallback writes', async () => {
    vi.spyOn(primaryProfile, 'primaryCoreMode').mockReturnValue('read');
    const next = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}'));
    const fetch = coreHttpsPlannerPackingFetch(next);
    const post = (path: string) => fetch(source + path, { method: 'POST' });

    await post('/rest/v1/rpc/get_family_trip_task_receipt_v1');
    await post('/rest/v1/rpc/get_family_trip_packing_receipt_v1');
    await post('/auth/v1/logout?scope=local');
    expect(() => post(taskRpc)).toThrow('Changes are paused');
    expect(() => post('/rest/v1/rpc/ensure_packing_defaults')).toThrow('Changes are paused');
    expect(() => post('/storage/v1/object/trip-files/new.pdf')).toThrow('Changes are paused');
    expect(() => assertCoreHttpsPlannerPackingRequest({ method: 'POST', pathname: taskPath })).toThrow(
      'Changes are paused'
    );
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('fails closed from an unexpected origin, including reads and auth', () => {
    vi.spyOn(primaryProfile, 'primaryCoreMode').mockReturnValue('blocked');
    const next = vi.fn<typeof fetch>();
    const fetch = coreHttpsPlannerPackingFetch(next);
    expect(() => fetch(source + '/auth/v1/health')).toThrow('This build cannot connect');
    expect(() => fetch(source + '/auth/v1/token?grant_type=password', { method: 'POST' })).toThrow(
      'This build cannot connect'
    );
    expect(() => assertCoreHttpsPlannerPackingRequest({ method: 'GET', pathname: '/trips/7' })).toThrow(
      'This build cannot connect'
    );
    expect(next).not.toHaveBeenCalled();
  });
});

it('admits the Mexico reads and photo signing for one trip, and keeps writes paused', async () => {
  vi.spyOn(primaryProfile, 'primaryCoreMode').mockReturnValue('read');
  const trip = '11555555-2222-4333-8444-555555555555';
  vi.stubEnv('VITE_FAMILY_CORE_WRITER_PROFILE', 'primary-core-mexico-preview-read-v1');
  vi.stubGlobal('__FAMILY_MEXICO_PREVIEW_TRIP__', trip);
  const location = { origin: 'https://preview.example.test', pathname: `/trips/${trip}` };
  vi.stubGlobal('window', { location });
  const next = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}'));
  const fetch = coreHttpsPlannerPackingFetch(next);
  const post = (path: string, p_trip_id = trip) =>
    fetch(source + path, { method: 'POST', body: JSON.stringify({ p_trip_id }) });
  const tours = '/rest/v1/rpc/get_family_trip_tours_v1';
  const sign = '/storage/v1/object/sign/journey-media';

  await post(tours);
  await post(sign);
  await post('/auth/v1/token?grant_type=password');
  expect(() => post(tours, 'other')).toThrow('Changes are paused');
  expect(() => post('/storage/v1/object/journey-media/preview.jpg')).toThrow('Changes are paused');
  expect(() => post('/storage/v1/object/sign/another-bucket')).toThrow('Changes are paused');
  expect(() => post('/rest/v1/rpc/save_family_route_preferences_v1')).toThrow('Changes are paused');
  expect(() => post('/rest/v1/rpc/send_family_trip_collab_chat_v3')).toThrow('Changes are paused');
  location.pathname = '/trips';
  expect(() => post(tours)).toThrow('Changes are paused');
  expect(() => post(sign)).toThrow('Changes are paused');
  expect(next).toHaveBeenCalledTimes(3);
});
