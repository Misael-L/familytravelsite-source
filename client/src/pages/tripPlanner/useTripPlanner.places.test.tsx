// organize-imports-ignore
// sort-imports-ignore
// Install original hoisted mocks before consumers and preserve dependency evaluation order.
import {
  fixtureState,
  updateRouteForDay,
  toasts,
  wrapper,
  renderPlanner,
  seedTrip,
} from '../../../tests/helpers/tripPlannerHook/state';
import 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import '../../i18n/TranslationContext';
import { useTranslation } from '../../i18n';
import './useTripPlanner';
import { useTripStore } from '../../store/tripStore';
import '../../store/authStore';
import '../../store/settingsStore';
import '../../store/permissionsStore';
import '../../store/pluginStore';
import '../../store/backgroundTasksStore';
import { useAddonStore } from '../../store/addonStore';
import '../../../tests/helpers/store';
import { buildDay, buildPlace, buildAssignment, buildReservation } from '../../../tests/helpers/factories';
import { assignmentsApi, mapsApi, toursApi } from '../../api/client';
import { accommodationRepo } from '../../repo/accommodationRepo';
import '../../db/offlineDb';
import '../../services/photoService';
import type { TourListItem } from '@trek/shared';
import '../../mobile/useIsPhone';
import '../../../tests/helpers/plannerActions';

describe('useTripPlanner — selection handlers', () => {
  it('FE-TP-HOOK-038: clicking a planned stop selects its assignment and reopens both panels', async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2 });
    seedTrip({ places: [place] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.setLeftCollapsed(true);
      result.current.setRightCollapsed(true);
    });

    act(() => {
      result.current.handlePlaceClick(1, 10);
    });

    expect(result.current.selectedAssignmentId).toBe(10);
    expect(result.current.selectedPlaceId).toBe(1);
    expect(result.current.leftCollapsed).toBe(false);
    expect(result.current.rightCollapsed).toBe(false);
  });

  it('FE-TP-HOOK-039: clicking a pool place selects the place alone', async () => {
    seedTrip({ places: [buildPlace({ id: 1, lat: 1, lng: 2 })] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.handlePlaceClick(1);
    });

    expect(result.current.selectedPlaceId).toBe(1);
    expect(result.current.selectedAssignmentId).toBeNull();
  });

  it('FE-TP-HOOK-040: an undefined marker id clears the selection', async () => {
    seedTrip({ places: [buildPlace({ id: 1, lat: 1, lng: 2 })] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.handlePlaceClick(1);
    });
    act(() => {
      result.current.handleMarkerClick(undefined);
    });

    expect(result.current.selectedPlaceId).toBeNull();
  });

  it('FE-TP-HOOK-041: an unplanned marker toggles its own selection', async () => {
    seedTrip({ places: [buildPlace({ id: 1, lat: 1, lng: 2 })] });

    const { result } = await renderPlanner();

    act(() => {
      result.current.handleMarkerClick(1);
    });
    expect(result.current.selectedPlaceId).toBe(1);

    act(() => {
      result.current.handleMarkerClick(1);
    });
    expect(result.current.selectedPlaceId).toBeNull();
  });

  it('FE-TP-HOOK-042: a marker with one assignment selects it, a second click clears it', async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2 });
    seedTrip({
      places: [place],
      assignments: { '7': [buildAssignment({ id: 10, day_id: 7, place })] },
    });

    const { result } = await renderPlanner();

    act(() => {
      result.current.handleMarkerClick(1);
    });
    expect(result.current.selectedAssignmentId).toBe(10);

    act(() => {
      result.current.handleMarkerClick(1);
    });
    expect(result.current.selectedPlaceId).toBeNull();
  });

  it('FE-TP-HOOK-043: repeated marker clicks cycle through every occurrence, then clear', async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2 });
    seedTrip({
      places: [place],
      assignments: {
        '7': [buildAssignment({ id: 10, day_id: 7, place })],
        '8': [buildAssignment({ id: 11, day_id: 8, place })],
      },
    });

    const { result } = await renderPlanner();

    act(() => {
      result.current.handleMarkerClick(1);
    });
    expect(result.current.selectedAssignmentId).toBe(10);

    act(() => {
      result.current.handleMarkerClick(1);
    });
    expect(result.current.selectedAssignmentId).toBe(11);

    act(() => {
      result.current.handleMarkerClick(1);
    });
    expect(result.current.selectedPlaceId).toBeNull();
  });

  it('FE-TP-HOOK-044: a map background click drops the selection', async () => {
    seedTrip({ places: [buildPlace({ id: 1, lat: 1, lng: 2 })] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.handlePlaceClick(1);
    });
    act(() => {
      result.current.handleMapClick();
    });

    expect(result.current.selectedPlaceId).toBeNull();
  });

  it('FE-TP-HOOK-045: selecting a day resets the mobile drawer and recomputes the route', async () => {
    seedTrip();

    const { result } = await renderPlanner();
    act(() => {
      result.current.setMobileSidebarOpen('left');
    });
    act(() => {
      result.current.handleSelectDay(7);
    });

    expect(fixtureState.actions.setSelectedDay).toHaveBeenCalledWith(7);
    expect(updateRouteForDay).toHaveBeenCalledWith(7);
    expect(result.current.mobileSidebarOpen).toBeNull();
  });

  it('FE-TP-HOOK-046: skipFit selects the day without bumping the map fit key', async () => {
    seedTrip({ places: [buildPlace({ id: 1, lat: 1, lng: 2 })] });

    const { result } = await renderPlanner();
    const before = result.current.fitKey;

    act(() => {
      result.current.handleSelectDay(7, true);
    });
    expect(result.current.fitKey).toBe(before);

    act(() => {
      result.current.handleSelectDay(8);
    });
    expect(result.current.fitKey).toBe(before + 1);
  });
});

