import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { act, cleanup, render, screen } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { apiClient, authApi } from '../../api/client';
import AccountTab from '../../components/Settings/AccountTab';
import MSettingsAccount from '../../mobile/screens/settings/MSettingsAccount';
import { useAuthStore } from '../../store/authStore';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { activateFamilyFrontend } from './runtime';
import { createFamilyAxiosAdapter } from './transport';

const session: FamilySession = {
  userId: 'c9170000-0000-4000-8000-000000000001',
  personId: 'c9170000-0000-4000-8000-000000000002',
  familyId: 'c9170000-0000-4000-8000-000000000003',
  user: {
    username: 'Fixture account member',
    email: 'passkeys-review@fixture.invalid',
    avatar_url: null,
    created_at: '2026-01-01',
  },
};
const originalAdapter = apiClient.defaults.adapter;
const requests: string[] = [];
let releaseCredentials: () => void;

beforeEach(() => {
  resetAllStores();
  seedStore(useAuthStore, {
    user: buildUser({ username: session.user.username }),
    isAuthenticated: true,
    managed: true,
  });
  activateFamilyFrontend();
  const delayedCredentials = new Promise<void>((resolve) => {
    releaseCredentials = resolve;
  });
  const handle = createFamilyApplicationHandler(new FamilyFrontendRepository(async () => session));
  apiClient.defaults.adapter = createFamilyAxiosAdapter(async (request) => {
    requests.push(request.pathname);
    if (request.pathname === '/auth/passkey/credentials') await delayedCredentials;
    return handle(request);
  });
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    releaseCredentials();
  });
  apiClient.defaults.adapter = originalAdapter;
  resetAllStores();
  requests.length = 0;
});

describe.each([
  { surface: 'Desktop', Account: AccountTab },
  { surface: 'Phone', Account: MSettingsAccount },
])('$surface Family account settings', ({ Account }) => {
  it('keeps unavailable passkeys hidden and avoids the TREK credential request', async () => {
    render(<Account />);
    await expect(authApi.getAppConfig()).resolves.toMatchObject({
      password_login: true,
      passkey_login: false,
      passkey_configured: false,
    });
    await act(async () => {});

    expect.soft(screen.queryByText('Passkeys', { exact: true })).not.toBeInTheDocument();
    expect.soft(requests.filter((path) => path.startsWith('/auth/passkey/'))).toEqual([]);
    expect(screen.getByDisplayValue(session.user.username)).toBeInTheDocument();
  });
});
