import 'fake-indexeddb/auto';
import { useLayoutEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTrip } from '../../../tests/helpers/factories';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { act, cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import { installPlannerGovernancePort } from '../../repo/plannerGovernancePort';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import type { GovernanceCommand, GovernanceGroup, GovernanceView } from './governanceContract';
import { governanceOps } from './governanceProjection';
import WorkspaceChangeRequestInbox from './legacy/components/Planner/family/WorkspaceChangeRequestInbox';
import WorkspaceGovernanceChrome from './legacy/components/Planner/family/WorkspaceGovernanceChrome';
import { useFamilyTripWorkspaceGovernance } from './legacy/pages/familyTripWorkspace/useFamilyTripWorkspaceGovernance';
import { bookingJson } from './nativeBookingDetails';
import { PlannerCohortGovernance } from './plannerCohortGovernance';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';
const words = vi.hoisted(() => ({ t: (key: string) => key }));
const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => source }));
vi.mock('./legacy/i18n', () => ({ useTranslation: () => ({ t: words.t, locale: 'en' }) }));
vi.mock('./legacy/components/shared/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Missing fixture value');
  return value;
}
const id = (n: number) => `70400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = id(1),
  family = id(2),
  person = id(3),
  user = id(4),
  draft = id(5),
  op = id(6),
  request = id(7),
  at = '2026-11-07T00:00:00Z';
let repo: FamilyFrontendRepository,
  manager: PlannerCohortGovernance,
  session: FamilySession,
  state: GovernanceView,
  source: string,
  disposed: boolean,
  loseReply: boolean,
  deny: boolean,
  failRefresh: boolean,
  published: number;
const receipts = new Map<string, { hash: string; result: unknown }>(),
  oldAdapter = api.defaults.adapter;
let release: (() => void) | undefined;
let current: ReturnType<typeof useFamilyTripWorkspaceGovernance>;
const hydrate = vi.fn();
function draftGroup(): GovernanceGroup {
  return {
    record: { id: draft, trip_id: trip, owner_person_id: person, title: null, notes: null, updated_at: at },
    operations: [
      {
        id: op,
        draft_id: draft,
        module: 'trip_place',
        op: 'add',
        payload: {
          schema_version: 2,
          contract: 'family.plan_change.v2',
          domain: 'location',
          action: 'create',
          expected_revision: null,
          changes: { source: { kind: 'manual' }, label: 'Detailed proposed venue', notes: 'Private details' },
        },
        sort_order: 0,
        created_at: at,
        target_table: 'trip_plan_locations',
        target_id: null,
        trip_day_id: null,
        civil_date: null,
      },
    ],
  };
}
function groupFor(p: Record<string, unknown>) {
  if (p.p_action === 'submit') return state.draft;
  const q = state.requests.find((q) =>
    p.p_action === 'review_request' ? q.record.id === p.p_target_id : q.operations.some((o) => o.id === p.p_target_id)
  );
  return q
    ? p.p_action === 'review_op'
      ? { record: q.record, operations: q.operations.filter((o) => o.id === p.p_target_id) }
      : q
    : null;
}
function command(p: Record<string, unknown>) {
  const key = String(p.p_operation_id),
    hash = JSON.stringify(p),
    prior = receipts.get(key);
  if (deny) return { data: null, error: { code: '42501', message: 'Authority revoked' } };
  if (prior)
    return prior.hash === hash
      ? { data: structuredClone(prior.result), error: null }
      : { data: null, error: { code: 'PT409', message: 'Changed original command' } };
  const g = groupFor(p);
  if (bookingJson(g) !== bookingJson(p.p_observation))
    return { data: null, error: { code: 'PT409', message: 'Proposal changed; original retained' } };
  let result: Record<string, unknown>;
  if (p.p_action === 'submit') {
    const operations = (state.draft?.operations ?? []).map((o) => {
      const { draft_id: _, ...rest } = o;
      return { ...rest, request_id: request, status: 'pending' };
    });
    state.requests.push({
      record: {
        id: request,
        trip_id: trip,
        proposed_by_person_id: person,
        status: 'submitted',
        summary: 'Observed request',
        submitted_at: at,
        resolved_at: null,
      },
      operations,
    });
    if (state.draft) state.draft.operations = [];
    result = {
      operation: { request_id: request, trip_id: trip, op_count: operations.length },
      request_status: 'submitted',
    };
  } else {
    const q = state.requests.find(
      (q) => q.operations.some((o) => o.id === p.p_target_id) || q.record.id === p.p_target_id
    );
    if (!q) throw new Error('Missing fixture request');
    const accept = (p.p_parameters as { accept: boolean }).accept,
      chosen = q.operations.filter((o) =>
        p.p_action === 'review_request' ? o.status === 'pending' : o.id === p.p_target_id
      );
    const results = chosen.map((o) => {
      o.status = accept ? 'applied' : 'rejected';
      if (accept) published++;
      return {
        op_id: o.id,
        status: o.status,
        published_id: accept ? id(80) : null,
        published_revision: accept ? 1 : null,
      };
    });
    q.record.status = q.operations.some((o) => o.status === 'pending')
      ? 'partially_applied'
      : accept
        ? 'applied'
        : 'rejected';
    result = p.p_action === 'review_op' ? results[0] : { request_id: q.record.id, results };
  }
  const out = { version: 1, trip_id: trip, operation_id: key, action: p.p_action, target_id: p.p_target_id, result };
  receipts.set(key, { hash, result: structuredClone(out) });
  if (loseReply) {
    loseReply = false;
    return { data: null, error: { code: '08006', message: 'Lost reply' } };
  }
  return { data: out, error: null };
}
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  source = 'https://fixture.supabase.invalid';
  disposed = false;
  loseReply = false;
  deny = false;
  failRefresh = false;
  published = 0;
  receipts.clear();
  hydrate.mockReset();
  session = {
    userId: user,
    familyId: family,
    personId: person,
    user: { username: 'Fixture', email: 'local@fixture.invalid', avatar_url: null, created_at: at },
  };
  repo = new FamilyFrontendRepository(async () => session);
  const key = (await repo.views()).ids.register('trip', trip);
  useTripStore.setState({ trip: buildTrip({ id: key }) });
  repo.setLayer(trip, 'myDraft');
  state = {
    version: 1,
    scope: { version: 1, trip_id: trip, family_id: family, user_id: user, person_id: person, layer: 'myDraft' },
    permissions: {
      can_mutate: true,
      can_draft: true,
      outcomes: { 'trip.places.manage': 'direct', 'trip.schedule.manage': 'direct' },
    },
    draft: draftGroup(),
    requests: [],
  };
  boundary.rpc.mockReset();
  boundary.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_family_plan_governance_v1')
      return {
        data: structuredClone({
          ...state,
          requests: state.requests.filter((q) => ['submitted', 'partially_applied'].includes(q.record.status ?? '')),
          scope: { ...state.scope, layer: args.p_layer },
        }),
        error: null,
      };
    if (name === 'execute_family_plan_governance_v1') return command(args);
    throw new Error('Legacy RPC must not run: ' + name);
  });
  api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(repo));
  hydrate.mockImplementation(async () => {
    if (failRefresh) throw new Error('Refresh offline');
  });
  manager = new PlannerCohortGovernance(repo, {
    source: () => source,
    disposed: () => disposed,
    hydrate,
    changeLayer: async () => {},
  });
  release = installPlannerGovernancePort(manager);
});
afterEach(async () => {
  cleanup();
  disposed = true;
  manager.reset();
  release?.();
  release = undefined;
  api.defaults.adapter = oldAdapter;
  await resetOfflineTestDatabase();
  vi.restoreAllMocks();
});
function Native({ personId = person }: { personId?: string }) {
  const [n, setN] = useState(0);
  const gov = useFamilyTripWorkspaceGovernance({ tripId: trip, personId, enabled: true });
  useLayoutEffect(() => {
    current = gov;
  });
  return (
    <>
      <WorkspaceGovernanceChrome gov={gov} />
      <button
        onClick={() => {
          void gov.reloadChangeGovernance();
          setN(n + 1);
        }}
      >
        Refresh governance
      </button>
    </>
  );
}
async function openProposal() {
  render(<Native />);
  await waitFor(() => expect(current.draftOps).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'trip.governance.expand' }));
  fireEvent.click(screen.getByRole('button', { name: 'trip.governance.proposeCount' }));
  await screen.findByRole('button', { name: 'trip.governance.propose' });
}
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'trip.governance.propose' }));
const sent = () => boundary.rpc.mock.calls.filter(([n]) => n === 'execute_family_plan_governance_v1');
async function success() {
  await waitFor(() => expect(receipts.size).toBe(1));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'trip.governance.propose' })).not.toBeInTheDocument()
  );
}
describe('P04t actual governance controls and original command coordinator', () => {
  it('the native reader and chrome preserve typed details without a legacy RPC', async () => {
    await openProposal();
    expect(screen.getByText(/Detailed proposed venue/)).toBeInTheDocument();
    expect((current.draftOps[0] as { originalPayload?: unknown }).originalPayload).toEqual(
      state.draft?.operations[0].payload
    );
    expect(current.draftOps[0].payload.body).toContain('Private details');
  });
  it('the actual Propose confirmation sends its observed draft once and refreshes', async () => {
    await openProposal();
    confirm();
    await success();
    expect(sent()).toHaveLength(1);
    expect(sent()[0][1].p_observation.operations[0].payload.schema_version).toBe(2);
    expect(hydrate).toHaveBeenCalledOnce();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('another tab adding work after confirmation opened refuses the whole original', async () => {
    await openProposal();
    state.draft?.operations.push({ ...state.draft.operations[0], id: id(9) });
    confirm();
    await waitFor(() => expect(current.governanceError).toContain('Proposal changed'));
    expect(receipts.size).toBe(0);
    expect(state.draft?.operations).toHaveLength(2);
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it('background refresh cannot rebase the open native confirmation', async () => {
    await openProposal();
    state.draft?.operations.push({ ...state.draft.operations[0], id: id(9) });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh governance' }));
    await waitFor(() => expect(current.draftOps).toHaveLength(2));
    confirm();
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0][1].p_observation.operations).toHaveLength(1);
    expect(receipts.size).toBe(0);
  });
  it('lost reply retries exactly the original operation/body without a second submission', async () => {
    await openProposal();
    loseReply = true;
    confirm();
    await waitFor(() => expect(current.governanceError).toContain('Lost reply'));
    const row = (await offlineDb.mutationQueue.toArray())[0];
    expect(row.id).toBe((row.body as GovernanceCommand).operation_id);
    confirm();
    await success();
    expect(sent()).toHaveLength(2);
    expect(sent()[0][1]).toEqual(sent()[1][1]);
    expect(state.requests).toHaveLength(1);
  });
  it('a changed summary cannot replace an uncertain retained command', async () => {
    await openProposal();
    loseReply = true;
    confirm();
    await waitFor(() => expect(current.governanceError).toContain('Lost reply'));
    fireEvent.change(screen.getByLabelText('trip.governance.proposeSummary'), {
      target: { value: 'Different intent' },
    });
    confirm();
    await waitFor(() => expect(current.governanceError).toContain('retained'));
    expect(sent()).toHaveLength(1);
  });
  it.each(['account', 'person', 'family', 'source', 'layer', 'trip', 'disposed'] as const)(
    'a %s switch refuses the original confirmation before another RPC',
    async (kind) => {
      await openProposal();
      if (kind === 'source') source = 'https://other.supabase.invalid';
      else if (kind === 'layer') repo.setLayer(trip, 'published');
      else if (kind === 'trip') useTripStore.setState({ trip: buildTrip({ id: 999 }) });
      else if (kind === 'disposed') disposed = true;
      else {
        session = {
          ...session,
          ...(kind === 'account'
            ? { userId: id(40) }
            : kind === 'person'
              ? { personId: id(41) }
              : { familyId: id(42) }),
        };
        repo.acceptSession(session);
      }
      confirm();
      await waitFor(() => expect(current.governanceError).toBeTruthy());
      expect(sent()).toHaveLength(0);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it('offline confirmation does not mint a new queued command', async () => {
    await openProposal();
    setForcedOffline(true);
    confirm();
    await waitFor(() => expect(current.governanceError).toContain('Reconnect'));
    expect(sent()).toHaveLength(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('local write-ahead persistence failure prevents the remote submit', async () => {
    await openProposal();
    vi.spyOn(mutationQueue, 'enqueue').mockRejectedValueOnce(new Error('Disk unavailable'));
    confirm();
    await waitFor(() => expect(current.governanceError).toContain('Disk unavailable'));
    expect(sent()).toHaveLength(0);
  });
  it('an older raw pending Trip write blocks governance publication', async () => {
    await openProposal();
    await mutationQueue.enqueue({
      id: crypto.randomUUID(),
      tripId: required(useTripStore.getState().trip).id,
      method: 'POST',
      url: `/trips/${trip}/places`,
      body: { name: 'Keep older work' },
    });
    confirm();
    await waitFor(() => expect(current.governanceError).toContain('older retained'));
    expect(sent()).toHaveLength(0);
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it('commit followed by refresh failure retries original receipt without another publication', async () => {
    await openProposal();
    failRefresh = true;
    confirm();
    await waitFor(() => expect(current.governanceError).toContain('committed'));
    failRefresh = false;
    confirm();
    await success();
    expect(state.requests).toHaveLength(1);
    expect(sent()[0][1]).toEqual(sent()[1][1]);
  });
  it('an unrecognized payload remains available in the reader and native summary', async () => {
    if (state.draft)
      state.draft.operations[0].payload = { schema_version: 9, nested: { keep: 'Unknown personal content' } };
    await openProposal();
    expect(screen.getByText(/Unknown personal content/)).toBeInTheDocument();
    expect(governanceOps(required(state.draft))[0].originalPayload).toEqual({
      schema_version: 9,
      nested: { keep: 'Unknown personal content' },
    });
  });
  it('legacy draft deletion is explicitly refused with original contents intact', async () => {
    await openProposal();
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'trip.governance.removeOp' }));
    await waitFor(() => expect(current.governanceError).toContain('legacy governance writer'));
    expect(state.draft?.operations).toHaveLength(1);
    expect(sent()).toHaveLength(0);
  });
  it('a controller cannot resume legacy writers after the cohort port releases', async () => {
    await openProposal();
    act(() => {
      disposed = true;
      release?.();
      release = undefined;
    });
    confirm();
    await waitFor(() => expect(current.governanceError).toBeTruthy());
    expect(boundary.rpc.mock.calls.every(([n]) => !String(n).startsWith('submit_trip'))).toBe(true);
    expect(sent()).toHaveLength(0);
  });
  it('new actor props immediately hide the previous private details', async () => {
    const v = render(<Native />);
    await waitFor(() => expect(current.draftOps).toHaveLength(1));
    v.rerender(<Native personId={id(50)} />);
    expect(current.draftOps).toHaveLength(0);
  });
  it('malformed cross-Trip read is rejected before displaying private details', async () => {
    required(state.draft).record.trip_id = id(99);
    render(<Native />);
    await waitFor(() => expect(current.governanceError).toBeTruthy());
    expect(current.draftOps).toHaveLength(0);
  });
  it('legacy controller attachment cannot overwrite a claimed native layer', async () => {
    const undo = repo.claimPlannerController(),
      set = vi.fn();
    repo.attachController(
      { trip: { id: trip } } as Parameters<typeof repo.attachController>[0],
      { canMutate: false, outcomes: {} },
      'published',
      set
    );
    expect(repo.getLayer(trip)).toBe('myDraft');
    undo();
    repo.attachController(
      { trip: { id: trip } } as Parameters<typeof repo.attachController>[0],
      { canMutate: false, outcomes: {} },
      'published',
      set
    );
    expect(repo.getLayer(trip)).toBe('published');
  });
});
async function submittedFixture() {
  const v = await manager.read(trip);
  await manager.execute(trip, { action: 'submit', target: draft, observation: required(v.draft), parameters: {} }, v);
  return manager.read(trip);
}
describe('P04t actual existing request inbox controls', () => {
  async function openRequest() {
    await submittedFixture();
    render(<Native />);
    await waitFor(() => expect(current.openChangeRequests).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'trip.governance.reviewCount' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Observed request' }));
    await screen.findByRole('button', { name: 'trip.governance.apply' });
  }
  it('Apply uses the original typed operation and fresh coherent reads', async () => {
    await openRequest();
    fireEvent.click(screen.getByRole('button', { name: 'trip.governance.apply' }));
    await waitFor(() => expect(published).toBe(1));
    await waitFor(() => expect(current.openChangeRequests).toHaveLength(0));
    expect(sent()[sent().length - 1]?.[1].p_action).toBe('review_op');
  });
  it('Reject does not publish the typed operation', async () => {
    await openRequest();
    fireEvent.click(screen.getByRole('button', { name: 'trip.governance.reject' }));
    await waitFor(() => expect(current.openChangeRequests).toHaveLength(0));
    expect(published).toBe(0);
    expect(sent()[sent().length - 1]?.[1].p_parameters.accept).toBe(false);
  });
  it('revoked authority refuses even when the already-loaded inbox offered Apply', async () => {
    await openRequest();
    deny = true;
    fireEvent.click(screen.getByRole('button', { name: 'trip.governance.apply' }));
    await waitFor(() => expect(current.governanceError).toContain('Authority revoked'));
    expect(published).toBe(0);
    expect((await offlineDb.mutationQueue.toArray())[0].status).toBe('failed');
  });
  it('bulk review sends one observed transactional command, not individual approvals', async () => {
    await submittedFixture();
    const v = await manager.read(trip);
    await manager.execute(
      trip,
      { action: 'review_request', target: request, observation: v.requests[0], parameters: { accept: true } },
      v
    );
    expect(sent()[sent().length - 1]?.[1].p_action).toBe('review_request');
    expect(published).toBe(1);
    expect(sent().filter(([, p]) => p.p_action === 'review_op')).toHaveLength(0);
  });
  it('no review action can use a request that was never opened', async () => {
    await submittedFixture();
    render(<Native />);
    await waitFor(() => expect(current.openChangeRequests).toHaveLength(1));
    let out: { ok: boolean } | undefined;
    await act(async () => {
      out = await current.resolveOp(op, true);
    });
    expect(out?.ok).toBe(false);
    expect(published).toBe(0);
  });
  it('a capability-authorized reviewer is offered the inbox without the old HOF flag', async () => {
    await submittedFixture();
    state.permissions.can_mutate = false;
    render(<Native />);
    await waitFor(() => expect(current.openChangeRequests).toHaveLength(1));
    expect(await screen.findByRole('button', { name: 'trip.governance.reviewCount' })).toBeInTheDocument();
  });
  it('unrecognized request payload stays visible but its Apply action is disabled', async () => {
    await submittedFixture();
    state.requests[0].operations[0].payload = { schema_version: 99, nested: { keep: 'Unsupported request' } };
    render(<Native />);
    await waitFor(() => expect(current.openChangeRequests).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'trip.governance.reviewCount' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Observed request' }));
    expect(await screen.findByText(/Unsupported request/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'trip.governance.apply' })).toBeDisabled();
  });
  it('compound visit approval also requires Direct location capability', async () => {
    await submittedFixture();
    state.requests[0].operations[0].module = 'plan_item';
    state.requests[0].operations[0].payload = {
      schema_version: 2,
      contract: 'family.plan_change.v2',
      domain: 'visit',
      action: 'edit_entry',
      changes: { location_changes: { notes: 'Changed venue' } },
    };
    state.permissions.outcomes['trip.places.manage'] = 'deny';
    render(<Native />);
    await waitFor(() => expect(current.openChangeRequests).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'trip.governance.reviewCount' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Observed request' }));
    expect(await screen.findByRole('button', { name: 'trip.governance.apply' })).toBeDisabled();
  });
  it('Propose permissions do not expose a reviewer inbox', async () => {
    await submittedFixture();
    state.permissions.can_mutate = false;
    state.permissions.outcomes['trip.places.manage'] = 'propose';
    render(<Native />);
    await waitFor(() => expect(current.mySubmittedRequests).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'trip.governance.reviewCount' })).not.toBeInTheDocument();
  });
});

it('the actual inbox reports a failed post-review read without an unhandled rejection', async () => {
  const v = await submittedFixture(),
    group = v.requests[0];
  const { governanceRequest, governanceRequestOps } = await import('./governanceProjection');
  const load = vi
    .fn()
    .mockResolvedValueOnce(governanceRequestOps(group))
    .mockRejectedValue(new Error('Post-review session ended'));
  render(
    <WorkspaceChangeRequestInbox
      open
      onClose={() => {}}
      requests={[governanceRequest(group)]}
      busy={false}
      loadOps={load}
      onResolveOp={async () => ({ ok: true })}
      onResolveRequest={async () => ({ ok: true, errorCodes: [] })}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Observed request' }));
  fireEvent.click(await screen.findByRole('button', { name: 'trip.governance.apply' }));
  expect(await screen.findByText('Post-review session ended')).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(2);
});
