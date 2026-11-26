// organize-imports-ignore
// sort-imports-ignore
// Install original hoisted mocks before consumers and preserve dependency evaluation order.
import {
  fixtureState,
  updateRouteForDay,
  env,
  toasts,
  renderPlanner,
  setSettings,
  seedTrip,
} from '../../../tests/helpers/tripPlannerHook/state';
import 'react';
import { act, waitFor } from '@testing-library/react';
import '../../i18n/TranslationContext';
import '../../i18n';
import './useTripPlanner';
import { useTripStore, type TripStoreState } from '../../store/tripStore';
import { useAuthStore } from '../../store/authStore';
import '../../store/settingsStore';
import { usePermissionsStore } from '../../store/permissionsStore';
import '../../store/pluginStore';
import '../../store/backgroundTasksStore';
import { useAddonStore } from '../../store/addonStore';
import { seedStore } from '../../../tests/helpers/store';
import {
  buildUser,
  buildTrip,
  buildDay,
  buildPlace,
  buildAssignment,
  buildReservation,
  buildBudgetItem,
} from '../../../tests/helpers/factories';
import { addonsApi, tripsApi, toursApi } from '../../api/client';
import { accommodationRepo } from '../../repo/accommodationRepo';
import '../../db/offlineDb';
import '../../services/photoService';
import type { TourListItem } from '@trek/shared';
import type { Accommodation, Reservation } from '../../types';
import { PHONE_QUERY } from '../../mobile/useIsPhone';
import '../../../tests/helpers/plannerActions';

