import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTrip } from '../../../tests/helpers/factories';
import { useTripStore } from '../../store/tripStore';
import { useFamilyController } from './controllerContext';

const runtime = vi.hoisted(() => ({ active: false }));
vi.mock('./runtime', () => ({ isFamilyFrontendActive: () => runtime.active }));

const TRIP = '11111111-1111-4111-8111-111111111111';
const VIEWER = '22222222-2222-4222-8222-222222222222';
vi.mock('./legacy/data/supabase/trips', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./legacy/data/supabase/trips')>();
  return {
    ...actual,
    fetchTripById: vi.fn(async () => ({
      id: TRIP,
      title: 'Harbor',
      family_id: '99999999-9999-4999-8999-999999999999',
      currency: 'EUR',
    })),
  };
});
vi.mock('./legacy/data/supabase/tripDays', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./legacy/data/supabase/tripDays')>();
  return { ...actual, syncTripDays: vi.fn(async () => undefined), listTripDays: vi.fn(async () => []) };
});
vi.mock('./legacy/data/supabase/tripPlaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./legacy/data/supabase/tripPlaces')>();
  return { ...actual, listTripPlaces: vi.fn(async () => []) };
});
vi.mock('./legacy/data/supabase/scheduleItems', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./legacy/data/supabase/scheduleItems')>();
  return { ...actual, listScheduleItems: vi.fn(async () => []) };
});
vi.mock('./legacy/data/supabase/dayNotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./legacy/data/supabase/dayNotes')>();
  return { ...actual, listDayNotes: vi.fn(async () => []) };
});
vi.mock('./legacy/data/supabase/catalogPlaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./legacy/data/supabase/catalogPlaces')>();
  return { ...actual, listTripCountryIds: vi.fn(async () => []) };
});
vi.mock('./legacy/data/supabase/tripTracks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./legacy/data/supabase/tripTracks')>();
  return { ...actual, listTripTracks: vi.fn(async () => []) };
});

import { FamilyTripBoundary, useFamilyTripTabBridge } from './FamilyTripBoundary';
import { FamilyIdentityRegistry } from './identity';
import { familyFrontend } from './repository';
import { FamilyViews } from './views';

function ControllerProbe({ tab = 'plan' }: { tab?: string }) {
  useFamilyTripTabBridge(tab);
  const controller = useFamilyController();
  return <button type="button">{controller ? 'Family controller' : 'Missing controller'}</button>;
}

function controllerRoute(tab = 'plan') {
  return (
    <MemoryRouter initialEntries={[`/trips/${TRIP}`]}>
      <Routes>
        <Route
          path="/trips/:id"
          element={
            <FamilyTripBoundary>
              <ControllerProbe tab={tab} />
            </FamilyTripBoundary>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function mockControllerReads(views: FamilyViews) {
  runtime.active = true;
  vi.spyOn(familyFrontend, 'views').mockResolvedValue(views);
  vi.spyOn(familyFrontend, 'knownViews').mockReturnValue(views);
  vi.spyOn(familyFrontend, 'subscribe').mockReturnValue(() => {});
  return {
    bookings: vi.spyOn(familyFrontend, 'canonicalBookings').mockResolvedValue([]),
    transports: vi.spyOn(familyFrontend, 'canonicalTransports').mockResolvedValue([]),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  useTripStore.setState(useTripStore.getInitialState(), true);
});

describe('FamilyTripBoundary', () => {
  it('renders the native trip child when the Family runtime is off', () => {
    runtime.active = false;
    render(
      <MemoryRouter initialEntries={['/trips/1']}>
        <Routes>
          <Route
            path="/trips/:id"
            element={
              <FamilyTripBoundary>
                <button type="button">Plan</button>
              </FamilyTripBoundary>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Plan' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('mounts the real Family controller when the runtime is on', async () => {
    mockControllerReads(new FamilyViews(new FamilyIdentityRegistry(VIEWER)));
    render(controllerRoute());
    expect(await screen.findByRole('button', { name: 'Family controller' })).toBeVisible();
  });

  it.each(['buchungen', 'transports'])('refreshes current-trip reservations from %s back to Plan', async (tab) => {
    const ids = new FamilyIdentityRegistry(VIEWER);
    const nativeTripId = ids.register('trip', TRIP);
    const { bookings, transports } = mockControllerReads(new FamilyViews(ids));
    const invalidate = vi.spyOn(familyFrontend, 'invalidateReservations');
    const loadReservations = vi.fn(async () => undefined);
    useTripStore.setState({ trip: buildTrip({ id: nativeTripId }), loadReservations });

    const route = render(controllerRoute());
    await screen.findByRole('button', { name: 'Family controller' });
    expect(bookings).toHaveBeenCalledExactlyOnceWith(TRIP);
    expect(transports).toHaveBeenCalledExactlyOnceWith(TRIP);
    bookings.mockClear();
    transports.mockClear();

    route.rerender(controllerRoute(tab));
    expect(invalidate).not.toHaveBeenCalled();
    expect(loadReservations).not.toHaveBeenCalled();

    route.rerender(controllerRoute('plan'));
    await waitFor(() => expect(loadReservations).toHaveBeenCalledExactlyOnceWith(nativeTripId));
    expect(invalidate).toHaveBeenCalledExactlyOnceWith(TRIP);
    expect(bookings).toHaveBeenCalledExactlyOnceWith(TRIP);
    expect(transports).toHaveBeenCalledExactlyOnceWith(TRIP);
  });
});
