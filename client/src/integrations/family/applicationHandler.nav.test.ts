import { createElement, Fragment } from 'react';
import { useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSettings, buildUser } from '../../../tests/helpers/factories';
import { act, cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { apiClient } from '../../api/client';
import BottomNav from '../../components/Layout/BottomNav';
import Navbar from '../../components/Layout/Navbar';
import MBottomNav from '../../mobile/components/MBottomNav';
import { useAddonStore } from '../../store/addonStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { createFamilyApplicationHandler } from './applicationHandler';
import { compiledFeatureMap } from './legacy/data/supabase/familyFeatures';
import { useFamilyFeatureStore } from './legacy/store/familyFeatureStore';
import { FamilyFrontendRepository, familyReaders, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

// Unrelated navbar widgets must not make notification/help/assistant requests.
// The handler, Axios adapter, add-on store, nav components and router are real.
vi.mock('../../components/Layout/InAppNotificationBell.tsx', () => ({ default: () => null }));
vi.mock('../../components/Help/HelpButton', () => ({ default: () => null }));
vi.mock('../../components/Assistant/AssistantLauncher', () => ({ default: () => null }));
vi.mock('../../components/Assistant/useAssistantHome', () => ({
  useAssistantHomeLauncher: () => ({ available: false, open: vi.fn() }),
}));

const session: FamilySession = {
  userId: '10000000-0000-4000-8000-000000000001',
  personId: '10000000-0000-4000-8000-000000000002',
  familyId: '10000000-0000-4000-8000-000000000003',
  user: {
    username: 'Family member',
    email: 'member@fixture.invalid',
    avatar_url: null,
    created_at: '2026-01-01',
  },
};
const originalAdapter = apiClient.defaults.adapter;
const initialFeatures = useFamilyFeatureStore.getState();
const pages = [
  { id: 'vacay', label: /vacay/i },
  { id: 'atlas', label: /atlas/i },
  { id: 'collections', label: /collections/i },
  { id: 'journey', label: /journey/i },
];

function RouteLocation() {
  return createElement('output', { 'data-testid': 'route-location' }, useLocation().pathname);
}

beforeEach(() => {
  resetAllStores();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useSettingsStore, { settings: buildSettings({ language: 'en' }) });
  useFamilyFeatureStore.setState({
    features: { ...compiledFeatureMap(), vacay: true, journey: true, collections: true },
  });
  const repo = new FamilyFrontendRepository(async () => session, familyReaders);
  apiClient.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(repo));
});

afterEach(() => {
  cleanup();
  apiClient.defaults.adapter = originalAdapter;
  resetAllStores();
  useFamilyFeatureStore.setState(initialFeatures, true);
});

describe('Family /addons through the real API adapter and add-on store', () => {
  it('marks only enabled page add-ons as global and leaves Tours unavailable', async () => {
    await useAddonStore.getState().loadAddons();
    const { addons, loaded } = useAddonStore.getState();
    expect(loaded).toBe(true);
    for (const page of pages) {
      expect(addons.find((addon) => addon.id === page.id)).toMatchObject({ type: 'global', enabled: true });
    }
    expect(addons.filter((addon) => addon.type === 'core').map((addon) => addon.id)).toEqual([
      'packing',
      'budget',
      'documents',
    ]);
    expect(addons.map((addon) => addon.id)).not.toContain('tours');
    expect(addons.map((addon) => addon.id)).not.toContain('roadtrip');
    expect(addons.filter((addon) => addon.type === 'global').map((addon) => addon.icon)).toEqual([
      'CalendarDays',
      'Globe',
      'Bookmark',
      'Compass',
    ]);
  });

  it('preserves the Family-disabled features in the store', async () => {
    useFamilyFeatureStore.setState({
      features: { ...compiledFeatureMap(), vacay: false, journey: false, collections: false },
    });
    await useAddonStore.getState().loadAddons();
    expect(useAddonStore.getState().isEnabled('atlas')).toBe(true);
    for (const id of ['vacay', 'journey', 'collections', 'tours']) {
      expect(useAddonStore.getState().isEnabled(id)).toBe(false);
    }
  });
});

const surfaces = [
  { name: 'desktop navbar', component: Navbar, role: 'link' as const, overflow: false },
  { name: 'phone bottom nav', component: BottomNav, role: 'button' as const, overflow: false },
  { name: 'v5 phone dock', component: MBottomNav, role: 'button' as const, overflow: true },
];

describe.each(surfaces)('Family handler-to-navigation: $name', ({ component, role, overflow }) => {
  it('renders the actual handler results, navigates, and removes disabled links on reload', async () => {
    await useAddonStore.getState().loadAddons();
    render(createElement(Fragment, null, createElement(component), createElement(RouteLocation)), {
      initialEntries: ['/dashboard'],
    });
    if (overflow) fireEvent.click(await screen.findByRole('button', { name: /^more$/i }));
    const links = await Promise.all(([/my trips/i, ...pages.map((page) => page.label)]).map(
      (name) => screen.findByRole(role, { name })
    ));
    const groups = overflow ? [links.slice(0, 3), links.slice(3)] : [links];
    for (const group of groups) {
      group.slice(1).forEach((link, i) => {
        expect(group[i].compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      });
    }
    expect(screen.queryByRole(role, { name: /^tours$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole(role, { name: /^packing$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole(role, { name: /atlas/i }));
    await waitFor(() => expect(screen.getByTestId('route-location')).toHaveTextContent('/atlas'));
    await act(async () => {
      useFamilyFeatureStore.setState({
        features: { ...compiledFeatureMap(), vacay: false, journey: false, collections: false },
      });
      await useAddonStore.getState().loadAddons();
    });
    await waitFor(() => {
      for (const label of [/vacay/i, /journey/i, /collections/i]) {
        expect(screen.queryByRole(role, { name: label })).not.toBeInTheDocument();
      }
    });
    expect(screen.getByRole(role, { name: /atlas/i })).toBeInTheDocument();
  });
});