describe('useTripPlanner — day plan CRUD', () => {
  it('does not write a Tour assignment twice to one day, but allows another day and preserves Place writes', async () => {
    const tour: TourListItem = {
      place_id: 1,
      name: 'Ridge walk',
      tour_type: 'hike',
      distance: 4,
      elevation_gain: 100,
      elevation_loss: 80,
      duration: null,
      difficulty: null,
      wanderer_ref: null,
      match_confidence: 1,
      max_hiking_difficulty: 2,
      planned: false,
      caution: false,
    };
    const tourPlace = buildPlace({ id: 1, name: 'Ridge walk', tour_place_id: 1 });
    const ordinaryPlace = buildPlace({ id: 2, name: 'Ordinary place' });
    useAddonStore.setState({ addons: [{ id: 'tours', enabled: true } as never], loaded: true });
    vi.mocked(addonsApi.enabled).mockResolvedValue({ addons: [{ id: 'tours' }] });
    vi.spyOn(toursApi, 'list').mockResolvedValue({ tours: [tour] });
    seedTrip({
      places: [tourPlace, ordinaryPlace],
      assignments: { '7': [buildAssignment({ id: 70, day_id: 7, place: tourPlace })] },
    });

    const { result } = await renderPlanner();
    await waitFor(() => expect(result.current.tours).toEqual([tour]));
    fixtureState.actions.assignPlaceToDay.mockClear();

    let repeated!: boolean;
    await act(async () => {
      repeated = await result.current.handleAssignToDay(tourPlace.id, 7);
    });
    expect(repeated).toBe(false);
    expect(fixtureState.actions.assignPlaceToDay).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleAssignToDay(tourPlace.id, 8);
    });
    await act(async () => {
      await result.current.handleAssignToDay(ordinaryPlace.id, 7);
    });
    expect(fixtureState.actions.assignPlaceToDay).toHaveBeenNthCalledWith(1, 42, 8, tourPlace.id, undefined);
    expect(fixtureState.actions.assignPlaceToDay).toHaveBeenNthCalledWith(2, 42, 7, ordinaryPlace.id, undefined);
  });

  it('refreshes Tours only after a successful Tour assignment write', async () => {
    const unplanned: TourListItem = {
      place_id: 1,
      name: 'Ridge walk',
      tour_type: 'hike',
      distance: 4,
      elevation_gain: 100,
      elevation_loss: 80,
      duration: null,
      difficulty: null,
      wanderer_ref: null,
      match_confidence: 1,
      max_hiking_difficulty: 2,
      planned: false,
      caution: false,
    };
    const planned = { ...unplanned, planned: true };
    useAddonStore.setState({ addons: [{ id: 'tours', enabled: true } as never], loaded: true });
    const listTours = vi.spyOn(toursApi, 'list').mockResolvedValue({ tours: [unplanned] });
    const place = buildPlace({ id: 1, tour_place_id: 1 });
    seedTrip({ places: [place] });
    let resolveAssignment!: (value: { id: number }) => void;
    const assignment = new Promise<{ id: number }>((resolve) => {
      resolveAssignment = resolve;
    });
    fixtureState.actions.assignPlaceToDay.mockReturnValue(assignment);

    const { result } = await renderPlanner();
    await waitFor(() => expect(result.current.tours).toEqual([unplanned]));
    listTours.mockClear().mockResolvedValue({ tours: [planned] });
    let assignPromise!: Promise<boolean>;
    act(() => {
      assignPromise = result.current.handleAssignToDay(1, 7);
    });
    expect(listTours).not.toHaveBeenCalled();

    await act(async () => {
      resolveAssignment({ id: 555 });
      await assignPromise;
    });
    await waitFor(() => expect(result.current.tours).toEqual([planned]));
    expect(fixtureState.actions.assignPlaceToDay.mock.invocationCallOrder[0]).toBeLessThan(
      listTours.mock.invocationCallOrder[0]
    );

    listTours.mockClear().mockResolvedValue({ tours: [unplanned] });
    let resolveUndoRemoval!: () => void;
    const undoRemoval = new Promise<void>((resolve) => {
      resolveUndoRemoval = resolve;
    });
    fixtureState.actions.removeAssignment.mockReturnValueOnce(undoRemoval);
    let undoPromise!: Promise<unknown>;
    act(() => {
      undoPromise = result.current.undo();
    });
    expect(listTours).not.toHaveBeenCalled();
    await act(async () => {
      resolveUndoRemoval();
      await undoPromise;
    });
    await waitFor(() => expect(result.current.tours).toEqual([unplanned]));
    expect(fixtureState.actions.removeAssignment.mock.invocationCallOrder[0]).toBeLessThan(
      listTours.mock.invocationCallOrder[0]
    );
  });

  it('does not refresh or report a successful planned state when Tour assignment fails', async () => {
    const unplanned: TourListItem = {
      place_id: 1,
      name: 'Ridge walk',
      tour_type: 'hike',
      distance: 4,
      elevation_gain: 100,
      elevation_loss: 80,
      duration: null,
      difficulty: null,
      wanderer_ref: null,
      match_confidence: 1,
      max_hiking_difficulty: 2,
      planned: false,
      caution: false,
    };
    useAddonStore.setState({ addons: [{ id: 'tours', enabled: true } as never], loaded: true });
    const listTours = vi.spyOn(toursApi, 'list').mockResolvedValue({ tours: [unplanned] });
    const place = buildPlace({ id: 1, tour_place_id: 1 });
    seedTrip({ places: [place] });
    const { result } = await renderPlanner();
    await waitFor(() => expect(result.current.tours).toEqual([unplanned]));
    listTours.mockClear();
    fixtureState.actions.assignPlaceToDay.mockRejectedValueOnce(new Error('assignment failed'));

    await act(async () => {
      await result.current.handleAssignToDay(1, 7);
    });

    expect(listTours).not.toHaveBeenCalled();
    expect(result.current.tours).toEqual([unplanned]);
    expect(toasts.some((toast) => toast.message === 'assignment failed' && toast.type === 'error')).toBe(true);
  });

  it('refreshes after Tour removal and each successful assignment Undo direction', async () => {
    const unplanned: TourListItem = {
      place_id: 1,
      name: 'Ridge walk',
      tour_type: 'hike',
      distance: 4,
      elevation_gain: 100,
      elevation_loss: 80,
      duration: null,
      difficulty: null,
      wanderer_ref: null,
      match_confidence: 1,
      max_hiking_difficulty: 2,
      planned: false,
      caution: false,
    };
    const planned: TourListItem = { ...unplanned, planned: true };
    useAddonStore.setState({ addons: [{ id: 'tours', enabled: true } as never], loaded: true });
    const listTours = vi.spyOn(toursApi, 'list').mockResolvedValue({ tours: [planned] });
    const place = buildPlace({ id: 1, tour_place_id: 1 });
    seedTrip({
      places: [place],
      assignments: { '7': [buildAssignment({ id: 10, day_id: 7, place, order_index: 1 })] },
    });
    const { result } = await renderPlanner();
    await waitFor(() => expect(result.current.tours).toEqual([planned]));
    listTours.mockClear().mockResolvedValue({ tours: [unplanned] });
    let resolveRemoval!: () => void;
    const removal = new Promise<void>((resolve) => {
      resolveRemoval = resolve;
    });
    fixtureState.actions.removeAssignment.mockReturnValueOnce(removal);
    let removePromise!: Promise<void>;
    act(() => {
      removePromise = result.current.handleRemoveAssignment(7, 10);
    });
    expect(listTours).not.toHaveBeenCalled();
    await act(async () => {
      resolveRemoval();
      await removePromise;
    });
    await waitFor(() => expect(result.current.tours).toEqual([unplanned]));
    expect(fixtureState.actions.removeAssignment.mock.invocationCallOrder[0]).toBeLessThan(
      listTours.mock.invocationCallOrder[0]
    );

    listTours.mockClear().mockResolvedValue({ tours: [planned] });
    fixtureState.actions.assignPlaceToDay.mockResolvedValueOnce({ id: 777 });
    await act(async () => {
      await result.current.undo();
    });
    await waitFor(() => expect(result.current.tours).toEqual([planned]));
    expect(fixtureState.actions.assignPlaceToDay).toHaveBeenCalledWith(42, 7, 1, 1);
    expect(fixtureState.actions.assignPlaceToDay.mock.invocationCallOrder[0]).toBeLessThan(
      listTours.mock.invocationCallOrder[0]
    );
  });

  it('FE-TP-HOOK-063: assigning to the selected day registers an undo that removes it again', async () => {
    seedTrip({ selectedDayId: 7 });

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleAssignToDay(1);
    });

    expect(fixtureState.actions.assignPlaceToDay).toHaveBeenCalledWith(42, 7, 1, undefined);
    expect(updateRouteForDay).toHaveBeenCalledWith(7);

    await act(async () => {
      await result.current.undo();
    });
    expect(fixtureState.actions.removeAssignment).toHaveBeenCalledWith(42, 7, 555);
  });

  it('FE-TP-HOOK-064: assigning without any day asks the user to pick one', async () => {
    seedTrip();

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleAssignToDay(1);
    });

    expect(fixtureState.actions.assignPlaceToDay).not.toHaveBeenCalled();
    expect(toasts.some((t) => t.type === 'error')).toBe(true);
  });

  it('FE-TP-HOOK-065: a failing assignment surfaces the server message', async () => {
    seedTrip();
    fixtureState.actions.assignPlaceToDay.mockRejectedValue(new Error('day is full'));

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleAssignToDay(1, 7, 2);
    });

    expect(toasts.some((t) => t.message === 'day is full')).toBe(true);
  });

  it('FE-TP-HOOK-121: a place with a start of its own is stored where the day list draws it', async () => {
    // The list sorts the day by start and the road trip drives the stored order, so
    // 10:00 goes between 09:00 and 11:00 whether it was dropped at the end or on top.
    const place = buildPlace({ id: 1, place_time: '10:00' });
    const early = buildPlace({ id: 2, place_time: '09:00' });
    const late = buildPlace({ id: 3, place_time: '11:00' });
    seedTrip({
      places: [place, early, late],
      assignments: {
        '7': [
          buildAssignment({ id: 20, day_id: 7, place: early, order_index: 0 }),
          buildAssignment({ id: 21, day_id: 7, place: late, order_index: 1 }),
        ],
      },
    });

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleAssignToDay(1, 7);
    });
    await act(async () => {
      await result.current.handleAssignToDay(1, 7, 0);
    });

    expect(fixtureState.actions.assignPlaceToDay).toHaveBeenNthCalledWith(1, 42, 7, 1, 1);
    expect(fixtureState.actions.assignPlaceToDay).toHaveBeenNthCalledWith(2, 42, 7, 1, 1);
  });

  it('FE-TP-HOOK-066: removing a Tour assignment can be undone without deleting the Tour', async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2, tour_place_id: 1, route_geometry: '[[1,2],[3,4]]' });
    seedTrip({
      places: [place],
      assignments: {
        '7': [buildAssignment({ id: 10, day_id: 7, place, order_index: 4 })],
        '8': [buildAssignment({ id: 11, day_id: 8, place, order_index: 2 })],
      },
    });

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleRemoveAssignment(7, 10);
    });

    expect(fixtureState.actions.removeAssignment).toHaveBeenCalledWith(42, 7, 10);
    expect(fixtureState.actions.deletePlace).not.toHaveBeenCalled();
    expect(fixtureState.actions.addPlace).not.toHaveBeenCalled();
    expect(useTripStore.getState().places).toContainEqual(
      expect.objectContaining({ id: place.id, route_geometry: place.route_geometry })
    );
    expect(useTripStore.getState().assignments['8']).toHaveLength(1);
    expect(useTripStore.getState().assignments['8'][0].id).toBe(11);

    await act(async () => {
      await result.current.undo();
    });
    expect(fixtureState.actions.assignPlaceToDay).toHaveBeenCalledWith(42, 7, 1, 4);
  });

  it('FE-TP-HOOK-067: a failing removal toasts and registers no undo', async () => {
    seedTrip({ assignments: {} });
    fixtureState.actions.removeAssignment.mockRejectedValue(new Error('gone'));

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleRemoveAssignment(7, 10);
    });

    expect(toasts.some((t) => t.message === 'gone')).toBe(true);
    expect(result.current.canUndo).toBe(false);
  });

  it('FE-TP-HOOK-068: reordering a day can be undone to the previous order', async () => {
    const a = buildPlace({ id: 1, lat: 1, lng: 2 });
    const b = buildPlace({ id: 2, lat: 3, lng: 4 });
    seedTrip({
      places: [a, b],
      assignments: {
        '7': [
          buildAssignment({ id: 11, day_id: 7, place: b, order_index: 1 }),
          buildAssignment({ id: 10, day_id: 7, place: a, order_index: 0 }),
        ],
      },
    });

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleReorder(7, [11, 10]);
    });

    expect(fixtureState.actions.reorderAssignments).toHaveBeenCalledWith(42, 7, [11, 10]);
    await waitFor(() => expect(result.current.canUndo).toBe(true));

    await act(async () => {
      await result.current.undo();
    });
    expect(fixtureState.actions.reorderAssignments).toHaveBeenLastCalledWith(42, 7, [10, 11]);
  });

  it('FE-TP-HOOK-069: a rejected reorder toasts the server message', async () => {
    seedTrip();
    fixtureState.actions.reorderAssignments.mockRejectedValue(new Error('conflict'));

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleReorder(7, [1, 2]);
    });

    await waitFor(() => expect(toasts.some((t) => t.message === 'conflict')).toBe(true));
  });

  it('FE-TP-HOOK-069b: a reorder that throws synchronously falls back to the generic message', async () => {
    seedTrip();
    fixtureState.actions.reorderAssignments.mockImplementation(() => {
      throw new Error('boom');
    });

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleReorder(7, [1, 2]);
    });

    expect(toasts.some((t) => t.type === 'error' && t.message !== 'boom')).toBe(true);
  });

  it('FE-TP-HOOK-070: reordering days can be undone to the previous day order', async () => {
    seedTrip({
      days: [buildDay({ id: 2, day_number: 2 }), buildDay({ id: 1, day_number: 1 })],
    });

    const { result } = await renderPlanner();
    await act(async () => {
      result.current.handleReorderDays([2, 1]);
    });

    expect(fixtureState.actions.reorderDays).toHaveBeenCalledWith(42, [2, 1]);
    await waitFor(() => expect(result.current.canUndo).toBe(true));

    await act(async () => {
      await result.current.undo();
    });
    expect(fixtureState.actions.reorderDays).toHaveBeenLastCalledWith(42, [1, 2]);
  });

  it('FE-TP-HOOK-071: a rejected day reorder toasts', async () => {
    seedTrip();
    fixtureState.actions.reorderDays.mockRejectedValue(new Error('locked'));

    const { result } = await renderPlanner();
    await act(async () => {
      result.current.handleReorderDays([1]);
    });

    await waitFor(() => expect(toasts.some((t) => t.message === 'locked')).toBe(true));
  });

  it('FE-TP-HOOK-072: inserting a day forwards the position and toasts on failure', async () => {
    seedTrip();
    fixtureState.actions.insertDay.mockRejectedValueOnce(new Error('no room'));

    const { result } = await renderPlanner();
    await act(async () => {
      result.current.handleAddDay(2);
    });

    expect(fixtureState.actions.insertDay).toHaveBeenCalledWith(42, 2);
    await waitFor(() => expect(toasts.some((t) => t.message === 'no room')).toBe(true));
  });

  it('FE-TP-HOOK-073: a failing day-title rename toasts', async () => {
    seedTrip();
    fixtureState.actions.updateDayTitle.mockRejectedValue(new Error('too long'));

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleUpdateDayTitle(7, 'x');
    });

    expect(toasts.some((t) => t.message === 'too long')).toBe(true);
  });

  it('FE-TP-HOOK-074: undo announces the label of the action it reversed', async () => {
    seedTrip({ selectedDayId: 7 });

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleAssignToDay(1);
    });
    expect(result.current.lastActionLabel).toBeTruthy();

    await act(async () => {
      await result.current.handleUndo();
    });
    expect(toasts.some((t) => t.type === 'info')).toBe(true);
  });
});

