import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { act, cleanup, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { apiClient } from '../../api/client';
import { ToastContainer } from '../../components/shared/Toast';
import VacaySettings from '../../components/Vacay/VacaySettings';
import MVacay from '../../mobile/screens/vacay/MVacay';
import MVacaySettingsSheet from '../../mobile/screens/vacay/MVacaySettingsSheet';
import VacayPage from '../../pages/VacayPage';
import { schoolHolidayCatalogRepo } from '../../repo/schoolHolidayCatalogRepo';
import { useAuthStore } from '../../store/authStore';
import { useVacayStore } from '../../store/vacayStore';
import { createFamilyApplicationHandler } from './applicationHandler';
import * as calendar from './legacy/data/supabase/vacay';
import { defaultFamilyCalendarSettings, settingsToVacayPlan } from './legacy/pages/vacay/vacayModel';
import { familyAuthStore, FamilyFrontendRepository, familyReaders, type FamilySession } from './repository';
import { activateFamilyFrontend } from './runtime';
import { createFamilyAxiosAdapter } from './transport';

const session: FamilySession = {
  userId: 'ef840000-0000-4000-8000-000000000001',
  personId: 'ef840000-0000-4000-8000-000000000002',
  familyId: 'ef840000-0000-4000-8000-000000000003',
  user: {
    username: 'Fixture account member',
    email: 'vacay-review@fixture.invalid',
    avatar_url: null,
    created_at: '2026-01-01',
  },
};
const year = new Date().getFullYear();
const originalAdapter = apiClient.defaults.adapter;
const originalFamilyAuth = familyAuthStore.getState();
const shareReads: string[] = [];
const statusCodes: number[] = [];

beforeEach(async () => {
  activateFamilyFrontend();
  familyAuthStore.setState({ membershipRole: 'child', isSuperAdmin: false });
  resetAllStores();
  useVacayStore.setState(useVacayStore.getInitialState(), true);
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true, managed: true });
  const settings = { ...defaultFamilyCalendarSettings(session.familyId), visibleYears: [year], holidaysEnabled: false };
  vi.spyOn(calendar, 'fetchCalendarSettings').mockResolvedValue(settings);
  vi.spyOn(calendar, 'loadVacayYear').mockResolvedValue({
    settings,
    plan: settingsToVacayPlan(settings, []),
    users: [],
    entries: [],
    blockedDates: [],
    ptoRows: [],
    tripWindows: [],
    overlay: {
      extraPersonIds: [],
      extraPeople: [],
      presets: [],
      pendingOutgoing: [],
      incomingPending: [],
      viewablePersonIds: [],
      visiblePersonIds: [],
      paintablePersonIds: [],
    },
  });
  const readers = {
    ...familyReaders,
    trips: { ...familyReaders.trips, listFamilyTrips: async () => ({ trips: [], archivedTrips: [] }) },
  };
  const repo = new FamilyFrontendRepository(
    async () => session,
    readers,
    () => ({
      ...session,
      source: 'https://vacay-fixture.invalid',
    })
  );
  await repo.session();
  const handle = createFamilyApplicationHandler(repo);
  apiClient.defaults.adapter = createFamilyAxiosAdapter(async (request) => {
    const sharing = request.pathname.startsWith('/addons/vacay/shares');
    if (sharing) shareReads.push(request.pathname);
    try {
      return await handle(request);
    } catch (error: unknown) {
      if (sharing && typeof error === 'object' && error && 'status' in error && typeof error.status === 'number') {
        statusCodes.push(error.status);
      }
      throw error;
    }
  });
});

afterEach(() => {
  cleanup();
  familyAuthStore.setState(originalFamilyAuth, true);
  apiClient.defaults.adapter = originalAdapter;
  useVacayStore.setState(useVacayStore.getInitialState(), true);
  resetAllStores();
  vi.restoreAllMocks();
  shareReads.length = 0;
  statusCodes.length = 0;
});

describe.each([
  { surface: 'Desktop', View: VacayPage, shareAction: 'Share calendar' },
  { surface: 'Phone', View: MVacay, shareAction: 'Shared Calendars' },
])('$surface Family vacation calendar', ({ View, shareAction }) => {
  it('loads supported calendar data without requesting or offering standalone calendar sharing', async () => {
    render(
      <>
        <View />
        <ToastContainer />
      </>,
      { initialEntries: ['/vacay'] }
    );
    await screen.findByRole('button', { name: 'Settings' });
    await waitFor(() => {
      expect(useVacayStore.getState()).toMatchObject({ selectedYear: year, years: [year], loading: false });
      expect(useVacayStore.getState().plan?.block_weekends).toEqual(expect.any(Boolean));
    });

    expect.soft(shareReads).toEqual([]);
    expect.soft(statusCodes).toEqual([]);
    expect.soft(screen.queryByRole('button', { name: shareAction })).not.toBeInTheDocument();
  });
});

const sampleCalendar = {
  id: 'ef840000-0000-4000-8000-000000000004',
  plan_id: session.familyId,
  region: 'IT',
  label: 'Household holidays',
  color: '#112233',
  sort_order: 0,
};

