import { render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FamilyOfflineTripEntry } from './FamilyOfflineTripEntry';
import { FamilyIdentityRegistry } from './identity';
import { createOfflineTripSession } from './offlineTripSession';
const mode = vi.hoisted(() => ({ phone: false }));
const source = 'http://127.0.0.1:57171',
  trip = '90000000-0000-4000-8000-000000000001';
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => 'http://127.0.0.1:57171' }));
vi.mock('../../mobile/useIsPhone', () => ({ useIsPhone: () => mode.phone }));
vi.mock('../../mobile/MobileShell', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('../../components/shared/ReadOnlyTripNotice', () => ({ default: () => null }));
vi.mock('../../pages/TripPlannerPage', () => ({ default: () => <NativeRoute variant="desktop" /> }));
vi.mock('../../mobile/screens/trip/MTripShell', () => ({ default: () => <NativeRoute variant="phone" /> }));
vi.mock('./offlineTripSession', () => ({ createOfflineTripSession: vi.fn() }));
function NativeRoute({ variant }: { variant: string }) {
  const { id } = useParams();
  return (
    <>
      <p>{variant + ':' + (id ?? 'missing')}</p>
      <Link to={'/trips/' + id}>Trip link</Link>
    </>
  );
}
const ids = new FamilyIdentityRegistry('90000000-0000-4000-8000-000000000002'),
  native = ids.register('trip', trip);
beforeEach(() => {
  mode.phone = false;
  vi.stubEnv('VITE_SUPABASE_URL', source);
  vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', 'local-native-v1');
  vi.mocked(createOfflineTripSession)
    .mockReset()
    .mockResolvedValue({ trip, ids, dispose: vi.fn() } as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it.each(['desktop', 'phone'])('provides a real matched Trip route to the native %s saved view', async (variant) => {
  mode.phone = variant === 'phone';
  render(
    <MemoryRouter initialEntries={['/trips/' + trip]}>
      <Routes>
        <Route path="/trips/:id" element={<FamilyOfflineTripEntry fallback={<p>Refused</p>} />} />
      </Routes>
    </MemoryRouter>
  );
  expect(await screen.findByText(variant + ':' + native)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Trip link' })).toHaveAttribute('href', '/trips/' + trip);
  expect(createOfflineTripSession).toHaveBeenCalledWith(trip, expect.any(Function));
});
it.each(['ordinary', 'numeric'])('keeps %s offline entry refused', (reason) => {
  if (reason === 'ordinary') vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', '');
  render(
    <MemoryRouter initialEntries={['/trips/' + (reason === 'numeric' ? native : trip)]}>
      <Routes>
        <Route path="/trips/:id" element={<FamilyOfflineTripEntry fallback={<p>Refused</p>} />} />
      </Routes>
    </MemoryRouter>
  );
  expect(screen.getByText('Refused')).toBeVisible();
  expect(createOfflineTripSession).not.toHaveBeenCalled();
});