describe('useTripPlanner — misc state', () => {
  it('FE-TP-HOOK-095: the map tile url falls back to the default basemap', async () => {
    seedTrip();

    const { result } = await renderPlanner();
    expect(result.current.mapTileUrl).toContain('openfreemap.org');

    act(() => {
      setSettings({ map_tile_url: 'https://tiles/{z}/{x}/{y}.png' });
    });
    expect(result.current.mapTileUrl).toBe('https://tiles/{z}/{x}/{y}.png');
  });

  it('FE-TP-HOOK-096: the transport type set matches the booking tab split', async () => {
    seedTrip();

    const { result } = await renderPlanner();

    expect(result.current.TRANSPORT_TYPES.has('flight')).toBe(true);
    expect(result.current.TRANSPORT_TYPES.has('hotel')).toBe(false);
  });

  it('FE-TP-HOOK-097: the media query listener drives the mobile flag', async () => {
    const listeners: Record<string, Array<(e: MediaQueryListEvent) => void>> = {};
    const removeEventListener = vi.fn();
    // Swapped by hand and put back below: window.matchMedia is the setup's own
    // mock, and a spy on it outlives restoreAllMocks, which left every later
    // test of this file answering "not a phone" whatever the viewport.
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn(
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: (_: string, handler: (e: MediaQueryListEvent) => void) => {
            (listeners[query] ??= []).push(handler);
          },
          removeEventListener,
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList
    ) as unknown as typeof window.matchMedia;
    try {
      seedTrip();

      const { result, unmount } = await renderPlanner();
      expect(result.current.isMobile).toBe(false);

      act(() => {
        listeners[PHONE_QUERY][0]({ matches: true } as MediaQueryListEvent);
      });
      expect(result.current.isMobile).toBe(true);

      unmount();
      expect(removeEventListener).toHaveBeenCalled();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('FE-TP-HOOK-098: selectedPlace resolves the current selection out of the store', async () => {
    const place = buildPlace({ id: 1, name: 'Kiyomizu', lat: 1, lng: 2 });
    seedTrip({ places: [place] });

    const { result } = await renderPlanner();
    expect(result.current.selectedPlace).toBeNull();

    act(() => {
      result.current.handlePlaceClick(1);
    });
    expect(result.current.selectedPlace?.name).toBe('Kiyomizu');
  });

  it('FE-TP-HOOK-099: the map transport detail is a plain open/close slot', async () => {
    const reservation = buildReservation({ id: 3 }) as Reservation;
    seedTrip();

    const { result } = await renderPlanner();
    act(() => {
      result.current.setMapTransportDetail(reservation);
    });
    expect(result.current.mapTransportDetail?.id).toBe(3);

    act(() => {
      result.current.setMapTransportDetail(null);
    });
    expect(result.current.mapTransportDetail).toBeNull();
  });

  it('FE-TP-HOOK-100: a member without upload rights gets no upload handler', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 2, role: 'user' }) });
    usePermissionsStore.setState({ permissions: { file_upload: 'trip_owner' } });
    seedTrip();

    const { result } = await renderPlanner();

    expect(result.current.canUploadFiles).toBe(false);
    expect(result.current.can('place_edit', result.current.trip)).toBe(true);
  });

  it('FE-TP-HOOK-101: without place_edit rights neither add-place entry point opens the form', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 2, role: 'user' }) });
    usePermissionsStore.setState({ permissions: { place_edit: 'admin' } });
    seedTrip();

    const { result } = await renderPlanner();

    await act(async () => {
      await result.current.handleMapContextMenu({ latlng: { lat: 1, lng: 2 } });
    });
    act(() => {
      result.current.openAddPlaceFromPoi({
        lat: 1,
        lng: 2,
        name: 'x',
        address: null,
        website: null,
        phone: null,
        osm_id: 'n/1',
      });
    });

    expect(result.current.showPlaceForm).toBe(false);
    expect(result.current.prefillCoords).toBeNull();
  });

  it('FE-TP-HOOK-120: without place_edit rights the place editor and the delete dialog stay shut (#2446)', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 2, role: 'user' }) });
    usePermissionsStore.setState({ permissions: { place_edit: 'admin' } });
    const place = buildPlace({ id: 1, lat: 1, lng: 2 });
    seedTrip({ places: [place], assignments: { '7': [buildAssignment({ id: 10, day_id: 7, place })] } });

    const { result } = await renderPlanner();
    act(() => {
      result.current.openPlaceEditor(place, 10);
    });
    act(() => {
      result.current.handleDeletePlace(1);
    });

    expect(result.current.showPlaceForm).toBe(false);
    expect(result.current.editingPlace).toBeNull();
    expect(result.current.deletePlaceId).toBeNull();
  });

  it('routes mobile Place-editor entry for a dormant Tour to read-only Tour detail', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 });
    try {
      const tourPlace = buildPlace({ id: 1, name: 'Ridge walk', tour_place_id: 1 });
      seedTrip({ places: [tourPlace] });
      const { result } = await renderPlanner();

      act(() => result.current.openPlaceEditor(tourPlace));

      expect(result.current.isMobile).toBe(true);
      expect(result.current.selectedPlaceId).toBe(1);
      expect(result.current.showPlaceForm).toBe(false);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalWidth });
    }
  });

  it('FE-TP-HOOK-102: a member roster refresh replaces the cached list', async () => {
    seedTrip();
    const { result } = await renderPlanner();
    await waitFor(() => expect(tripsApi.getMembers).toHaveBeenCalled());

    vi.mocked(tripsApi.getMembers).mockResolvedValue({
      owner: { id: 1, username: 'owner' },
      members: [
        { id: 2, username: 'bob' },
        { id: 3, username: 'alice' },
      ],
    });
    await act(async () => {
      await result.current.refreshMembers();
    });

    await waitFor(() => expect(result.current.tripMembers).toHaveLength(3));
  });

  it('FE-TP-HOOK-103: a rejected roster fetch leaves the list untouched', async () => {
    vi.mocked(tripsApi.getMembers).mockRejectedValue(new Error('403'));
    seedTrip();

    const { result } = await renderPlanner();

    await waitFor(() => expect(tripsApi.getMembers).toHaveBeenCalled());
    expect(result.current.tripMembers).toEqual([]);
  });
});

