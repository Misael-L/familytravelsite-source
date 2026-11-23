import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { http, passthrough } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import WorkspaceGovernanceChrome from './legacy/components/Planner/family/WorkspaceGovernanceChrome';
import { useFamilyTripWorkspaceGovernance } from './legacy/pages/familyTripWorkspace/useFamilyTripWorkspaceGovernance';
import { createFamilyPlannerCohort } from './plannerCohort';
import { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';
const words = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock('./legacy/i18n', () => ({ useTranslation: () => ({ t: words.t, locale: 'en' }) }));
vi.mock('./legacy/components/shared/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:55331' }));
const path = process.env.FAMILY_GOVERNANCE_FIXTURE;
const live = path
  ? (JSON.parse(readFileSync(path, 'utf8')) as {
      api: string;
      anon_key: string;
      access_token: string;
      user_id: string;
      person_id: string;
      family_id: string;
      trips: string[];
    })
  : null;
if (live && live.api !== 'http://127.0.0.1:55331') throw new Error('Refusing a non-disposable governance test target');
let sdk: SupabaseClient,
  cohort: ReturnType<typeof createFamilyPlannerCohort>,
  repo: FamilyFrontendRepository,
  release: (() => void) | undefined,
  trip: string;
const original = api.defaults.adapter;
beforeEach(async () => {
  if (!live) return;
  server.use(http.all(live.api + '/*', () => passthrough()));
  resetAllStores();
  await resetOfflineTestDatabase();
  sdk = createClient(live.api, live.anon_key, {
    global: { headers: { Authorization: 'Bearer ' + live.access_token } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  repo = new FamilyFrontendRepository(async () => ({
    userId: live.user_id,
    personId: live.person_id,
    familyId: live.family_id,
    user: { username: 'Local reviewer', email: 'local@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  }));
  cohort = createFamilyPlannerCohort(repo, { source: () => live.api, reportError: () => {} });
  api.defaults.adapter = createFamilyAxiosAdapter(cohort.handle);
  release = cohort.install();
});
afterEach(async () => {
  cleanup();
  release?.();
  release = undefined;
  api.defaults.adapter = original;
  await resetOfflineTestDatabase();
});
function Native() {
  const gov = useFamilyTripWorkspaceGovernance({ tripId: trip, personId: live?.person_id ?? null, enabled: true });
  return <WorkspaceGovernanceChrome gov={gov} />;
}
async function open(index: number) {
  if (!live) throw new Error('Local fixture absent');
  trip = live.trips[index];
  repo.setLayer(trip, 'myDraft');
  await cohort.loadTrip(trip);
  render(<Native />);
  fireEvent.click(await screen.findByRole('button', { name: 'trip.governance.expand' }));
  fireEvent.click(await screen.findByRole('button', { name: 'trip.governance.proposeCount' }));
  await screen.findByRole('button', { name: 'trip.governance.propose' });
}
describe.skipIf(!live)('P04t real local Auth/AAL2 native governance and full cohort hydration', () => {
  it('native confirmation, typed submit and native Apply publish one real saved venue', async () => {
    await open(0);
    fireEvent.click(screen.getByRole('button', { name: 'trip.governance.propose' }));
    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'trip.governance.propose' })).not.toBeInTheDocument(),
      { timeout: 15000 }
    );
    fireEvent.click(await screen.findByRole('button', { name: 'trip.governance.reviewCount' }));
    fireEvent.click(await screen.findByRole('button', { name: 'trip.governance.requestFallback' }));
    fireEvent.click(await screen.findByRole('button', { name: 'trip.governance.apply' }));
    await waitFor(
      () => expect(useTripStore.getState().places.some((p) => p.name === 'Real governed venue 0')).toBe(true),
      { timeout: 15000 }
    );
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    const result = await sdk.from('trip_plan_locations').select('label,notes').eq('trip_id', trip);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      expect.objectContaining({ label: 'Real governed venue 0', notes: 'Original private details' }),
    ]);
  });
  it('a second real draft operation added after confirmation opens is never silently submitted', async () => {
    await open(1);
    const added = await sdk.rpc('stage_family_plan_change_v2', {
      p_trip_id: trip,
      p_operation_id: crypto.randomUUID(),
      p_domain: 'location',
      p_action: 'create',
      p_target_id: null,
      p_expected_revision: null,
      p_changes: { source: { kind: 'manual' }, label: 'Later separate real venue' },
    });
    expect(added.error).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'trip.governance.propose' }));
    await waitFor(async () => expect((await offlineDb.mutationQueue.toArray())[0]?.status).toBe('conflict'), {
      timeout: 15000,
    });
    const snapshot = await sdk.rpc('get_family_plan_governance_v1', { p_trip_id: trip, p_layer: 'myDraft' });
    expect(snapshot.error).toBeNull();
    expect(snapshot.data.draft.operations).toHaveLength(2);
    expect(snapshot.data.requests).toHaveLength(0);
  });
});
