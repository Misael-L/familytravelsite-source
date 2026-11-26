// organize-imports-ignore
// sort-imports-ignore
// Install original hoisted mocks before consumers and preserve dependency evaluation order.
import { fixtureState, env, toasts, renderPlanner, seedTrip } from '../../../tests/helpers/tripPlannerHook/state';
import 'react';
import { act, waitFor } from '@testing-library/react';
import '../../i18n/TranslationContext';
import '../../i18n';
import './useTripPlanner';
import { useTripStore } from '../../store/tripStore';
import { useAuthStore } from '../../store/authStore';
import '../../store/settingsStore';
import { usePermissionsStore } from '../../store/permissionsStore';
import '../../store/pluginStore';
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore';
import '../../store/addonStore';
import { seedStore } from '../../../tests/helpers/store';
import { buildUser, buildPlace, buildReservation } from '../../../tests/helpers/factories';
import { mapsApi } from '../../api/client';
import { accommodationRepo } from '../../repo/accommodationRepo';
import { saveImportFiles, getImportFiles } from '../../db/offlineDb';
import '../../services/photoService';
import type { Reservation } from '../../types';
import '../../mobile/useIsPhone';
import '../../../tests/helpers/plannerActions';

describe('useTripPlanner — bookings and transports', () => {
  it('FE-TP-HOOK-075: a new booking is saved on the selected day and closes the modal', async () => {
    seedTrip({ selectedDayId: 7 });

    const { result } = await renderPlanner();
    act(() => {
      result.current.setShowReservationModal(true);
    });

    await act(async () => {
      await result.current.handleSaveReservation({ title: 'Dinner', type: 'restaurant' });
    });

    expect(fixtureState.actions.addReservation).toHaveBeenCalledWith(42, {
      title: 'Dinner',
      type: 'restaurant',
      day_id: 7,
    });
    expect(result.current.showReservationModal).toBe(false);
  });

  it('FE-TP-HOOK-076: a booking with a linked cost reloads the budget items', async () => {
    seedTrip();

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleSaveReservation({ title: 'Dinner', type: 'restaurant', create_budget_entry: 1 });
    });

    expect(fixtureState.actions.loadBudgetItems).toHaveBeenCalledWith(42);
  });

  it('FE-TP-HOOK-077: a new hotel refreshes the accommodation list', async () => {
    seedTrip();
    const { result } = await renderPlanner();
    // Stubbed after the mount's own read, so only the refresh can bring the stay in.
    vi.mocked(accommodationRepo.list).mockResolvedValue({ accommodations: [{ id: 3 }] as never });
    await act(async () => {
      await result.current.handleSaveReservation({ title: 'Ryokan', type: 'hotel' });
    });

    await waitFor(() => expect(result.current.tripAccommodations).toHaveLength(1));
  });

  it('FE-TP-HOOK-078: editing a booking never forces a day_id onto the payload', async () => {
    const reservation = buildReservation({ id: 5, type: 'hotel' });
    seedTrip({ selectedDayId: 7, reservations: [reservation] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.setEditingReservation(reservation);
    });

    await act(async () => {
      await result.current.handleSaveReservation({ title: 'Ryokan', type: 'hotel' });
    });

    expect(fixtureState.actions.updateReservation).toHaveBeenCalledWith(42, 5, { title: 'Ryokan', type: 'hotel' });
    expect(result.current.editingReservation).toBeNull();
  });

  it('FE-TP-HOOK-079: an edited hotel address is written through to the linked place', async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2, address: 'Old street 1' });
    seedTrip({ places: [place] });

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleSaveReservation({
        title: 'Ryokan',
        type: 'hotel',
        create_accommodation: { place_id: 1, address: '  New street 2  ' },
      } as never);
    });

    expect(fixtureState.actions.updatePlace).toHaveBeenCalledWith(42, 1, { address: 'New street 2' });
    const payload = fixtureState.actions.addReservation.mock.calls[0][1] as {
      create_accommodation: Record<string, unknown>;
    };
    expect(payload.create_accommodation).not.toHaveProperty('address');
  });

  it('FE-TP-HOOK-080: an imported hotel venue is matched against the existing places', async () => {
    seedTrip({ places: [buildPlace({ id: 4, name: 'Hotel Granvia', lat: 1, lng: 2 })] });

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleSaveReservation({
        title: 'Stay',
        type: 'hotel',
        create_accommodation: { venue: { name: 'hotel granvia' } },
      } as never);
    });

    const payload = fixtureState.actions.addReservation.mock.calls[0][1] as {
      create_accommodation: { place_id?: number; venue?: unknown };
    };
    expect(payload.create_accommodation.place_id).toBe(4);
    expect(payload.create_accommodation.venue).toBeUndefined();
    expect(fixtureState.actions.addPlace).not.toHaveBeenCalled();
  });

  it('FE-TP-HOOK-080b: a venue name that only partially matches still links that place', async () => {
    seedTrip({ places: [buildPlace({ id: 6, name: 'Granvia', lat: 1, lng: 2 })] });

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleSaveReservation({
        title: 'Stay',
        type: 'hotel',
        create_accommodation: { venue: { name: 'Hotel Granvia Kyoto' } },
      } as never);
    });

    const payload = fixtureState.actions.addReservation.mock.calls[0][1] as {
      create_accommodation: { place_id?: number };
    };
    expect(payload.create_accommodation.place_id).toBe(6);
    expect(mapsApi.search).not.toHaveBeenCalled();
  });

  it('FE-TP-HOOK-081: an unknown venue is geocoded and created as a new place', async () => {
    vi.mocked(mapsApi.search).mockResolvedValue({
      places: [{ lat: 35.1, lng: 135.7, address: 'Kyoto, JP' }],
    } as never);
    seedTrip();

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleSaveReservation({
        title: 'Stay',
        type: 'hotel',
        create_accommodation: { venue: { name: 'Ryokan Sakura', address: 'Gion' } },
      } as never);
    });

    expect(mapsApi.search).toHaveBeenCalledWith('Ryokan Sakura Gion');
    // Created through the store (addPlace), which unwraps the API's { place }
    // envelope and pushes the place into `places` — not through placesApi
    // directly, whose envelope used to be read as the place itself (#2243).
    expect(fixtureState.actions.addPlace).toHaveBeenCalledWith(42, {
      name: 'Ryokan Sakura',
      lat: 35.1,
      lng: 135.7,
      address: 'Gion',
    });
    const payload = fixtureState.actions.addReservation.mock.calls[0][1] as {
      create_accommodation: { place_id?: number; venue?: unknown };
    };
    expect(payload.create_accommodation.place_id).toBe(900);
    expect(payload.create_accommodation.venue).toBeUndefined();
  });

  it('FE-TP-HOOK-081c: the place created for a new hotel is linked, so the next save of the same hotel reuses it (#2243)', async () => {
    vi.mocked(mapsApi.search).mockResolvedValue({
      places: [{ lat: 35.1, lng: 135.7, address: 'Kyoto, JP' }],
    } as never);
    // The real addPlace puts the created place into the store; mirror that so
    // the second save sees it the way the planner does after a create.
    fixtureState.actions.addPlace.mockImplementation(async (_tripId: unknown, data: { name: string }) => {
      const created = buildPlace({ id: 901, name: data.name, lat: 35.1, lng: 135.7 });
      useTripStore.setState((s) => ({ places: [created, ...s.places] }));
      return created;
    });
    seedTrip();

    const { result } = await renderPlanner();
    const save = () =>
      result.current.handleSaveReservation({
        title: 'Ryokan Sakura',
        type: 'hotel',
        create_accommodation: { venue: { name: 'Ryokan Sakura' } },
      } as never);
    await act(async () => {
      await save();
    });
    await act(async () => {
      await save();
    });

    expect(fixtureState.actions.addPlace).toHaveBeenCalledTimes(1);
    const first = fixtureState.actions.addReservation.mock.calls[0][1] as {
      create_accommodation: { place_id?: number };
    };
    const second = fixtureState.actions.addReservation.mock.calls[1][1] as {
      create_accommodation: { place_id?: number };
    };
    expect(first.create_accommodation.place_id).toBe(901);
    expect(second.create_accommodation.place_id).toBe(901);
  });

  it("FE-TP-HOOK-081d: offline, a new hotel's place skips the geocode and is linked by its temp id", async () => {
    env.forcedOffline = true;
    fixtureState.actions.addPlace.mockResolvedValue(buildPlace({ id: -1758000000001, name: 'Ryokan Sakura' }));
    seedTrip();

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleSaveReservation({
        title: 'Ryokan Sakura',
        type: 'hotel',
        create_accommodation: { venue: { name: 'Ryokan Sakura' } },
      } as never);
    });

    // Offline the booking queues behind the place and is sent with the place's real id (#2601).
    expect(mapsApi.search).not.toHaveBeenCalled();
    expect(fixtureState.actions.addPlace.mock.calls).toEqual([
      [42, { name: 'Ryokan Sakura', lat: null, lng: null, address: null }],
    ]);
    const payload = fixtureState.actions.addReservation.mock.calls[0][1] as {
      create_accommodation: { place_id?: number };
    };
    expect(payload.create_accommodation.place_id).toBe(-1758000000001);
  });

  it('FE-TP-HOOK-081e: a place still holding an offline temp id is not linked as the accommodation', async () => {
    fixtureState.actions.addPlace.mockResolvedValue(buildPlace({ id: 902, name: 'Ryokan Sakura' }));
    seedTrip({ places: [buildPlace({ id: -1758000000000, name: 'Ryokan Sakura' })] });

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleSaveReservation({
        title: 'Ryokan Sakura',
        type: 'hotel',
        create_accommodation: { venue: { name: 'Ryokan Sakura' } },
      } as never);
    });

    const payload = fixtureState.actions.addReservation.mock.calls[0][1] as {
      create_accommodation: { place_id?: number };
    };
    expect(payload.create_accommodation.place_id).toBe(902);
  });

  it('FE-TP-HOOK-081b: a geocoded venue without a reviewed address adopts the hit address', async () => {
    vi.mocked(mapsApi.search).mockResolvedValue({
      places: [{ lat: 35.1, lng: 135.7, address: 'Kyoto, JP' }],
    } as never);
    seedTrip();

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleSaveReservation({
        title: 'Stay',
        type: 'hotel',
        create_accommodation: { venue: { name: 'Ryokan Sakura' } },
      } as never);
    });

    expect(mapsApi.search).toHaveBeenCalledWith('Ryokan Sakura');
    expect(fixtureState.actions.addPlace).toHaveBeenCalledWith(42, {
      name: 'Ryokan Sakura',
      lat: 35.1,
      lng: 135.7,
      address: 'Kyoto, JP',
    });
  });

  it('FE-TP-HOOK-082: a failed geocode still creates the place, a failed create yields no link', async () => {
    vi.mocked(mapsApi.search).mockRejectedValue(new Error('overpass down'));
    fixtureState.actions.addPlace.mockRejectedValue(new Error('quota'));
    seedTrip();

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleSaveReservation({
        title: 'Stay',
        type: 'hotel',
        create_accommodation: { venue: { name: 'Nowhere Inn' } },
      } as never);
    });

    expect(fixtureState.actions.addPlace).toHaveBeenCalled();
    const payload = fixtureState.actions.addReservation.mock.calls[0][1] as {
      create_accommodation: { place_id?: number };
    };
    expect(payload.create_accommodation.place_id).toBeUndefined();
  });

  it('FE-TP-HOOK-083: a failing booking save toasts the server message', async () => {
    seedTrip();
    fixtureState.actions.addReservation.mockRejectedValue(new Error('invalid date'));

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleSaveReservation({ title: 'Dinner', type: 'restaurant' });
    });

    expect(toasts.some((t) => t.message === 'invalid date')).toBe(true);
  });

  it('FE-TP-HOOK-084: a new transport closes the modal and reloads costs when one was linked', async () => {
    seedTrip();

    const { result } = await renderPlanner();
    act(() => {
      result.current.setShowTransportModal(true);
      result.current.setTransportModalDayId(7);
    });

    await act(async () => {
      await result.current.handleSaveTransport({ title: 'Shinkansen', type: 'train', create_budget_entry: true });
    });

    expect(fixtureState.actions.addReservation).toHaveBeenCalledWith(42, {
      title: 'Shinkansen',
      type: 'train',
      create_budget_entry: true,
    });
    expect(fixtureState.actions.loadBudgetItems).toHaveBeenCalledWith(42);
    expect(result.current.showTransportModal).toBe(false);
    expect(result.current.transportModalDayId).toBeNull();
  });

  it('FE-TP-HOOK-085: editing a transport updates it and clears the editor', async () => {
    const reservation = buildReservation({ id: 8, type: 'train' });
    seedTrip({ reservations: [reservation] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.setEditingTransport(reservation);
    });

    await act(async () => {
      await result.current.handleSaveTransport({ title: 'Shinkansen', type: 'train' });
    });

    expect(fixtureState.actions.updateReservation).toHaveBeenCalledWith(42, 8, { title: 'Shinkansen', type: 'train' });
    expect(result.current.editingTransport).toBeNull();
  });

  it('FE-TP-HOOK-086: a failing transport save toasts', async () => {
    seedTrip();
    fixtureState.actions.addReservation.mockRejectedValue(new Error('bad leg'));

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleSaveTransport({ title: 'Bus', type: 'bus' });
    });

    expect(toasts.some((t) => t.message === 'bad leg')).toBe(true);
  });

  it('FE-TP-HOOK-087: deleting a booking refreshes the accommodations', async () => {
    seedTrip();
    const { result } = await renderPlanner();
    // Stubbed after the mount's own read, so only the refresh can bring the stay in.
    vi.mocked(accommodationRepo.list).mockResolvedValue({ accommodations: [{ id: 1 }] as never });
    await act(async () => {
      await result.current.handleDeleteReservation(5);
    });

    expect(fixtureState.actions.deleteReservation).toHaveBeenCalledWith(42, 5);
    await waitFor(() => expect(result.current.tripAccommodations).toHaveLength(1));
  });

  it('FE-TP-HOOK-088: a failing booking delete toasts', async () => {
    seedTrip();
    fixtureState.actions.deleteReservation.mockRejectedValue(new Error('referenced'));

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleDeleteReservation(5);
    });

    expect(toasts.some((t) => t.message === 'referenced')).toBe(true);
  });

  it('FE-TP-HOOK-164: a transit journey opens in the full transport editor and leaves the journey view', async () => {
    seedTrip();
    const journey = buildReservation({ id: 9, type: 'transit', day_id: 7 });

    const { result } = await renderPlanner();
    act(() => {
      result.current.setTransitJourney(journey);
    });
    act(() => {
      result.current.openTransportEditor(journey);
    });

    expect(result.current.editingTransport).toBe(journey);
    expect(result.current.transportModalDayId).toBe(7);
    expect(result.current.transportModalAutomated).toBe(false);
    expect(result.current.transitPrefill).toBeNull();
    expect(result.current.transitJourney).toBeNull();
    expect(result.current.showTransportModal).toBe(true);
  });

  it("FE-TP-HOOK-165: changing a journey's route seeds the transit search with its stops", async () => {
    seedTrip();
    const journey = buildReservation({
      id: 9,
      type: 'transit',
      day_id: 7,
      endpoints: [
        { role: 'from', name: 'Kyoto', lat: 34.9, lng: 135.7 },
        { role: 'to', name: 'Osaka', lat: 34.7, lng: 135.5 },
      ] as never,
    });

    const { result } = await renderPlanner();
    act(() => {
      result.current.changeTransitRoute(journey);
    });

    expect(result.current.transitPrefill).toEqual({
      from: { name: 'Kyoto', lat: 34.9, lng: 135.7 },
      to: { name: 'Osaka', lat: 34.7, lng: 135.5 },
    });
    expect(result.current.editingTransport).toBe(journey);
    expect(result.current.transportModalDayId).toBe(7);
    expect(result.current.transportModalAutomated).toBe(true);
    expect(result.current.showTransportModal).toBe(true);
  });

  it('FE-TP-HOOK-166: a journey without stops or day seeds an empty search', async () => {
    seedTrip();
    const journey = buildReservation({ id: 9, type: 'transit', day_id: null });

    const { result } = await renderPlanner();
    act(() => {
      result.current.changeTransitRoute(journey);
    });

    expect(result.current.transitPrefill).toEqual({ from: null, to: null });
    expect(result.current.transportModalDayId).toBeNull();
  });
});