describe('useTripPlanner — road trip stops', () => {
  /** A day whose stops the rail would show, plus one the rail hides for want of coordinates. */
  const seedDrive = () => {
    const places = [
      buildPlace({ id: 10, name: 'Hamburg', lat: 53.55, lng: 9.99 }),
      buildPlace({ id: 20, name: 'Lueneburg', lat: 53.25, lng: 10.41 }),
      buildPlace({ id: 30, name: 'Berlin', lat: 52.52, lng: 13.4 }),
      // No coordinates, so it never appears in the rail — and must survive a reorder.
      buildPlace({ id: 40, name: 'Idee ohne Ort', lat: null, lng: null }),
    ];
    return seedTrip({
      days: [buildDay({ id: 7, day_number: 1 })],
      places,
      assignments: {
        '7': [
          buildAssignment({ id: 1, day_id: 7, place_id: 10, order_index: 0, place: places[0] }),
          buildAssignment({ id: 2, day_id: 7, place_id: 20, order_index: 1, place: places[1] }),
          buildAssignment({ id: 3, day_id: 7, place_id: 30, order_index: 2, place: places[2] }),
          buildAssignment({ id: 4, day_id: 7, place_id: 40, order_index: 3, place: places[3] }),
        ],
      },
    } as unknown as Partial<TripStoreState>);
  };

  it('FE-TP-HOOK-111: reordering the rail sends the day’s WHOLE order, hidden stops included', async () => {
    seedDrive();
    const { result } = await renderPlanner();

    // The rail lists three stops; the fourth has no coordinates and is not on show.
    await act(async () => {
      await result.current.reorderRoadtripStop(7, 3, 0);
    });

    // Both the slice and the WebSocket handler rebuild the day purely from these ids, so
    // leaving the invisible one out would delete it from every session's store.
    expect(fixtureState.actions.reorderAssignments).toHaveBeenCalledWith(42, 7, [3, 1, 2, 4]);
  });

  it('FE-TP-HOOK-112: moving a stop onto itself asks the server for nothing', async () => {
    seedDrive();
    const { result } = await renderPlanner();

    await act(async () => {
      await result.current.reorderRoadtripStop(7, 2, 1);
    });

    expect(fixtureState.actions.reorderAssignments).not.toHaveBeenCalled();
  });

  it('FE-TP-HOOK-113: an index past the end of the chain lands on the last stop', async () => {
    seedDrive();
    const { result } = await renderPlanner();

    await act(async () => {
      await result.current.reorderRoadtripStop(7, 1, 99);
    });

    // Clamped to the last VISIBLE stop, which is Berlin — not past the hidden fourth row.
    expect(fixtureState.actions.reorderAssignments).toHaveBeenCalledWith(42, 7, [2, 3, 1, 4]);
  });

  it('FE-TP-HOOK-114: a failed reorder says so rather than leaving a phantom order', async () => {
    seedDrive();
    fixtureState.actions.reorderAssignments.mockRejectedValueOnce(new Error('nope'));
    const { result } = await renderPlanner();

    await act(async () => {
      await result.current.reorderRoadtripStop(7, 3, 0);
    });

    expect(toasts.some((t) => t.type === 'error')).toBe(true);
  });

  it('FE-TP-HOOK-115: an unknown assignment is not reordered into existence', async () => {
    seedDrive();
    const { result } = await renderPlanner();

    await act(async () => {
      await result.current.reorderRoadtripStop(7, 999, 0);
    });

    expect(fixtureState.actions.reorderAssignments).not.toHaveBeenCalled();
  });
});

