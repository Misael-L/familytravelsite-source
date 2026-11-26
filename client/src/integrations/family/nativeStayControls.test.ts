import { act, cleanup, render, screen } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as readOnly from '../../db/readOnlySession';
import { currentPlannerStayWritePort } from '../../repo/plannerStayPort';
import { useTripStore } from '../../store/tripStore';
import { FamilyStayManagement } from './FamilyStayManagement';
import * as env from './legacy/data/supabase/env';
import { nativeStayControlsAllowed, nativeStayUiCall } from './nativeStayControls';
import { createFamilyPlannerCohort } from './plannerCohort';
import { FamilyApiError, FamilyFrontendRepository } from './repository';
import { useFamilyUiPermissions } from './uiPermissions';
let release: (() => void) | undefined;
const oldTrip = useTripStore.getState().trip;
function controller() {
  return {
    isCurrent: () => true,
    supportsAction: () => true,
    gov: {
      layer: 'published',
      canEditPublished: true,
      actionOutcomes: {
        'trip.schedule.manage': 'direct',
        'trip.reservations.manage': 'direct',
      },
    },
  };
}
beforeEach(() => {
  vi.spyOn(readOnly, 'hasReadOnlySession').mockReturnValue(false);
  useFamilyUiPermissions.setState({ controller: controller() as never });
  vi.spyOn(env, 'getSupabaseUrl').mockReturnValue('http://127.0.0.1:57171');
  vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', 'local-native-v1');
  vi.stubEnv('VITE_FAMILY_STAY_CONTROLS_QUALIFICATION', 'local-native-v1');
});
afterEach(() => {
  cleanup();
  useTripStore.setState({ trip: oldTrip });
  release?.();
  release = undefined;
  useFamilyUiPermissions.setState({ controller: null });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it('admits creation and lifecycle only with current Direct permissions', () => {
  expect(nativeStayControlsAllowed()).toBe(true);
  expect(nativeStayControlsAllowed(true)).toBe(true);
});
it.each(['deny', 'propose'])('reservation %s blocks creation without blocking schedule-only lifecycle', (value) => {
  const c = controller();
  c.gov.actionOutcomes['trip.reservations.manage'] = value;
  useFamilyUiPermissions.setState({ controller: c as never });
  expect(nativeStayControlsAllowed()).toBe(true);
  expect(nativeStayControlsAllowed(true)).toBe(false);
});
it.each(['deny', 'propose'])('schedule %s blocks both halves', (value) => {
  const c = controller();
  c.gov.actionOutcomes['trip.schedule.manage'] = value;
  useFamilyUiPermissions.setState({ controller: c as never });
  expect(nativeStayControlsAllowed()).toBe(false);
  expect(nativeStayControlsAllowed(true)).toBe(false);
});
it.each(['draft', 'stale', 'unsupported', 'readonly', 'absent'])('refuses %s current context', (kind) => {
  const c = controller();
  if (kind === 'draft') c.gov.layer = 'myDraft';
  if (kind === 'stale') c.isCurrent = () => false;
  if (kind === 'unsupported') c.supportsAction = () => false;
  if (kind === 'readonly') vi.mocked(readOnly.hasReadOnlySession).mockReturnValue(true);
  useFamilyUiPermissions.setState({ controller: kind === 'absent' ? null : (c as never) });
  expect(nativeStayControlsAllowed()).toBe(false);
  expect(nativeStayControlsAllowed(true)).toBe(false);
});
it('honors current domain Direct grants without whole-Trip mutation authority', () => {
  const c = controller();
  c.gov.canEditPublished = false;
  useFamilyUiPermissions.setState({ controller: c as never });
  expect(nativeStayControlsAllowed()).toBe(true);
  expect(nativeStayControlsAllowed(true)).toBe(true);
});
it('renders shared lodging recovery for a Direct non-admin and withdraws it on Propose', () => {
  install();
  const c = controller();
  c.gov.canEditPublished = false;
  useFamilyUiPermissions.setState({ controller: c as never });
  useTripStore.setState({ trip: { id: 1 } as never });
  render(createElement(FamilyStayManagement));
  expect(screen.getByRole('button', { name: 'Lodgings · Trash' })).toBeVisible();
  act(() => {
    useFamilyUiPermissions.setState({
      controller: {
        ...c,
        gov: { ...c.gov, actionOutcomes: { ...c.gov.actionOutcomes, 'trip.schedule.manage': 'propose' } },
      } as never,
    });
  });
  expect(screen.queryByRole('button', { name: 'Lodgings · Trash' })).toBeNull();
  expect(nativeStayControlsAllowed()).toBe(false);
});
function install() {
  const repo = new FamilyFrontendRepository(async () => {
    throw new Error('No session read during installation');
  });
  const cohort = createFamilyPlannerCohort(repo, { reportError: vi.fn() });
  release = cohort.install();
  return cohort;
}
it('installs creation and lifecycle together at the actual cohort seam and releases them together', () => {
  install();
  const p = currentPlannerStayWritePort();
  for (const name of [
    'create',
    'captureCreation',
    'eligibleLodging',
    'update',
    'trash',
    'trashPage',
    'restore',
  ] as const)
    expect(p?.[name]).toBeTypeOf('function');
  release?.();
  release = undefined;
  expect(currentPlannerStayWritePort()).toBeNull();
});
it.each([
  'https://hosted.supabase.invalid',
  'http://localhost:57171',
  'http://127.0.0.1:57171/',
  'http://127.0.0.1:56671',
])('does not install combined controls for %s', (url) => {
  vi.mocked(env.getSupabaseUrl).mockReturnValue(url);
  install();
  expect(currentPlannerStayWritePort()).toBeNull();
});
it.each(['VITE_FAMILY_STAY_COMMAND_QUALIFICATION', 'VITE_FAMILY_STAY_CONTROLS_QUALIFICATION'])(
  'does not install combined controls without %s',
  (flag) => {
    vi.stubEnv(flag, '');
    install();
    expect(currentPlannerStayWritePort()).toBeNull();
  }
);

it('preserves the exact action arguments and successful response', async () => {
  const result = { confirmed: true };
  const action = vi.fn(async (_id: number, _body: object) => result);
  const body = { value: 2 };
  expect(await nativeStayUiCall(action)(1, body)).toBe(result);
  expect(action).toHaveBeenCalledWith(1, body);
});
it.each([409, 503])('preserves the public Family refusal in the native %s error contract', async (status) => {
  const action = nativeStayUiCall(async () => {
    throw new FamilyApiError(status, 'native_stay_queued', 'The original stays retained.');
  });
  await expect(action()).rejects.toMatchObject({
    isAxiosError: true,
    message: 'The original stays retained.',
    response: { status, data: { error: 'The original stays retained.', code: 'native_stay_queued' } },
  });
});
it('does not expose or reinterpret unexpected internal errors', async () => {
  const error = new Error('private test detail');
  await expect(
    nativeStayUiCall(async () => {
      throw error;
    })()
  ).rejects.toBe(error);
});