describe("useTripPlanner — the plan's booking detail", () => {
  const routedTrain = (over: Partial<Reservation> = {}) =>
    buildReservation({
      id: 20,
      type: 'train',
      title: 'Shinkansen',
      day_id: 7,
      endpoints: [
        { role: 'from', name: 'Tokyo', lat: 35.68, lng: 139.76, sequence: 0 },
        { role: 'to', name: 'Kyoto', lat: 34.98, lng: 135.75, sequence: 1 },
      ] as never,
      ...over,
    });

  it("FE-TP-HOOK-167: a booking opens by id, shows the store's copy and closes by itself once it is gone", async () => {
    const dinner = buildReservation({ id: 5, type: 'restaurant', title: 'Dinner' });
    seedTrip({ reservations: [dinner] });

    const { result } = await renderPlanner();
    expect(result.current.bookingDetail).toBeNull();

    act(() => {
      result.current.openBookingDetail(dinner);
    });
    expect(result.current.bookingDetail).toBe(dinner);

    const renamed = { ...dinner, title: 'Dinner at Kikunoi' };
    act(() => {
      useTripStore.setState({ reservations: [renamed] });
    });
    expect(result.current.bookingDetail).toBe(renamed);

    act(() => {
      useTripStore.setState({ reservations: [] });
    });
    expect(result.current.bookingDetail).toBeNull();

    act(() => {
      useTripStore.setState({ reservations: [renamed] });
    });
    act(() => {
      result.current.closeBookingDetail();
    });
    expect(result.current.bookingDetail).toBeNull();
  });

  it('FE-TP-HOOK-168: Edit opens the transport editor for a transport and the booking editor for anything else', async () => {
    const train = routedTrain();
    const dinner = buildReservation({ id: 5, type: 'restaurant', title: 'Dinner' });
    seedTrip({ reservations: [train, dinner] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.openBookingDetail(train);
    });
    expect(result.current.bookingDetailEditor).toBe(result.current.openTransportEditor);
    act(() => {
      result.current.bookingDetailEditor!(train);
    });
    expect(result.current.editingTransport).toBe(train);
    expect(result.current.showTransportModal).toBe(true);
    expect(result.current.showReservationModal).toBe(false);

    act(() => {
      result.current.openBookingDetail(dinner);
    });
    act(() => {
      result.current.bookingDetailEditor!(dinner);
    });
    expect(result.current.editingReservation).toBe(dinner);
    expect(result.current.showReservationModal).toBe(true);
  });

  it('FE-TP-HOOK-169: without day_edit a transport has no editor and a journey no route change', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 2, role: 'user' }) });
    usePermissionsStore.setState({ permissions: { day_edit: 'admin' } });
    const train = routedTrain();
    const dinner = buildReservation({ id: 5, type: 'restaurant', title: 'Dinner' });
    seedTrip({ reservations: [train, dinner] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.openBookingDetail(train);
    });
    expect(result.current.bookingDetailEditor).toBeUndefined();
    expect(result.current.bookingDetailChangeRoute).toBeUndefined();

    // The booking editor asks for reservation_edit only, as on the Bookings tab.
    act(() => {
      result.current.openBookingDetail(dinner);
    });
    expect(typeof result.current.bookingDetailEditor).toBe('function');
  });

  it('FE-TP-HOOK-170: without reservation_edit a booking has no editor, while a journey keeps its route change', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 2, role: 'user' }) });
    usePermissionsStore.setState({ permissions: { reservation_edit: 'admin' } });
    const dinner = buildReservation({ id: 5, type: 'restaurant', title: 'Dinner' });
    seedTrip({ reservations: [dinner] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.openBookingDetail(dinner);
    });

    expect(result.current.bookingDetailEditor).toBeUndefined();
    expect(result.current.bookingDetailChangeRoute).toBe(result.current.changeTransitRoute);
  });

  it('FE-TP-HOOK-171: On map switches a route on and opens its day, and a second press switches it off', async () => {
    const train = routedTrain();
    seedTrip({ reservations: [train] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.showBookingOnMap(train);
    });

    expect(result.current.visibleConnections).toEqual([20]);
    expect(fixtureState.actions.setSelectedDay).toHaveBeenCalledWith(7);
    expect(result.current.activeTab).toBe('plan');

    act(() => {
      result.current.showBookingOnMap(train);
    });
    expect(result.current.visibleConnections).toEqual([]);
  });

  it('FE-TP-HOOK-172: On map for a booking at a place selects that place on its day', async () => {
    const dinner = buildReservation({ id: 5, type: 'restaurant', title: 'Dinner', place_id: 33, day_id: 7 });
    seedTrip({ reservations: [dinner] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.showBookingOnMap(dinner);
    });

    expect(fixtureState.actions.setSelectedDay).toHaveBeenCalledWith(7);
    expect(result.current.selectedPlaceId).toBe(33);
  });
  it('FE-TP-HOOK-173: a booking opened from the day list asks for day_edit before its editor, as that row did', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 2, role: 'user' }) });
    usePermissionsStore.setState({ permissions: { day_edit: 'admin' } });
    const dinner = buildReservation({ id: 5, type: 'restaurant', title: 'Dinner' });
    seedTrip({ reservations: [dinner] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.openBookingFromDayList(dinner);
    });
    expect(result.current.bookingDetail).toBe(dinner);
    expect(result.current.bookingDetailEditor).toBeUndefined();

    // The same booking from anywhere else keeps the booking editor's own right.
    act(() => {
      result.current.openBookingDetail(dinner);
    });
    expect(typeof result.current.bookingDetailEditor).toBe('function');
  });

  it('FE-TP-HOOK-174: with day_edit the day list hands a booking to its editor like any other place', async () => {
    const dinner = buildReservation({ id: 5, type: 'restaurant', title: 'Dinner' });
    seedTrip({ reservations: [dinner] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.openBookingFromDayList(dinner);
    });
    act(() => {
      result.current.bookingDetailEditor!(dinner);
    });

    expect(result.current.editingReservation).toBe(dinner);
    expect(result.current.showReservationModal).toBe(true);
  });

  it('FE-TP-HOOK-175: a booking is on the map while its route is switched on', async () => {
    const train = routedTrain();
    seedTrip({ reservations: [train] });

    const { result } = await renderPlanner();
    expect(result.current.isBookingOnMap(train)).toBe(false);

    act(() => {
      result.current.showBookingOnMap(train);
    });
    expect(result.current.isBookingOnMap(train)).toBe(true);
  });
});

