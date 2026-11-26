import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { http, passthrough } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import PackingListPanel from '../../components/Packing/PackingListPanel';
import { offlineDb } from '../../db/offlineDb';
import MPackingListTab from '../../mobile/screens/trip/tabs/MPackingListTab';
import { packingRepo } from '../../repo/packingRepo';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import type { PackingList } from './packingContract';
import { createPackingTransport } from './packingTransport';
import { createFamilyPlannerCohort } from './plannerCohort';
import { FamilyFrontendRepository } from './repository';
import { activateFamilyFrontend } from './runtime';
import { createFamilyAxiosAdapter } from './transport';
import { useFamilyUiPermissions } from './uiPermissions';
const path = process.env.FAMILY_PACKING_READER_FIXTURE;
const live = path
  ? (JSON.parse(readFileSync(path, 'utf8')) as {
      api: string;
      anon_key: string;
      access_token: string;
      user_id: string;
      person_id: string;
      family_id: string;
      trip_id: string;
      packing: PackingList;
      trash_id: string;
      committed_operation: string;
      redacted_operation: string;
      hidden_item_id: string;
    })
  : null;
if (live && live.api !== 'http://127.0.0.1:55331') throw new Error('Refusing non-disposable packing endpoint');
let sdk: SupabaseClient,
  repo: FamilyFrontendRepository,
  stop: (() => void) | undefined,
  cohort: ReturnType<typeof createFamilyPlannerCohort>;
const original = api.defaults.adapter;
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:55331' }));
function required() {
  if (!live) throw new Error('Packing fixture required');
  return live;
}
beforeEach(async () => {
  if (!live) return;
  server.use(http.all(live.api + '/*', () => passthrough()));
  resetAllStores();
  await resetOfflineTestDatabase();
  setAuthed(true);
  activateFamilyFrontend();
  sdk = createClient(live.api, live.anon_key, {
    global: { headers: { Authorization: 'Bearer ' + live.access_token } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  repo = new FamilyFrontendRepository(async () => ({
    userId: live.user_id,
    personId: live.person_id,
    familyId: live.family_id,
    user: { username: 'Packing reader', email: 'local@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  }));
  await repo.session();
  cohort = createFamilyPlannerCohort(repo, { source: () => live.api, reportError: () => {} });
  stop = cohort.install();
  api.defaults.adapter = createFamilyAxiosAdapter(cohort.handle);
});
afterEach(async () => {
  cleanup();
  stop?.();
  stop = undefined;
  api.defaults.adapter = original;
  useFamilyUiPermissions.setState({ controller: null });
  setAuthed(false);
  await resetOfflineTestDatabase();
});
describe.skipIf(!live)('real disposable Auth/PostgREST packing and native readers', () => {
  it('loads both repeated-name items and omits other travelers private content through the native repository', async () => {
    const f = required(),
      out = await packingRepo.list(f.trip_id),
      ids = (await repo.views()).ids;
    expect(out.items.map((r) => r.name)).toEqual(['Raincoat', 'Raincoat']);
    expect(new Set(out.items.map((r) => r.id)).size).toBe(2);
    expect(out.items.map((r) => ids.uuid('packing', r.id))).toEqual(f.packing.items.map((r) => r.id));
    expect(out.items[0]).toMatchObject({ packed_quantity: 1, quantity: 3, checked: 0 });
    expect(out.items[1].checked).toBe(1);
    expect(JSON.stringify(out)).not.toContain(f.hidden_item_id);
    expect(await offlineDb.packingItems.count()).toBe(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('actual bag and assignee routes use authoritative weight including hidden items', async () => {
    const f = required(),
      bag = (await api.get(`/trips/${f.trip_id}/packing/bags`)).data;
    expect(bag.bags[0].total_weight_grams).toBe(2050);
    expect(bag.unassigned_weight_grams).toBe(100);
    expect(bag.family_packing_scope).toEqual(f.packing.scope);
    expect((await api.get(`/trips/${f.trip_id}/packing/category-assignees`)).data.assignees).toEqual({});
  });
  it('uses retained individual Trash without adding it to the active list', async () => {
    const f = required(),
      page = await cohort.packing.trash(f.trip_id);
    expect(page.packet.items.map((r) => r.id)).toEqual([f.trash_id]);
    expect((await packingRepo.list(f.trip_id)).items).toHaveLength(2);
  });
  it('distinguishes a real committed acknowledgement, redacted proof and unknown operation', async () => {
    const f = required();
    expect((await cohort.packing.receipt(f.trip_id, f.committed_operation)).packet).toMatchObject({
      status: 'committed',
      result_redacted: false,
      result: { action: 'create' },
    });
    expect((await cohort.packing.receipt(f.trip_id, f.redacted_operation)).packet).toMatchObject({
      status: 'committed',
      result_redacted: true,
      result: null,
    });
    expect((await cohort.packing.receipt(f.trip_id, crypto.randomUUID())).packet).toMatchObject({
      status: 'unknown',
      result_redacted: false,
      result: null,
    });
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('rejects a wrong expected Family after the real service response', async () => {
    const f = required();
    await expect(
      createPackingTransport().list({ ...f.packing.scope, family_id: crypto.randomUUID() })
    ).rejects.toMatchObject({ code: 'invalid_packing_response' });
  });
  it('retains actual anonymous denial rather than an empty list', async () => {
    const f = required(),
      anonymous = createClient(f.api, f.anon_key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    const transport = createPackingTransport(async (name, args) => {
      const { data, error } = await anonymous.rpc(name, args);
      if (error) throw error;
      return data;
    });
    await expect(transport.list(f.packing.scope)).rejects.toMatchObject({ status: 403, code: 'packing_access_denied' });
  });
  it.each(['desktop', 'phone'] as const)(
    'native %s renders common and personal packing from real DB data with no authoring',
    async (surface) => {
      const f = required(),
        items = (await packingRepo.list(f.trip_id)).items,
        id = (await repo.views()).ids.register('trip', f.trip_id),
        spy = vi.spyOn(sdk, 'rpc');
      useTripStore.setState({
        packingItems: items,
        trip: { id, title: 'Packing reader', user_id: 0, is_owner: 0 } as never,
      });
      if (surface === 'desktop') render(<PackingListPanel tripId={id} items={items} />);
      else render(<MPackingListTab planner={buildPlanner({ tripId: id, packingItems: items, can: () => false })} />);
      await waitFor(() => expect(screen.getAllByText('Raincoat').length).toBeGreaterThan(0));
      fireEvent.click(screen.getByText(surface === 'desktop' ? 'My list' : 'packing.viewPersonal'));
      await waitFor(() => expect(screen.getAllByText('Raincoat').length).toBeGreaterThan(0));
      expect(screen.queryByText('Do not expose private camera')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^(Add item|New item)$/i })).not.toBeInTheDocument();
      expect(spy.mock.calls.every(([name]) => !String(name).startsWith('execute_'))).toBe(true);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it.each(['create', 'update', 'delete'] as const)(
    'raw %s stays gated before an actual packing mutation',
    async (action) => {
      const f = required(),
        rows = (await packingRepo.list(f.trip_id)).items;
      const run =
        action === 'create'
          ? () => packingRepo.create(f.trip_id, { name: 'Blocked' })
          : action === 'update'
            ? () => packingRepo.update(f.trip_id, rows[0].id, { checked: true })
            : () => packingRepo.delete(f.trip_id, rows[0].id);
      await expect(run()).rejects.toThrow('not cut over');
      expect((await createPackingTransport().list(f.packing.scope)).items).toEqual(f.packing.items);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
});