describe('useTripPlanner — add place entry points', () => {
  it('FE-TP-HOOK-047: a map right-click prefills the form and enriches it by reverse geocoding', async () => {
    vi.mocked(mapsApi.reverse).mockResolvedValue({ name: 'Fushimi Inari', address: 'Kyoto' } as never);
    seedTrip();

    const { result } = await renderPlanner();
    const preventDefault = vi.fn();

    await act(async () => {
      await result.current.handleMapContextMenu({
        originalEvent: { preventDefault },
        latlng: { lat: 34.9, lng: 135.7 },
      });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.showPlaceForm).toBe(true);
    await waitFor(() => expect(result.current.prefillCoords?.name).toBe('Fushimi Inari'));
    expect(result.current.prefillCoords?.address).toBe('Kyoto');
  });

  it('FE-TP-HOOK-048: a failing reverse geocode still leaves the bare coordinates prefilled', async () => {
    vi.mocked(mapsApi.reverse).mockRejectedValue(new Error('offline'));
    seedTrip();

    const { result } = await renderPlanner();

    await act(async () => {
      await result.current.handleMapContextMenu({ latlng: { lat: 1, lng: 2 } });
    });

    expect(result.current.prefillCoords).toEqual({ lat: 1, lng: 2 });
    expect(result.current.showPlaceForm).toBe(true);
  });

  it('FE-TP-HOOK-049: a POI marker prefills the form without a reverse-geocode round trip', async () => {
    seedTrip();

    const { result } = await renderPlanner();

    act(() => {
      result.current.openAddPlaceFromPoi({
        lat: 1,
        lng: 2,
        name: 'Cafe',
        address: null,
        website: null,
        phone: null,
        osm_id: 'node/1',
      });
    });

    expect(result.current.prefillCoords).toEqual({
      lat: 1,
      lng: 2,
      name: 'Cafe',
      address: '',
      website: undefined,
      phone: undefined,
      osm_id: 'node/1',
      // A marker with no category behind it is an ordinary place, and the form is told so
      // rather than left to guess: `stop_type` is write-once on the server, so an absent
      // field and an explicit "not a service stop" are different answers.
      stop_type: null,
      duration_minutes: undefined,
    });
    expect(result.current.showPlaceForm).toBe(true);
    expect(mapsApi.reverse).not.toHaveBeenCalled();
  });

  it('FE-TP-HOOK-141: a plugin POI prefills with its own id, and a website only when it is a web address', async () => {
    seedTrip();
    const { result } = await renderPlanner();
    const trailhead = {
      lat: 47.1,
      lng: 11.2,
      name: 'Trailhead',
      address: 'Hut 1',
      website: 'https://trails.example/th-1',
      phone: '+43 1',
      osm_id: 'plugin:trail-finder:th-1',
      category: 'plugin:trail-finder/trailheads',
      source: 'plugin:trail-finder',
      details: [{ label: 'Length', value: '12 km' }],
      icon: 'Signpost',
      color: '#2f855a',
    };

    act(() => {
      result.current.openAddPlaceFromPoi(trailhead);
    });

    // Only the fields the form has: the details, icon and colour stay on the map.
    expect(result.current.prefillCoords).toMatchObject({
      lat: 47.1,
      lng: 11.2,
      name: 'Trailhead',
      address: 'Hut 1',
      website: 'https://trails.example/th-1',
      phone: '+43 1',
      osm_id: 'plugin:trail-finder:th-1',
      stop_type: null,
      duration_minutes: undefined,
    });
    expect(mapsApi.reverse).not.toHaveBeenCalled();

    act(() => {
      result.current.openAddPlaceFromPoi({ ...trailhead, website: 'javascript:alert(1)' });
    });
    expect(result.current.prefillCoords?.website).toBeUndefined();
    act(() => {
      result.current.openAddPlaceFromPoi({ ...trailhead, website: 'trails.example' });
    });
    expect(result.current.prefillCoords?.website).toBe('https://trails.example');
  });

  it('FE-TP-HOOK-142: a plugin POI tapped on the map opens the same prefilled form', async () => {
    seedTrip();
    const { result } = await renderPlanner();

    act(() => {
      result.current.handlePoiClick({
        lat: 47.1,
        lng: 11.2,
        name: 'Trailhead',
        address: null,
        website: null,
        phone: null,
        osm_id: 'plugin:trail-finder:th-1',
      });
    });

    expect(result.current.showPlaceForm).toBe(true);
    expect(result.current.prefillCoords).toMatchObject({
      name: 'Trailhead',
      osm_id: 'plugin:trail-finder:th-1',
      website: undefined,
    });
  });

  it("FE-TP-HOOK-050: the pool editor resolves a place's lone assignment for its times", async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2 });
    seedTrip({
      places: [place],
      assignments: { '7': [buildAssignment({ id: 10, day_id: 7, place })] },
    });

    const { result } = await renderPlanner();
    act(() => {
      result.current.openPlaceEditor(place);
    });

    expect(result.current.editingAssignmentId).toBe(10);
    expect(result.current.editingPlace?.id).toBe(1);
  });
});