describe('useTripPlanner — booking import review', () => {
  const hotelItem = { type: 'hotel', title: 'Ryokan', source: { fileName: 'mail.pdf' } };
  const flightItem = { type: 'flight', title: 'NRT → CDG' };

  it('FE-TP-HOOK-089: the review starts on the first item and routes hotels to the booking modal', async () => {
    seedTrip();

    const { result } = await renderPlanner();
    const file = new File(['x'], 'mail.pdf');

    act(() => {
      result.current.startImportReview([hotelItem, flightItem] as never, [file]);
    });

    expect(result.current.importReviewActive).toBe(true);
    expect(result.current.showReservationModal).toBe(true);
    expect(result.current.reservationPrefill?.title).toBe('Ryokan');
    expect(result.current.reservationPrefill?._sourceFiles).toEqual([file]);
  });

  // #2076 — an item whose type neither form can express used to land in the booking
  // form, which offers six chips and not one transport among them, so the only
  // honest pick left was 'other'. The tab the import started from breaks the tie.
  it('FE-TP-HOOK-112: an unreadable item opens the transport form when the import began there', async () => {
    seedTrip();
    const { result } = await renderPlanner();
    const odd = { type: 'shuttle-voucher', title: 'Airport transfer' };

    // The tab now travels with the review rather than living in component state:
    // the parse outlives navigation and reload, and the review is triggered by the
    // global widget, so by then the state has remounted back to its default.
    act(() => {
      result.current.startImportReview([odd] as never, [], 'transports');
    });

    expect(result.current.showTransportModal).toBe(true);
    expect(result.current.showReservationModal).toBe(false);
  });

  it('FE-TP-HOOK-113: the same item opens the booking form when the import began there', async () => {
    seedTrip();
    const { result } = await renderPlanner();
    const odd = { type: 'shuttle-voucher', title: 'Airport transfer' };

    act(() => {
      result.current.startImportReview([odd] as never, [], 'bookings');
    });

    expect(result.current.showReservationModal).toBe(true);
    expect(result.current.showTransportModal).toBe(false);
  });

  // The case that actually occurs. The server only ever emits its eight known
  // types, so 'shuttle-voucher' above never reaches a real import: a document the
  // model could not classify arrived as a placeholder 'hotel', which IS a booking
  // type, so the tie-breaker never ran and the tab lost every time (#2076).
  it('FE-TP-HOOK-112b: a guessed hotel opens the transport form when the import began there', async () => {
    seedTrip();
    const { result } = await renderPlanner();
    const guessed = { type: 'hotel', title: 'Airport transfer', type_guessed: true };

    act(() => {
      result.current.startImportReview([guessed] as never, [], 'transports');
    });

    expect(result.current.showTransportModal).toBe(true);
    expect(result.current.showReservationModal).toBe(false);
  });

  it('FE-TP-HOOK-112c: a real hotel from the same tab still opens the booking form', async () => {
    seedTrip();
    const { result } = await renderPlanner();
    const real = { type: 'hotel', title: 'Ryokan' };

    act(() => {
      result.current.startImportReview([real] as never, [], 'transports');
    });

    expect(result.current.showReservationModal).toBe(true);
    expect(result.current.showTransportModal).toBe(false);
  });

  // A recognised type always wins over the tab: one PDF routinely holds both.
  it('FE-TP-HOOK-114: a hotel imported from the transports tab still opens the booking form', async () => {
    seedTrip();
    const { result } = await renderPlanner();

    act(() => {
      result.current.setBookingImportKind('transports');
    });
    act(() => {
      result.current.startImportReview([hotelItem] as never);
    });

    expect(result.current.showReservationModal).toBe(true);
    expect(result.current.showTransportModal).toBe(false);
  });

  it('FE-TP-HOOK-090: advancing moves on to the transport item and then finishes the session', async () => {
    seedTrip();
    const { result } = await renderPlanner();
    // Stubbed after the mount's own read, so only the refresh can bring the stay in.
    vi.mocked(accommodationRepo.list).mockResolvedValue({ accommodations: [{ id: 2 }] as never });
    act(() => {
      result.current.startImportReview([hotelItem, flightItem] as never);
    });

    act(() => {
      result.current.advanceImportReview();
    });
    expect(result.current.showTransportModal).toBe(true);
    expect(result.current.transportPrefill?.title).toBe('NRT → CDG');
    expect(result.current.showReservationModal).toBe(false);

    act(() => {
      result.current.advanceImportReview();
    });
    expect(result.current.importReviewActive).toBe(false);
    expect(result.current.showTransportModal).toBe(false);
    expect(fixtureState.actions.loadBudgetItems).toHaveBeenCalledWith(42);
    await waitFor(() => expect(result.current.tripAccommodations).toHaveLength(1));
  });

  it('FE-TP-HOOK-091: an empty import list never opens the review', async () => {
    seedTrip();

    const { result } = await renderPlanner();
    act(() => {
      result.current.startImportReview([]);
    });

    expect(result.current.importReviewActive).toBe(false);
    expect(result.current.showReservationModal).toBe(false);
  });

  it('FE-TP-HOOK-092: a finished background import hands its items to the review and clears the widget', async () => {
    seedTrip();
    useBackgroundTasksStore.setState({
      tasks: [
        {
          id: 'job-1',
          tripId: '42',
          label: 'mail.pdf',
          status: 'done',
          done: 1,
          total: 1,
          reviewRequested: true,
          items: [flightItem],
          sourceFiles: [new File(['x'], 'mail.pdf')],
        },
      ] as never,
    });

    const { result } = await renderPlanner();

    await waitFor(() => expect(result.current.showTransportModal).toBe(true));
    expect(result.current.transportPrefill?.title).toBe('NRT → CDG');
    expect(useBackgroundTasksStore.getState().tasks).toHaveLength(0);
  });

  it('FE-TP-HOOK-093: a background import without in-memory files falls back to the IndexedDB copy', async () => {
    seedTrip();
    useBackgroundTasksStore.setState({
      tasks: [
        {
          id: 'job-2',
          tripId: '42',
          label: 'mail.pdf',
          status: 'done',
          done: 1,
          total: 1,
          reviewRequested: true,
          items: [hotelItem],
        },
      ] as never,
    });

    const { result } = await renderPlanner();

    await waitFor(() => expect(result.current.showReservationModal).toBe(true));
    expect(result.current.reservationPrefill?._sourceFiles).toBeUndefined();
  });

  it('FE-TP-HOOK-094: a background task for another trip is left alone', async () => {
    seedTrip();
    useBackgroundTasksStore.setState({
      tasks: [
        {
          id: 'job-3',
          tripId: '99',
          label: 'mail.pdf',
          status: 'done',
          done: 1,
          total: 1,
          reviewRequested: true,
          items: [flightItem],
        },
      ] as never,
    });

    const { result } = await renderPlanner();

    await waitFor(() => expect(result.current.tripId).toBe(42));
    expect(result.current.showTransportModal).toBe(false);
    expect(useBackgroundTasksStore.getState().tasks).toHaveLength(1);
  });
});