describe('useTripPlanner — dropping a hit on the drive', () => {
  it('FE-TP-HOOK-116: a drop far from the route is ignored rather than guessed at', async () => {
    seedTrip();
    const { result } = await renderPlanner();

    // No corridor results and no day: nothing to match, so nothing may open.
    act(() => {
      result.current.dropPoiOnRoute('node:9', 0, 0);
    });

    expect(result.current.stopDraft).toBeNull();
  });

  it('FE-TP-HOOK-117: a drop for an unknown hit opens nothing', async () => {
    seedTrip();
    const { result } = await renderPlanner();

    act(() => {
      result.current.dropPoiOnRoute('node:does-not-exist', 53.5, 9.9);
    });

    expect(result.current.stopDraft).toBeNull();
  });
});

describe('useTripPlanner: deleting a day', () => {
  // Dated 1 to 3 June on a trip running 1 to 3 June, with a place on the middle day.
  function seedDays(extra: Partial<TripStoreState> = {}) {
    const place = buildPlace({ id: 70 });
    return seedTrip({
      trip: buildTrip({ id: 42, title: 'Kyoto', start_date: '2026-06-01', end_date: '2026-06-03' }),
      days: [
        buildDay({ id: 1, day_number: 1, date: '2026-06-01', title: null }),
        buildDay({ id: 2, day_number: 2, date: '2026-06-02', title: 'Harbour day' }),
        buildDay({ id: 3, day_number: 3, date: '2026-06-03', title: null }),
      ],
      assignments: { '1': [], '2': [buildAssignment({ id: 20, day_id: 2, place })], '3': [] },
      dayNotes: { '1': [], '2': [], '3': [] },
      ...extra,
    } as Partial<TripStoreState>);
  }

  it('FE-TP-HOOK-122: asking needs day_edit; with it the question names the day and lists what goes with it', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 2, role: 'user' }) });
    usePermissionsStore.setState({ permissions: { day_edit: 'admin' } });
    seedDays();
    const denied = await renderPlanner();
    act(() => {
      denied.result.current.handleDeleteDay(2);
    });
    expect(denied.result.current.deleteDayId).toBeNull();
    denied.unmount();

    seedStore(useAuthStore, { user: buildUser({ id: 1 }) });
    usePermissionsStore.setState({ permissions: {} });
    const { result } = await renderPlanner();
    act(() => {
      result.current.handleDeleteDay(2);
    });

    expect(result.current.deleteDayId).toBe(2);
    expect(result.current.deleteDayTitle).toBe('Delete Harbour day?');
    expect(result.current.deleteDayLines.map((l) => l.key)).toEqual(['places', 'texts', 'shift', 'shrink']);
    expect(result.current.deleteDayLines.find((l) => l.key === 'places')?.text).toBe('Planned places: 1');
  });

  it('FE-TP-HOOK-135: the open question comes as one object for the reorder dialog, whose answers close it', async () => {
    seedDays();
    const { result } = await renderPlanner();
    expect(result.current.deleteDayQuestion).toBeNull();

    act(() => {
      result.current.handleDeleteDay(2);
    });
    const asked = result.current.deleteDayQuestion;
    expect(asked?.dayId).toBe(2);
    expect(asked?.title).toBe('Delete Harbour day?');
    expect(asked?.lines).toBe(result.current.deleteDayLines);

    act(() => {
      asked?.onCancel();
    });
    expect(result.current.deleteDayQuestion).toBeNull();
    expect(fixtureState.actions.deleteDay).not.toHaveBeenCalled();

    act(() => {
      result.current.handleDeleteDay(2);
    });
    await act(async () => {
      result.current.deleteDayQuestion?.onConfirm();
    });
    await waitFor(() => expect(fixtureState.actions.deleteDay).toHaveBeenCalledWith(42, 2));
    expect(result.current.deleteDayQuestion).toBeNull();
  });

  it('FE-TP-HOOK-123: confirming deletes through the store, closes the question and reloads the stays', async () => {
    seedDays();
    const { result } = await renderPlanner();
    act(() => {
      result.current.handleDeleteDay(2);
    });
    vi.mocked(accommodationRepo.list).mockClear();

    await act(async () => {
      await result.current.confirmDeleteDay();
    });

    expect(fixtureState.actions.deleteDay).toHaveBeenCalledWith(42, 2);
    expect(result.current.deleteDayId).toBeNull();
    expect(accommodationRepo.list).toHaveBeenCalledWith(42);
    expect(updateRouteForDay).toHaveBeenCalled();
    expect(toasts).toContainEqual(expect.objectContaining({ type: 'success', message: 'Day deleted' }));

    // A refusal is said in the traveller's language, and nothing is reloaded.
    fixtureState.actions.deleteDay.mockRejectedValueOnce(new Error('A trip needs at least one day.'));
    vi.mocked(accommodationRepo.list).mockClear();
    act(() => {
      result.current.handleDeleteDay(3);
    });
    await act(async () => {
      await result.current.confirmDeleteDay();
    });
    expect(toasts).toContainEqual(expect.objectContaining({ type: 'error', message: 'Failed to delete day' }));
    expect(accommodationRepo.list).not.toHaveBeenCalled();

    // Without an open question there is nothing to confirm.
    fixtureState.actions.deleteDay.mockClear();
    await act(async () => {
      await result.current.confirmDeleteDay();
    });
    expect(fixtureState.actions.deleteDay).not.toHaveBeenCalled();
  });

  it('FE-TP-HOOK-124: the last day and a missing connection block the question, and say why', async () => {
    seedDays({ days: [buildDay({ id: 1, day_number: 1, date: '2026-06-01' })] } as Partial<TripStoreState>);
    const single = await renderPlanner();
    expect(single.result.current.deleteDayBlocked).toBe('A trip needs at least one day');
    act(() => {
      single.result.current.handleDeleteDay(1);
    });
    expect(single.result.current.deleteDayId).toBeNull();
    single.unmount();

    env.forcedOffline = true;
    seedDays();
    const { result } = await renderPlanner();
    expect(result.current.deleteDayBlocked).toBe('Changing days needs a connection');
    act(() => {
      result.current.handleDeleteDay(2);
    });
    expect(result.current.deleteDayId).toBeNull();
  });

  it('FE-TP-HOOK-125: undoing a day reorder skips the days deleted since, and steps aside once a day was added', async () => {
    seedDays();
    const { result } = await renderPlanner();
    await act(async () => {
      result.current.handleReorderDays([3, 1, 2]);
    });
    await waitFor(() => expect(result.current.canUndo).toBe(true));

    // Day 2 went in the meantime: the old order without it is still one the server takes.
    useTripStore.setState({ days: [buildDay({ id: 3, day_number: 1 }), buildDay({ id: 1, day_number: 2 })] });
    await act(async () => {
      await result.current.undo();
    });
    expect(fixtureState.actions.reorderDays).toHaveBeenLastCalledWith(42, [1, 3]);

    // A day added since leaves the old order short of one, so the undo does nothing.
    await act(async () => {
      result.current.handleReorderDays([1, 3]);
    });
    await waitFor(() => expect(result.current.canUndo).toBe(true));
    useTripStore.setState({
      days: [
        buildDay({ id: 1, day_number: 1 }),
        buildDay({ id: 3, day_number: 2 }),
        buildDay({ id: 9, day_number: 3 }),
      ],
    });
    fixtureState.actions.reorderDays.mockClear();
    await act(async () => {
      await result.current.undo();
    });
    expect(fixtureState.actions.reorderDays).not.toHaveBeenCalled();
  });

  it('FE-TP-HOOK-130: the open panel of the deleted day closes, here and when a fellow traveller deletes it', async () => {
    seedDays();
    const { result } = await renderPlanner();
    const [first, second, third] = useTripStore.getState().days;

    act(() => {
      result.current.setShowDayDetail(second);
    });
    expect(result.current.showDayDetail?.id).toBe(2);
    act(() => {
      result.current.handleDeleteDay(2);
    });
    await act(async () => {
      await result.current.confirmDeleteDay();
    });
    expect(result.current.showDayDetail).toBeNull();

    // A panel on another day stays open through the delete.
    act(() => {
      result.current.setShowDayDetail(first);
    });
    act(() => {
      result.current.handleDeleteDay(3);
    });
    await act(async () => {
      await result.current.confirmDeleteDay();
    });
    expect(result.current.showDayDetail?.id).toBe(1);

    // Removed by someone else: the day leaves the store, and its panel goes with it.
    act(() => {
      result.current.setShowDayDetail(third);
    });
    act(() => {
      useTripStore.setState({ days: [first, second] });
    });
    expect(result.current.showDayDetail).toBeNull();
  });

  it('FE-TP-HOOK-130a: the day details come back when the place card closes, not after another panel opened', async () => {
    seedDays({ places: [buildPlace({ id: 70 })] } as Partial<TripStoreState>);
    const { result } = await renderPlanner();
    const [first, second] = useTripStore.getState().days;

    act(() => {
      result.current.setShowDayDetail(first);
    });
    act(() => {
      result.current.handlePlaceClick(70);
    });
    expect(result.current.showDayDetail).toBeNull();
    act(() => {
      result.current.handlePlaceClick(null);
    });
    expect(result.current.showDayDetail?.id).toBe(first.id);

    act(() => {
      result.current.handlePlaceClick(70);
    });
    act(() => {
      result.current.setShowDayDetail(second);
    });
    act(() => {
      result.current.handlePlaceClick(null);
    });
    expect(result.current.showDayDetail?.id).toBe(second.id);
  });

  it('FE-TP-HOOK-131: undo steps on the deleted day are dropped, the others stay', async () => {
    seedDays({ selectedDayId: 1, places: [buildPlace({ id: 70 })] } as Partial<TripStoreState>);
    const { result } = await renderPlanner();

    await act(async () => {
      await result.current.handleAssignToDay(70, 1);
    });
    await act(async () => {
      await result.current.handleAssignToDay(70, 2);
    });
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.handleDeleteDay(2);
    });
    await act(async () => {
      await result.current.confirmDeleteDay();
    });

    // The step on day 2 is gone; the one on day 1 is still the next to undo.
    fixtureState.actions.removeAssignment.mockClear();
    await act(async () => {
      await result.current.handleUndo();
    });
    expect(fixtureState.actions.removeAssignment).toHaveBeenCalledTimes(1);
    expect(fixtureState.actions.removeAssignment).toHaveBeenCalledWith(42, 1, 555);
    expect(result.current.canUndo).toBe(false);
  });

  it('FE-TP-HOOK-132: an undo that fails says so instead of claiming it was undone', async () => {
    seedDays({ selectedDayId: 1, places: [buildPlace({ id: 70 })] } as Partial<TripStoreState>);
    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.handleAssignToDay(70, 1);
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixtureState.actions.removeAssignment.mockRejectedValueOnce(new Error('Not found'));

    await act(async () => {
      await result.current.handleUndo();
    });

    expect(toasts).toContainEqual(
      expect.objectContaining({ type: 'error', message: 'Could not undo: Place assigned to day' })
    );
    expect(toasts.some((t) => t.type === 'info' && t.message.startsWith('Undone'))).toBe(false);
    spy.mockRestore();
  });

  it('FE-TP-HOOK-133: the question names the paid stay by its sum, the stay a night shorter and the day that takes the last date', async () => {
    vi.mocked(accommodationRepo.list).mockResolvedValue({
      accommodations: [
        { id: 9, trip_id: 42, start_day_id: 1, end_day_id: 3, place_name: 'Harbour Hotel' },
        { id: 10, trip_id: 42, start_day_id: 2, end_day_id: 3, place_name: 'Pension Alma' },
      ] as Accommodation[],
    });
    seedDays({
      days: [
        buildDay({ id: 1, day_number: 1, date: '2026-06-01', title: null }),
        buildDay({ id: 2, day_number: 2, date: '2026-06-02', title: null }),
        buildDay({ id: 3, day_number: 3, date: '2026-06-03', title: null }),
        buildDay({ id: 4, day_number: 4, date: null, title: null }),
      ],
      trip: buildTrip({ id: 42, start_date: '2026-06-01', end_date: '2026-06-03', currency: 'EUR' }),
      reservations: [
        buildReservation({ id: 80, day_id: 2, type: 'hotel', title: 'Alma, 1 night', accommodation_id: 10 }),
      ],
      budgetItems: [buildBudgetItem({ reservation_id: 80, total_price: 95, currency: null })],
    } as Partial<TripStoreState>);
    const { result } = await renderPlanner();
    await waitFor(() => expect(result.current.tripAccommodations).toHaveLength(2));

    act(() => {
      result.current.handleDeleteDay(2);
    });

    const lines = result.current.deleteDayLines;
    expect(lines.map((l) => l.key)).toEqual(['stay-10', 'stay-short-9', 'places', 'shift', 'spare']);
    expect(lines[0].hint).toContain('together with the booking “Alma, 1 night” and its expense of');
    expect(lines[0].hint).toContain('95');
    expect(lines[1].text).toBe('Stay at Harbour Hotel: one night less');
    expect(lines[1].hint).toMatch(/^Check-out is now on .*Jun 2, as it runs across this day\.$/);
    expect(lines[4].text).toMatch(/^Day 4 takes the date .*Jun 3/);
  });
});

