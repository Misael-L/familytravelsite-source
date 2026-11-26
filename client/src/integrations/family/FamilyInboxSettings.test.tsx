import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { act, cleanup, fireEvent, render, screen } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { apiClient } from '../../api/client';
import NotificationsTab from '../../components/Settings/NotificationsTab';
import MNotifications from '../../mobile/screens/notifications/MNotifications';
import MSettingsNotifications from '../../mobile/screens/settings/MSettingsNotifications';
import InAppNotificationsPage from '../../pages/InAppNotificationsPage';
import { useAuthStore } from '../../store/authStore';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { activateFamilyFrontend } from './runtime';
import { createFamilyAxiosAdapter } from './transport';

const inbox = vi.hoisted(() => ({
  page: vi.fn(),
  count: vi.fn(),
}));

vi.mock('./legacy/data/supabase/familyNotifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./legacy/data/supabase/familyNotifications')>()),
  listMyNotifications: inbox.page,
  countMyUnreadNotifications: inbox.count,
}));

vi.mock('./applicationSettings', () => ({
  readFamilyApplicationSettings: async () => ({ settings: {} }),
}));

const session: FamilySession = {
  userId: 'b2470000-0000-4000-8000-000000000001',
  personId: 'b2470000-0000-4000-8000-000000000002',
  familyId: 'b2470000-0000-4000-8000-000000000003',
  user: {
    username: 'Fixture Family user',
    email: 'notification-review@fixture.invalid',
    avatar_url: null,
    created_at: '2026-01-01',
  },
};

const traffic: Array<{ method: string; path: string }> = [];
const originalAdapter = apiClient.defaults.adapter;

beforeEach(() => {
  resetAllStores();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  activateFamilyFrontend();
  inbox.page.mockResolvedValue({ items: [], nextCursor: null });
  inbox.count.mockResolvedValue(0);
  const repository = new FamilyFrontendRepository(async () => session);
  const handle = createFamilyApplicationHandler(repository);
  apiClient.defaults.adapter = createFamilyAxiosAdapter((request) => {
    traffic.push({ method: request.method, path: request.pathname });
    return handle(request);
  });
});

afterEach(() => {
  cleanup();
  apiClient.defaults.adapter = originalAdapter;
  resetAllStores();
  vi.clearAllMocks();
  traffic.length = 0;
});

describe.each([
  { screenName: 'Desktop', Settings: NotificationsTab, Inbox: InAppNotificationsPage },
  { screenName: 'Phone', Settings: MSettingsNotifications, Inbox: MNotifications },
])('$screenName Family notification settings', ({ Settings, Inbox }) => {
  it('offers the Family inbox without loading or writing any delivery settings', async () => {
    render(
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/notifications" element={<Inbox />} />
      </Routes>,
      { initialEntries: ['/settings?tab=notifications'] }
    );

    await act(async () => {});
    expect(screen.getByText('In-app notifications stay on for events that include you.')).toBeInTheDocument();
    expect(traffic).toEqual([]);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('Webhook URL')).toBeNull();
    expect(screen.queryByText('Error')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Show all notifications' }));

    expect(await screen.findByText('No notifications')).toBeInTheDocument();
    expect(inbox.page).toHaveBeenCalledWith(session.familyId, expect.objectContaining({ unreadOnly: false }));
    expect(inbox.count).toHaveBeenCalledWith(session.familyId);
    expect(traffic).toContainEqual({ method: 'GET', path: '/notifications/in-app' });
    expect(
      traffic.every(
        ({ method, path }) =>
          method === 'GET' && ['/notifications/in-app', '/notifications/in-app/unread-count', '/addons'].includes(path)
      )
    ).toBe(true);
  });
});