describe('useTripPlanner — a receipt scanned from Costs', () => {
  const RECEIPT = {
    merchant: 'Café',
    date: '2026-09-20',
    total: 12.5,
    currency: 'EUR',
    items: [{ name: 'Tart', price: 12.5 }],
  };

  it('FE-TP-HOOK-160: a read receipt opens the expense editor pre-filled, with the photo to attach, and clears the widget', async () => {
    seedTrip();
    const photo = new File(['x'], 'bill.jpg', { type: 'image/jpeg' });
    useBackgroundTasksStore.setState({
      tasks: [
        {
          id: 'job-r',
          tripId: '42',
          label: 'bill.jpg',
          status: 'done',
          done: 1,
          total: 1,
          kind: 'costs',
          reviewRequested: true,
          items: [],
          receipt: RECEIPT,
          sourceFiles: [photo],
        },
      ] as never,
    });

    const { result } = await renderPlanner();

    await waitFor(() => expect(result.current.receiptExpense).not.toBeNull());
    expect(result.current.receiptExpense).toEqual({
      name: 'Café',
      amount: 12.5,
      currency: 'EUR',
      date: '2026-09-20',
      lines: [{ name: 'Tart', price: 12.5 }],
      receiptFiles: [photo],
    });
    expect(result.current.showReservationModal).toBe(false);
    expect(useBackgroundTasksStore.getState().tasks).toHaveLength(0);

    act(() => {
      result.current.clearReceiptExpense();
    });
    expect(result.current.receiptExpense).toBeNull();
  });

  it('FE-TP-HOOK-162: after a reload the photo comes back from IndexedDB for the review', async () => {
    seedTrip();
    const photo = new File(['x'], 'bill.jpg', { type: 'image/jpeg' });
    await saveImportFiles('job-db', [photo]);
    useBackgroundTasksStore.setState({
      tasks: [
        {
          id: 'job-db',
          tripId: '42',
          label: 'bill.jpg',
          status: 'done',
          done: 1,
          total: 1,
          kind: 'costs',
          reviewRequested: true,
          items: [],
          receipt: RECEIPT,
        },
      ] as never,
    });

    const { result } = await renderPlanner();

    await waitFor(() => expect(result.current.receiptExpense).not.toBeNull());
    expect(result.current.receiptExpense?.receiptFiles?.map((f) => f.name)).toEqual(['bill.jpg']);
    // P04ah: handing a source to review retains it until explicit abandonment.
    expect((await getImportFiles('job-db')).map((file) => file.name)).toEqual(['bill.jpg']);
  });

  it('FE-TP-HOOK-161: a scan that read nothing just clears the widget', async () => {
    seedTrip();
    useBackgroundTasksStore.setState({
      tasks: [
        {
          id: 'job-n',
          tripId: '42',
          label: 'bill.jpg',
          status: 'done',
          done: 1,
          total: 1,
          kind: 'costs',
          reviewRequested: true,
          items: [],
          receipt: null,
        },
      ] as never,
    });

    const { result } = await renderPlanner();

    await waitFor(() => expect(useBackgroundTasksStore.getState().tasks).toHaveLength(0));
    expect(result.current.receiptExpense).toBeNull();
  });

  it('FE-TP-HOOK-163: a member who may add expenses but not upload files gets the reading without the photo', async () => {
    // The photo goes up through the file upload on save, and a refused upload
    // used to take the whole expense down with it.
    seedStore(useAuthStore, { user: buildUser({ id: 2, role: 'user' }) });
    usePermissionsStore.setState({ permissions: { file_upload: 'trip_owner' } });
    seedTrip();
    const photo = new File(['x'], 'bill.jpg', { type: 'image/jpeg' });
    useBackgroundTasksStore.setState({
      tasks: [
        {
          id: 'job-u',
          tripId: '42',
          label: 'bill.jpg',
          status: 'done',
          done: 1,
          total: 1,
          kind: 'costs',
          reviewRequested: true,
          items: [],
          receipt: RECEIPT,
          sourceFiles: [photo],
        },
      ] as never,
    });

    const { result } = await renderPlanner();

    await waitFor(() => expect(result.current.receiptExpense).not.toBeNull());
    expect(result.current.receiptExpense).toMatchObject({ name: 'Café', amount: 12.5, receiptFiles: [] });
  });
});