describe('useTripPlanner: adding a day', () => {
  // A trip running 1 to 3 June with one day per date and a spare day without one.
  function seedDated(extra: Partial<TripStoreState> = {}) {
    return seedTrip({
      trip: buildTrip({ id: 42, title: 'Kyoto', start_date: '2026-06-01', end_date: '2026-06-03' }),
      days: [
        buildDay({ id: 1, day_number: 1, date: '2026-06-01' }),
        buildDay({ id: 2, day_number: 2, date: '2026-06-02' }),
        buildDay({ id: 3, day_number: 3, date: '2026-06-03' }),
        buildDay({ id: 4, day_number: 4, date: null }),
      ],
      ...extra,
    } as Partial<TripStoreState>);
  }

  it('FE-TP-HOOK-126: a trip with dates offers the day after its end date; one without dates offers none', async () => {
    seedDated();
    const dated = await renderPlanner();
    expect(dated.result.current.dayAdd).toMatchObject({
      nextDate: '2026-06-04',
      blocked: null,
      datedBlocked: null,
      busy: false,
    });
    dated.unmount();

    seedTrip({
      trip: buildTrip({ id: 42, start_date: null, end_date: null }),
      days: [buildDay({ id: 1, day_number: 1, date: null })],
    } as Partial<TripStoreState>);
    const { result } = await renderPlanner();
    expect(result.current.dayAdd.nextDate).toBeNull();
    act(() => {
      result.current.dayAdd.onAddDated();
    });
    expect(fixtureState.actions.appendDatedDay).not.toHaveBeenCalled();
  });

  it('FE-TP-HOOK-127: without day_edit neither kind of day is added', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 2, role: 'user' }) });
    usePermissionsStore.setState({ permissions: { day_edit: 'admin' } });
    seedDated();
    const { result } = await renderPlanner();

    act(() => {
      result.current.dayAdd.onAddDated();
    });
    act(() => {
      result.current.handleAddDay();
    });

    expect(fixtureState.actions.appendDatedDay).not.toHaveBeenCalled();
    expect(fixtureState.actions.insertDay).not.toHaveBeenCalled();
  });

  it('FE-TP-HOOK-128: one day at a time, and the toast names the new end date', async () => {
    seedDated();
    let finish: (day: { id: number; date: string }) => void = () => {};
    fixtureState.actions.appendDatedDay.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { result } = await renderPlanner();

    act(() => {
      result.current.dayAdd.onAddDated();
    });
    expect(result.current.dayAdd.busy).toBe(true);
    // A double click, and a click on the other button while the first is on its way.
    act(() => {
      result.current.dayAdd.onAddDated();
    });
    act(() => {
      result.current.handleAddDay();
    });
    expect(fixtureState.actions.appendDatedDay).toHaveBeenCalledTimes(1);
    expect(fixtureState.actions.appendDatedDay).toHaveBeenCalledWith(42);
    expect(fixtureState.actions.insertDay).not.toHaveBeenCalled();

    await act(async () => {
      finish({ id: 99, date: '2026-06-04' });
    });
    await waitFor(() => expect(result.current.dayAdd.busy).toBe(false));
    expect(toasts).toContainEqual(
      expect.objectContaining({
        type: 'success',
        message: expect.stringMatching(/^Day added\. The trip now ends on .*Jun 4/),
      })
    );

    // Free again: the next click goes through.
    await act(async () => {
      result.current.handleAddDay();
    });
    expect(fixtureState.actions.insertDay).toHaveBeenCalledWith(42, undefined);
    await waitFor(() => expect(result.current.dayAdd.busy).toBe(false));
  });

  it('FE-TP-HOOK-129: a failure is said in the traveller language; offline and at the day limit nothing is asked', async () => {
    seedDated();
    fixtureState.actions.appendDatedDay.mockRejectedValueOnce(new Error('A trip can span at most 999 days'));
    const failing = await renderPlanner();
    await act(async () => {
      failing.result.current.dayAdd.onAddDated();
    });
    await waitFor(() =>
      expect(toasts).toContainEqual(expect.objectContaining({ type: 'error', message: 'Failed to add day' }))
    );
    await waitFor(() => expect(failing.result.current.dayAdd.busy).toBe(false));
    failing.unmount();

    fixtureState.actions.appendDatedDay.mockClear();
    env.forcedOffline = true;
    seedDated();
    const offline = await renderPlanner();
    expect(offline.result.current.dayAdd.blocked).toBe('Changing days needs a connection');
    act(() => {
      offline.result.current.dayAdd.onAddDated();
    });
    act(() => {
      offline.result.current.handleAddDay();
    });
    expect(fixtureState.actions.appendDatedDay).not.toHaveBeenCalled();
    expect(fixtureState.actions.insertDay).not.toHaveBeenCalled();
    offline.unmount();

    env.forcedOffline = false;
    seedDated({
      trip: buildTrip({ id: 42, start_date: '2026-01-01', end_date: '2028-09-25' }),
    } as Partial<TripStoreState>);
    const { result } = await renderPlanner();
    expect(result.current.dayAdd.datedBlocked).toBe('A trip can span at most 999 days');
    act(() => {
      result.current.dayAdd.onAddDated();
    });
    expect(fixtureState.actions.appendDatedDay).not.toHaveBeenCalled();
  });
});
