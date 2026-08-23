// FE-COMP-BOTTOMNAV-001 to FE-COMP-BOTTOMNAV-010

const { isSupabaseMock } = vi.hoisted(() => ({
  isSupabaseMock: vi.fn(() => false),
}))
vi.mock('../../data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('../../api/websocket', () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getSocketId: vi.fn(() => null),
  setRefetchCallback: vi.fn(),
  setPreReconnectHook: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { render, screen } from '../../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAddonStore } from '../../store/addonStore';
import { usePluginStore } from '../../store/pluginStore';
import { useFamilyFeatureStore } from '../../store/familyFeatureStore';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { buildUser, buildSettings } from '../../../tests/helpers/factories';
import BottomNav from './BottomNav';

const currentUser = buildUser({ id: 1, username: 'testuser', email: 'test@example.com' });

beforeEach(() => {
  resetAllStores();
  isSupabaseMock.mockReturnValue(false);
  mockNavigate.mockClear();
  sessionStorage.clear();
  seedStore(useAuthStore, { user: currentUser, isAuthenticated: true });
});

describe('BottomNav', () => {
  it('FE-COMP-BOTTOMNAV-001: renders without crashing', () => {
    render(<BottomNav />);
    expect(document.body).toBeInTheDocument();
  });

  it('FE-COMP-BOTTOMNAV-002: shows the dashboard nav item', () => {
    render(<BottomNav />);
    expect(screen.getByText('My Trips')).toBeInTheDocument();
  });

  it('FE-COMP-BOTTOMNAV-003: centre create button creates a new trip by default', async () => {
    const user = userEvent.setup();
    render(<BottomNav />);
    await user.click(screen.getByRole('button', { name: 'New Trip' }));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard?create=1');
  });

  it('FE-COMP-BOTTOMNAV-004: dashboard label translates when language is fr', async () => {
    seedStore(useSettingsStore, { settings: buildSettings({ language: 'fr' }) });
    render(<BottomNav />);
    expect(await screen.findByText('Mes voyages')).toBeInTheDocument();
  });

  it('FE-COMP-BOTTOMNAV-005: addon labels translate when language is fr', async () => {
    seedStore(useSettingsStore, { settings: buildSettings({ language: 'fr' }) });
    seedStore(useAddonStore, {
      addons: [
        { id: 'vacay', name: 'Vacay', type: 'global', icon: 'calendar', enabled: true },
        { id: 'atlas', name: 'Atlas', type: 'global', icon: 'globe', enabled: true },
        { id: 'journey', name: 'Journey', type: 'global', icon: 'compass', enabled: true },
      ],
    });
    render(<BottomNav />);
    expect(await screen.findByText('Vacances')).toBeInTheDocument();
    expect(await screen.findByText('Atlas')).toBeInTheDocument();
    expect(await screen.findByText('Journal de voyage')).toBeInTheDocument();
  });

  it('FE-COMP-BOTTOMNAV-006: unknown addon id is not rendered', () => {
    seedStore(useAddonStore, {
      addons: [{ id: 'foo', name: 'Foo Addon', type: 'global', icon: 'star', enabled: true }],
    });
    render(<BottomNav />);
    expect(screen.queryByText('Foo Addon')).not.toBeInTheDocument();
  });

  // Context-aware "+" inside a trip — #1349
  it('FE-COMP-BOTTOMNAV-007: in a trip, the "+" adds a place by default (plan tab)', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('trip-tab-42', 'plan');
    render(<BottomNav />, { initialEntries: ['/trips/42'] });
    await user.click(screen.getByRole('button', { name: 'Add Place/Activity' }));
    expect(mockNavigate).toHaveBeenCalledWith('/trips/42?create=place');
  });

  it('FE-COMP-BOTTOMNAV-008: Bookings tab → "+" creates a reservation', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('trip-tab-42', 'buchungen');
    render(<BottomNav />, { initialEntries: ['/trips/42'] });
    await user.click(screen.getByRole('button', { name: 'Manual Booking' }));
    expect(mockNavigate).toHaveBeenCalledWith('/trips/42?create=reservation');
  });

  it('FE-COMP-BOTTOMNAV-009: Transports tab → "+" creates a transport', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('trip-tab-42', 'transports');
    render(<BottomNav />, { initialEntries: ['/trips/42'] });
    await user.click(screen.getByRole('button', { name: 'Transport' }));
    expect(mockNavigate).toHaveBeenCalledWith('/trips/42?create=transport');
  });

  it('FE-COMP-BOTTOMNAV-010: Costs tab → "+" creates an expense', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('trip-tab-42', 'finanzplan');
    render(<BottomNav />, { initialEntries: ['/trips/42'] });
    await user.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(mockNavigate).toHaveBeenCalledWith('/trips/42?create=expense');
  });

  it('FE-COMP-BOTTOMNAV-011: page plugin renders the icon its manifest declares', () => {
    seedStore(usePluginStore, {
      plugins: [{ id: 'trip-doctor', name: 'Trip Doctor', type: 'page', icon: 'Stethoscope' }],
    });
    const { container } = render(<BottomNav />);
    expect(screen.getByText('Trip Doctor')).toBeInTheDocument();
    expect(container.querySelector('.lucide-stethoscope')).not.toBeNull();
  });

  it('FE-COMP-BOTTOMNAV-012: page plugin with an unknown icon falls back to Blocks', () => {
    seedStore(usePluginStore, {
      plugins: [{ id: 'bogus', name: 'Bogus', type: 'page', icon: 'NotAnIcon' }],
    });
    const { container } = render(<BottomNav />);
    expect(container.querySelector('.lucide-blocks')).not.toBeNull();
  });

  it('FE-COMP-BOTTOMNAV-013: Family plane shows Vacay next to My Trips without Nest addons', async () => {
    isSupabaseMock.mockReturnValue(true);
    seedStore(useAddonStore, { addons: [] });
    const user = userEvent.setup();
    render(<BottomNav />);
    expect(screen.getByText('Vacay')).toBeInTheDocument();
    await user.click(screen.getByText('Vacay'));
    expect(mockNavigate).toHaveBeenCalledWith('/vacay');
  });

  it('FE-COMP-BOTTOMNAV-013b: Family plane shows Collections without Nest addons', async () => {
    isSupabaseMock.mockReturnValue(true);
    seedStore(useAddonStore, { addons: [] });
    const user = userEvent.setup();
    render(<BottomNav />);
    expect(screen.getByText('Collections')).toBeInTheDocument();
    await user.click(screen.getByText('Collections'));
    expect(mockNavigate).toHaveBeenCalledWith('/collections');
  });

  it('hides Vacay and Collections when those family features are off', () => {
    isSupabaseMock.mockReturnValue(true);
    seedStore(useAddonStore, { addons: [] });
    seedStore(useFamilyFeatureStore, {
      features: { vacay: false, collections: false, 'workspace.place_categories': true },
      hydrated: true,
    });
    render(<BottomNav />);
    expect(screen.queryByText('Vacay')).not.toBeInTheDocument();
    expect(screen.queryByText('Collections')).not.toBeInTheDocument();
  });

  it('FE-COMP-BOTTOMNAV-014: Nest plane does not show Vacay when the addon is off', () => {
    seedStore(useAddonStore, { addons: [] });
    render(<BottomNav />);
    expect(screen.queryByText('Vacay')).not.toBeInTheDocument();
  });
});