describe('useTripPlanner — place CRUD', () => {
  it('FE-TP-HOOK-051: adding a place uploads its pending files and registers an undo', async () => {
    seedTrip();

    const { result } = await renderPlanner();
    const file = new File(['x'], 'ticket.pdf');

    await act(async () => {
      await result.current.handleSavePlace({ name: 'Nara', _pendingFiles: [file] });
    });

    expect(fixtureState.actions.addPlace).toHaveBeenCalledWith(42, { name: 'Nara' });
    expect(fixtureState.actions.addFile).toHaveBeenCalledTimes(1);
    expect(result.current.canUndo).toBe(true);

    await act(async () => {
      await result.current.undo();
    });
    expect(fixtureState.actions.deletePlace).toHaveBeenCalledWith(42, 900);
  });

  it('FE-TP-HOOK-052: a failing attachment upload only toasts, the place still saves', async () => {
    seedTrip();
    fixtureState.actions.addFile.mockRejectedValue(new Error('too large'));

    const { result } = await renderPlanner();

    await act(async () => {
      await result.current.handleSavePlace({ name: 'Nara', _pendingFiles: [new File(['x'], 'a.pdf')] });
    });

    expect(toasts.some((t) => t.type === 'error')).toBe(true);
    expect(toasts.some((t) => t.type === 'success')).toBe(true);
  });

  it('FE-TP-HOOK-053: editing from a day strips the times off the place and writes them per assignment', async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2 });
    seedTrip({
      places: [place],
      assignments: { '7': [buildAssignment({ id: 10, day_id: 7, place })] },
    });

    const { result } = await renderPlanner();
    act(() => {
      result.current.openPlaceEditor(place);
    });

    await act(async () => {
      await result.current.handleSavePlace({ name: 'Nara', place_time: '09:00', end_time: '10:00' });
    });

    expect(fixtureState.actions.updatePlace).toHaveBeenCalledWith(42, 1, { name: 'Nara' });
    expect(fixtureState.actions.setAssignmentTimes).toHaveBeenCalledWith(42, 7, 10, {
      place_time: '09:00',
      end_time: '10:00',
    });
    expect(assignmentsApi.updateTime).not.toHaveBeenCalled();
  });

  it('FE-TP-HOOK-053b: a changed assignment note is stripped off the place and PUT per assignment (#2163)', async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2 });
    seedTrip({
      places: [place],
      assignments: { '7': [buildAssignment({ id: 10, day_id: 7, place })] },
    });

    const { result } = await renderPlanner();
    act(() => {
      result.current.openPlaceEditor(place);
    });

    await act(async () => {
      await result.current.handleSavePlace({ name: 'Nara', assignment_notes: 'Book the 10:00 entry' });
    });

    expect(fixtureState.actions.updatePlace).toHaveBeenCalledWith(42, 1, { name: 'Nara' });
    expect(fixtureState.actions.setAssignmentNotes).toHaveBeenCalledWith(42, 7, 10, 'Book the 10:00 entry');
  });

  it('FE-TP-HOOK-053c: without assignment_notes in the payload no notes write happens; an empty string clears (#2163)', async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2 });
    seedTrip({
      places: [place],
      assignments: { '7': [buildAssignment({ id: 10, day_id: 7, place })] },
    });

    const { result } = await renderPlanner();
    act(() => {
      result.current.openPlaceEditor(place);
    });

    // The form strips an untouched note, so the key is simply absent.
    await act(async () => {
      await result.current.handleSavePlace({ name: 'Nara' });
    });
    expect(fixtureState.actions.setAssignmentNotes).not.toHaveBeenCalled();

    // An empty string is an explicit clear and goes out as null.
    await act(async () => {
      await result.current.handleSavePlace({ name: 'Nara', assignment_notes: '' });
    });
    expect(fixtureState.actions.setAssignmentNotes).toHaveBeenCalledWith(42, 7, 10, null);
  });

  it('FE-TP-HOOK-054: editing an unassigned place skips the per-assignment time write', async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2 });
    seedTrip({ places: [place] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.openPlaceEditor(place);
    });

    await act(async () => {
      await result.current.handleSavePlace({ name: 'Nara', _pendingFiles: [new File(['x'], 'a.pdf')] });
    });

    expect(fixtureState.actions.setAssignmentTimes).not.toHaveBeenCalled();
    expect(fixtureState.actions.addFile).toHaveBeenCalledTimes(1);
  });

  it('FE-TP-HOOK-054b: an attachment that fails on the edit path toasts but keeps the update', async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2 });
    seedTrip({ places: [place] });
    fixtureState.actions.addFile.mockRejectedValue(new Error('unsupported type'));

    const { result } = await renderPlanner();
    act(() => {
      result.current.openPlaceEditor(place);
    });

    await act(async () => {
      await result.current.handleSavePlace({ name: 'Nara', _pendingFiles: [new File(['x'], 'a.exe')] });
    });

    expect(fixtureState.actions.updatePlace).toHaveBeenCalledWith(42, 1, { name: 'Nara' });
    expect(toasts.some((t) => t.type === 'error')).toBe(true);
    expect(toasts.some((t) => t.type === 'success')).toBe(true);
  });

  it('FE-TP-HOOK-055: confirming a delete removes the place and can restore it with its days', async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2, route_geometry: '[[1,2]]', route_color: '#ff0000' });
    seedTrip({
      places: [place],
      days: [buildDay({ id: 7, day_number: 1 })],
      assignments: { '7': [buildAssignment({ id: 10, day_id: 7, place, order_index: 2 })] },
    });

    const { result } = await renderPlanner();
    act(() => {
      result.current.handleDeletePlace(1);
    });
    act(() => {
      result.current.handlePlaceClick(1);
    });
    await act(async () => {
      await result.current.confirmDeletePlace();
    });

    expect(fixtureState.actions.deletePlace).toHaveBeenCalledWith(42, 1);
    expect(result.current.selectedPlaceId).toBeNull();

    await act(async () => {
      await result.current.undo();
    });
    expect(fixtureState.actions.addPlace).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ route_geometry: '[[1,2]]', route_color: '#ff0000' })
    );
    expect(fixtureState.actions.assignPlaceToDay).toHaveBeenCalledWith(42, 7, 900, 2);
  });

  it('preserves legacy deletion behavior for a dormant Tour and forgets only its stale assignment undo', async () => {
    const tourPlace = buildPlace({ id: 1, name: 'Ridge walk', tour_place_id: 1 });
    const unrelatedUndo = vi.fn();
    const tourAssignmentUndo = vi.fn();
    seedTrip({ places: [tourPlace] });
    fixtureState.actions.deletePlace.mockResolvedValue({ success: true, tourPlaceIds: [1] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.pushUndo('Unrelated place edit', unrelatedUndo);
      result.current.pushUndo('Remove Tour from day', tourAssignmentUndo, [7], [1]);
      result.current.handleDeletePlace(1);
    });
    expect(result.current.deletePlaceIsTour).toBe(true);

    await act(async () => {
      await result.current.confirmDeletePlace();
    });

    expect(fixtureState.actions.deletePlace).toHaveBeenCalledWith(42, 1);
    expect(fixtureState.actions.addPlace).not.toHaveBeenCalled();
    expect(result.current.lastActionLabel).toBe('Unrelated place edit');
    expect(result.current.canUndo).toBe(true);
    await act(async () => {
      await result.current.undo();
    });
    expect(unrelatedUndo).toHaveBeenCalledTimes(1);
    expect(tourAssignmentUndo).not.toHaveBeenCalled();
  });

  it('allows permanent Tour deletion only in TOUR-PLANNER and leaves cancellation inert', async () => {
    const tourPlace = buildPlace({ id: 1, name: 'Ridge walk', tour_place_id: 1 });
    seedTrip({ places: [tourPlace] });
    useAddonStore.setState({ addons: [{ id: 'tours', enabled: true } as never], loaded: true });
    vi.spyOn(toursApi, 'list').mockResolvedValue({ tours: [] });
    fixtureState.actions.deletePlace.mockResolvedValue({ success: true, tourPlaceIds: [1] });

    const { result } = await renderPlanner();
    await waitFor(() => expect(result.current.toursEnabled).toBe(true));

    act(() => {
      result.current.handleDeletePlace(1);
    });
    expect(result.current.deletePlaceId).toBeNull();
    expect(fixtureState.actions.deletePlace).not.toHaveBeenCalled();

    act(() => {
      result.current.handleDeleteTour(1);
    });
    expect(result.current.deletePlaceId).toBe(1);
    act(() => {
      result.current.setDeletePlaceId(null);
    });
    await act(async () => {
      await result.current.confirmDeletePlace();
    });
    expect(fixtureState.actions.deletePlace).not.toHaveBeenCalled();

    act(() => {
      result.current.handleDeleteTour(1);
    });
    let deletedTourId: number | null = null;
    await act(async () => {
      deletedTourId = await result.current.confirmDeletePlace();
    });
    expect(fixtureState.actions.deletePlace).toHaveBeenCalledWith(42, 1);
    expect(fixtureState.actions.deletePlace).toHaveBeenCalledTimes(1);
    expect(deletedTourId).toBe(1);
    expect(fixtureState.actions.addPlace).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
  });

  it('uses the server facet result to suppress Undo for a dormant Tour when Tours is off', async () => {
    const dormantPlace = buildPlace({ id: 1, name: 'Dormant route' });
    seedTrip({ places: [dormantPlace] });
    fixtureState.actions.deletePlace.mockResolvedValue({ success: true, tourPlaceIds: [1] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.handleDeletePlace(1);
    });
    await act(async () => {
      await result.current.confirmDeletePlace();
    });

    expect(result.current.enabledAddons.tours).toBe(false);
    expect(fixtureState.actions.addPlace).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
  });

  it('does not offer a partial bulk Undo when the deleted selection includes a Tour', async () => {
    const ordinary = buildPlace({ id: 1, name: 'Ordinary place' });
    const tourPlace = buildPlace({ id: 2, name: 'Tour', tour_place_id: 2 });
    seedTrip({ places: [ordinary, tourPlace] });
    fixtureState.actions.deletePlacesMany.mockResolvedValue({ deleted: [1, 2], count: 2, tourPlaceIds: [2] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.setDeletePlaceIds([1, 2]);
    });
    expect(result.current.deletePlacesIncludeTours).toBe(true);
    await act(async () => {
      await result.current.confirmDeletePlaces();
    });

    expect(fixtureState.actions.deletePlacesMany).toHaveBeenCalledWith(42, [1, 2]);
    expect(fixtureState.actions.addPlace).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
  });

  it('FE-TP-HOOK-056: confirmDeletePlace is a no-op until a place is queued', async () => {
    seedTrip();

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.confirmDeletePlace();
    });

    expect(fixtureState.actions.deletePlace).not.toHaveBeenCalled();
  });

  it('FE-TP-HOOK-057: a failing delete surfaces the server message', async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2, tour_place_id: 1 });
    const listedTour: TourListItem = {
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
    seedTrip({ places: [place] });
    useAddonStore.setState({ addons: [{ id: 'tours', enabled: true } as never], loaded: true });
    vi.spyOn(toursApi, 'list').mockResolvedValue({ tours: [listedTour] });
    fixtureState.actions.deletePlace.mockRejectedValue(new Error('Tour is locked'));

    const { result } = await renderPlanner();
    await waitFor(() => expect(result.current.tours).toEqual([listedTour]));
    act(() => {
      result.current.handleDeleteTour(1);
    });
    let failedTourId: number | null = 1;
    await act(async () => {
      failedTourId = await result.current.confirmDeletePlace();
    });

    expect(failedTourId).toBeNull();
    expect(result.current.tours).toEqual([listedTour]);
    expect(useTripStore.getState().places).toContain(place);
    expect(toasts.some((t) => t.message === 'Tour is locked' && t.type === 'error')).toBe(true);
    expect(toasts.some((t) => t.type === 'success')).toBe(false);
  });

  it('FE-TP-HOOK-058: a bulk delete restores every place with its assignments on undo', async () => {
    const a = buildPlace({ id: 1, lat: 1, lng: 2 });
    const b = buildPlace({ id: 2, lat: 3, lng: 4 });
    seedTrip({
      places: [a, b],
      days: [buildDay({ id: 7, day_number: 1 })],
      assignments: { '7': [buildAssignment({ id: 10, day_id: 7, place: a, order_index: 0 })] },
    });

    const { result } = await renderPlanner();
    act(() => {
      result.current.setDeletePlaceIds([1, 2]);
    });
    act(() => {
      result.current.handlePlaceClick(1);
    });
    await act(async () => {
      await result.current.confirmDeletePlaces();
    });

    expect(fixtureState.actions.deletePlacesMany).toHaveBeenCalledWith(42, [1, 2]);
    expect(result.current.deletePlaceIds).toBeNull();
    expect(result.current.selectedPlaceId).toBeNull();

    await act(async () => {
      await result.current.undo();
    });
    expect(fixtureState.actions.addPlace).toHaveBeenCalledTimes(2);
    expect(fixtureState.actions.assignPlaceToDay).toHaveBeenCalledWith(42, 7, 900, 0);
  });

  it('FE-TP-HOOK-134: bringing a deleted place back skips a day deleted since, and still restores the rest', async () => {
    const place = buildPlace({ id: 1, lat: 1, lng: 2 });
    seedTrip({
      places: [place],
      days: [buildDay({ id: 7, day_number: 1 }), buildDay({ id: 8, day_number: 2 })],
      assignments: {
        '7': [buildAssignment({ id: 10, day_id: 7, place, order_index: 0 })],
        '8': [buildAssignment({ id: 11, day_id: 8, place, order_index: 3 })],
      },
    });
    const { result } = await renderPlanner();
    act(() => {
      result.current.handleDeletePlace(1);
    });
    await act(async () => {
      await result.current.confirmDeletePlace();
    });

    // Day 7 went in the meantime.
    act(() => {
      useTripStore.setState({ days: [buildDay({ id: 8, day_number: 1 })] });
    });
    await act(async () => {
      await result.current.handleUndo();
    });

    expect(fixtureState.actions.addPlace).toHaveBeenCalledTimes(1);
    expect(fixtureState.actions.assignPlaceToDay).toHaveBeenCalledTimes(1);
    expect(fixtureState.actions.assignPlaceToDay).toHaveBeenCalledWith(42, 8, 900, 3);
    expect(toasts).toContainEqual(expect.objectContaining({ type: 'info', message: 'Undone: Place deleted' }));
  });

  it('FE-TP-HOOK-059: an explicit id list leaves the queued bulk selection untouched', async () => {
    seedTrip({ places: [buildPlace({ id: 1, lat: 1, lng: 2 })] });

    const { result } = await renderPlanner();
    act(() => {
      result.current.setDeletePlaceIds([9]);
    });
    await act(async () => {
      await result.current.confirmDeletePlaces([1]);
    });

    expect(fixtureState.actions.deletePlacesMany).toHaveBeenCalledWith(42, [1]);
    expect(result.current.deletePlaceIds).toEqual([9]);
  });

  it('FE-TP-HOOK-060: an empty bulk delete does nothing and a failing one toasts', async () => {
    seedTrip({ places: [buildPlace({ id: 1, lat: 1, lng: 2 })] });
    fixtureState.actions.deletePlacesMany.mockRejectedValue(new Error('nope'));

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.confirmDeletePlaces([]);
    });
    expect(fixtureState.actions.deletePlacesMany).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.confirmDeletePlaces([1]);
    });
    expect(toasts.some((t) => t.message === 'nope')).toBe(true);
  });

  it('FE-TP-HOOK-118: the delete question names the booked night, its booking and the expense before the yes', async () => {
    // The server takes the night down with the place, and the booking and its
    // expense with the night. The question only named the place, so a traveller
    // deleting a hotel learnt about the rest from the costs total afterwards.
    const hotel = buildPlace({ id: 1, name: 'Hotel Fjord', lat: 60.39, lng: 5.32 });
    const cafe = buildPlace({ id: 2, name: 'Cafe', lat: 1, lng: 2 });
    seedTrip({
      places: [hotel, cafe],
      reservations: [buildReservation({ id: 9, type: 'hotel', title: 'Booking 4711', accommodation_id: 7 })],
    });
    vi.mocked(accommodationRepo.list).mockResolvedValue({
      accommodations: [{ id: 7, trip_id: 42, place_id: 1, start_day_id: 5, end_day_id: 6 }] as never,
    });

    const { result } = await renderPlanner();
    await waitFor(() => expect(result.current.tripAccommodations).toHaveLength(1));
    const { result: i18n } = renderHook(() => useTranslation(), { wrapper });

    act(() => {
      result.current.handleDeletePlace(1);
    });
    expect(result.current.deletePlaceNote).toBe(
      i18n.current.t('trip.confirm.deletePlaceBooked', { name: 'Hotel Fjord', booking: 'Booking 4711' })
    );
    // Still a question: nothing has been written.
    expect(fixtureState.actions.deletePlace).not.toHaveBeenCalled();

    // A place without a night adds nothing to the question.
    act(() => {
      result.current.handleDeletePlace(2);
    });
    expect(result.current.deletePlaceNote).toBeNull();
  });

  it('FE-TP-HOOK-140: a booking named after its hotel is not quoted a second time', async () => {
    const hotel = buildPlace({ id: 1, name: 'Rostock', lat: 54.09, lng: 12.1 });
    seedTrip({
      places: [hotel],
      reservations: [buildReservation({ id: 9, type: 'hotel', title: 'Rostock', accommodation_id: 7 })],
    });
    vi.mocked(accommodationRepo.list).mockResolvedValue({
      accommodations: [{ id: 7, trip_id: 42, place_id: 1, start_day_id: 5, end_day_id: 6 }] as never,
    });

    const { result } = await renderPlanner();
    await waitFor(() => expect(result.current.tripAccommodations).toHaveLength(1));
    const { result: i18n } = renderHook(() => useTranslation(), { wrapper });

    act(() => {
      result.current.handleDeletePlace(1);
    });
    expect(result.current.deletePlaceNote).toBe(
      i18n.current.t('trip.confirm.deletePlaceBookedSame', { name: 'Rostock' })
    );
    expect(result.current.deletePlaceNote).toBe(
      'This also deletes the stay booked at “Rostock”, its booking and any expense linked to it.'
    );
  });

  it('FE-TP-HOOK-119: a bulk delete warns once any of the places carries a night, booking or not', async () => {
    const hotel = buildPlace({ id: 1, name: 'Hotel Fjord', lat: 60.39, lng: 5.32 });
    const cafe = buildPlace({ id: 2, name: 'Cafe', lat: 1, lng: 2 });
    seedTrip({ places: [hotel, cafe] });
    vi.mocked(accommodationRepo.list).mockResolvedValue({
      accommodations: [{ id: 7, trip_id: 42, place_id: 1, start_day_id: 5, end_day_id: 6 }] as never,
    });

    const { result } = await renderPlanner();
    await waitFor(() => expect(result.current.tripAccommodations).toHaveLength(1));
    const { result: i18n } = renderHook(() => useTranslation(), { wrapper });

    // A night without a partner booking still goes with the place, so it is still named.
    act(() => {
      result.current.setDeletePlaceIds([2, 1]);
    });
    expect(result.current.deletePlacesNote).toBe(
      i18n.current.t('trip.confirm.deletePlaceNight', { name: 'Hotel Fjord' })
    );

    act(() => {
      result.current.setDeletePlaceIds([2]);
    });
    expect(result.current.deletePlacesNote).toBeNull();
  });

  it('FE-TP-HOOK-061: a bulk category change restores each previous category group on undo', async () => {
    seedTrip({
      places: [
        buildPlace({ id: 1, lat: 1, lng: 2, category_id: 3 }),
        buildPlace({ id: 2, lat: 3, lng: 4, category_id: null }),
        buildPlace({ id: 3, lat: 5, lng: 6, category_id: 3 }),
      ],
    });

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.confirmChangeCategory([1, 2, 3], 9);
    });

    expect(fixtureState.actions.updatePlacesMany).toHaveBeenCalledWith(42, [1, 2, 3], { category_id: 9 });

    await act(async () => {
      await result.current.undo();
    });
    expect(fixtureState.actions.updatePlacesMany).toHaveBeenCalledWith(42, [1, 3], { category_id: 3 });
    expect(fixtureState.actions.updatePlacesMany).toHaveBeenCalledWith(42, [2], { category_id: null });
  });

  it('FE-TP-HOOK-062: an empty category change is skipped and a failing one toasts', async () => {
    seedTrip({ places: [buildPlace({ id: 1, lat: 1, lng: 2 })] });
    fixtureState.actions.updatePlacesMany.mockRejectedValue(new Error('denied'));

    const { result } = await renderPlanner();
    await act(async () => {
      await result.current.confirmChangeCategory([], 1);
    });
    expect(fixtureState.actions.updatePlacesMany).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.confirmChangeCategory([1], 1);
    });
    expect(toasts.some((t) => t.message === 'denied')).toBe(true);
  });
});