async function seedSettings(reviewer: boolean) {
  familyAuthStore.setState({ membershipRole: reviewer ? 'parent' : 'child' });
  const data = await calendar.loadVacayYear(session.familyId, year, session.personId);
  const settings = { ...data.settings, blockWeekends: true, holidaysEnabled: true };
  vi.mocked(calendar.loadVacayYear).mockResolvedValue({
    ...data,
    settings,
    plan: settingsToVacayPlan(settings, [sampleCalendar]),
  });
  server.use(
    http.get('https://nagerholidays.com/api/v4/Countries/Available', () => HttpResponse.json([])),
    http.get('https://nagerholidays.com/api/v4/Holidays/IT/:year', () => HttpResponse.json([]))
  );
  const schoolCatalog = vi
    .spyOn(schoolHolidayCatalogRepo, 'catalog')
    .mockRejectedValue(new Error('Unavailable fixture school catalog'));
  await useVacayStore.getState().loadPlan();
  useVacayStore.setState({ isFused: true });
  return { data, settings, schoolCatalog };
}

function weekendSwitch() {
  const label = screen.getByText('Block Weekends');
  const row = label.parentElement?.parentElement;
  const button = row?.querySelector('button') ?? row?.parentElement?.querySelector('button');
  if (!button) throw new Error('Weekend setting did not render');
  return button;
}

describe.each([
  { surface: 'Desktop', View: () => <VacaySettings onClose={() => {}} /> },
  { surface: 'Phone', View: () => <MVacaySettingsSheet open onClose={() => {}} /> },
])('$surface Family calendar settings', ({ View }) => {
  it('shows saved settings to a member without offering edits or unsupported features', async () => {
    const { schoolCatalog } = await seedSettings(false);
    await act(async () => {
      render(<View />);
    });
    expect.soft(weekendSwitch()).toBeDisabled();
    expect.soft(screen.queryByText('view only')).toBeInTheDocument();
    expect.soft(screen.queryByText(sampleCalendar.label)).toBeInTheDocument();
    expect.soft(screen.queryByPlaceholderText('Label (optional)')).not.toBeInTheDocument();
    for (const label of ['Vacation year', 'School Holidays', 'Dissolve Fusion'])
      expect.soft(screen.queryByText(label)).not.toBeInTheDocument();
    expect.soft(schoolCatalog).not.toHaveBeenCalled();
  });

  it('lets a reviewer save and reload the Family weekend preference', async () => {
    const { data, settings } = await seedSettings(true);
    const save = vi.spyOn(calendar, 'upsertCalendarSettings').mockImplementation(async (_family, patch) => {
      const updated = { ...settings, ...patch };
      vi.mocked(calendar.loadVacayYear).mockResolvedValue({
        ...data,
        settings: updated,
        plan: settingsToVacayPlan(updated, [sampleCalendar]),
      });
      return updated;
    });
    const user = userEvent.setup();
    await act(async () => {
      render(<View />);
    });
    expect(weekendSwitch()).toBeEnabled();
    await user.click(weekendSwitch());
    await waitFor(() => expect(useVacayStore.getState().plan?.block_weekends).toBe(false));
    expect(save).toHaveBeenCalledWith(session.familyId, { blockWeekends: false });
    expect((await apiClient.get('/addons/vacay/plan')).data.plan.block_weekends).toBe(false);
    for (const label of ['Vacation year', 'School Holidays', 'Dissolve Fusion'])
      expect.soft(screen.queryByText(label)).not.toBeInTheDocument();
  });
});

it('refuses writes to shared plan settings and holiday calendars from a view-only membership', async () => {
  await seedSettings(false);
  const editPlan = vi.spyOn(calendar, 'upsertCalendarSettings').mockRejectedValue(new Error('Would reach RLS'));
  const editCalendar = vi.spyOn(calendar, 'insertHolidayCalendar').mockRejectedValue(new Error('Would reach RLS'));
  const denied = { response: { status: 403, data: { code: 'calendar_manage_required' } } };
  await expect.soft(apiClient.put('/addons/vacay/plan', { block_weekends: false })).rejects.toMatchObject(denied);
  await expect
    .soft(apiClient.post('/addons/vacay/plan/holiday-calendars', { region: 'IT' }))
    .rejects.toMatchObject(denied);
  expect.soft(editPlan).not.toHaveBeenCalled();
  expect.soft(editCalendar).not.toHaveBeenCalled();
});

it('rejects a school-holiday calendar without saving it as a public-holiday calendar', async () => {
  await seedSettings(true);
  const save = vi.spyOn(calendar, 'insertHolidayCalendar').mockResolvedValue(sampleCalendar);
  await expect(
    apiClient.post('/addons/vacay/plan/holiday-calendars', { region: 'IT', type: 'school_holiday' })
  ).rejects.toMatchObject({ response: { status: 422, data: { code: 'calendar_feature_unavailable' } } });
  expect(save).not.toHaveBeenCalled();
});
