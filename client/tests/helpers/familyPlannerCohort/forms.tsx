import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import PlaceFormModal from '../../../src/components/Planner/PlaceFormModal';
import { ReservationModal } from '../../../src/components/Planner/ReservationModal';
import { placeFormContext } from '../../../src/pages/tripPlanner/placeFormContext';
import { usePlaceEdits } from '../../../src/pages/tripPlanner/usePlaceEdits';
import { usePlaceFormOpeners } from '../../../src/pages/tripPlanner/usePlaceFormOpeners';
import { usePlannerDialogs } from '../../../src/pages/tripPlanner/usePlannerDialogs';
import { currentPlannerEditorPort } from '../../../src/repo/plannerEditorPort';
import { useTripStore } from '../../../src/store/tripStore';
import type { Place } from '../../../src/types';
import { placeFormProps } from '../placeFormSetup';
import { required } from './core';
import { query, toast } from './state';

export function NativeEditor({ selected = true }: { selected?: boolean }) {
  const store = useTripStore(
      useShallow((s) => ({ trip: s.trip, places: s.places, days: s.days, assignments: s.assignments }))
    ),
    tripActions = useTripStore.getState(),
    [editingPlace, setEditingPlace] = useState<Place | null>(null),
    [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null),
    [show, setShow] = useState(false);
  const noop = () => {};
  const edits = usePlaceEdits({
    tripId: required(store.trip).id,
    trip: store.trip,
    can: () => true,
    tripActions,
    toast,
    t: (k: string) => k,
    places: store.places,
    allPlaces: store.places,
    tripAccommodations: [],
    reservations: [],
    loadAccommodations: noop,
    toursEnabled: false,
    tourPlaceIds: new Set(),
    invalidateTourPlaceIds: noop,
    reloadTourPlaceIds: async () => {},
    selectedPlaceId: null,
    setSelectedPlaceId: noop,
    selectedDayId: store.days[0].id,
    updateRouteForDay: async () => {},
    pushUndo: noop,
    forgetPlace: noop,
    editingPlace,
    editingAssignmentId,
    placeFormDayId: null,
    placeFormPosition: null,
    roadtripRoutes: { days: [] },
    roadtripVias: { byDay: {}, reanchor: async () => {} },
    viaLiesBefore: () => () => false,
  } as unknown as Parameters<typeof usePlaceEdits>[0]);
  const openers = usePlaceFormOpeners({
    trip: store.trip,
    can: () => true,
    isMobile: false,
    placeLang: 'en',
    places: store.places,
    days: store.days,
    assignments: store.assignments,
    tripAccommodations: [],
    handlePlaceClick: noop,
    isTourPlace: () => false,
    setPrefillCoords: noop,
    setEditingPlace,
    setEditingAssignmentId,
    setPlaceFormDayId: noop,
    setPlaceFormPosition: noop,
    setShowPlaceForm: setShow,
    stopDraft: null,
    setStopDraft: noop,
    serviceStopForm: false,
    serviceStopKind: null,
    setServiceStopForm: noop,
    setServiceStopKind: noop,
    roadtripActive: false,
    roadtripFeedActive: false,
    roadtripRoutes: { days: [] },
    roadtripCorridor: {},
    manualStopTargetFor: () => null,
  } as unknown as Parameters<typeof usePlaceFormOpeners>[0]);
  const assignment = store.assignments[String(store.days[0].id)][0];
  const close = () => {
    currentPlannerEditorPort()?.cancelEditor();
    setShow(false);
    setEditingPlace(null);
  };
  return (
    <>
      <button onClick={() => openers.openPlaceEditor(store.places[0], selected ? assignment.id : null)}>
        Open native editor
      </button>
      {show && (
        <PlaceFormModal
          {...placeFormProps}
          place={editingPlace}
          tripId={required(store.trip).id}
          assignmentId={editingAssignmentId}
          dayAssignments={
            placeFormContext(
              editingPlace,
              store.assignments,
              [],
              currentPlannerEditorPort()?.selectedAssignment(editingPlace?.id ?? null)
            ).dayAssignments
          }
          onClose={close}
          onSave={edits.handleSavePlace}
        />
      )}
    </>
  );
}

export function NativeCreationForm({ onDay = false }: { onDay?: boolean }) {
  const store = useTripStore(useShallow((s) => ({ trip: s.trip, places: s.places, days: s.days }))),
    actions = useTripStore.getState(),
    noop = () => {};
  const dialogs = usePlannerDialogs({
    tripId: required(store.trip).id,
    tripActions: actions,
    searchParams: query,
    setSearchParams: noop,
  });
  const edits = usePlaceEdits({
    tripId: required(store.trip).id,
    trip: store.trip,
    tripActions: actions,
    toast,
    t: (k: string) => k,
    can: () => true,
    editingPlace: null,
    editingAssignmentId: null,
    placeFormDayId: dialogs.placeFormDayId,
    placeFormPosition: dialogs.placeFormPosition,
    places: store.places,
    allPlaces: store.places,
    tripAccommodations: [],
    reservations: [],
    tourPlaceIds: new Set(),
    roadtripRoutes: { days: [] },
    roadtripVias: { byDay: {} },
    loadAccommodations: noop,
    selectedPlaceId: null,
    setSelectedPlaceId: noop,
    selectedDayId: null,
    pushUndo: noop,
    updateRouteForDay: noop,
    forgetPlace: noop,
  } as unknown as Parameters<typeof usePlaceEdits>[0]);
  return (
    <>
      <button
        onClick={() => {
          dialogs.setPlaceFormDayId(onDay ? store.days[0].id : null);
          dialogs.setShowPlaceForm(true);
        }}
      >
        New native place
      </button>
      {dialogs.showPlaceForm && (
        <PlaceFormModal
          {...placeFormProps}
          tripId={required(store.trip).id}
          onClose={() => dialogs.setShowPlaceForm(false)}
          onSave={edits.handleSavePlace}
        />
      )}
    </>
  );
}

export function NativeBookingCohortForm({
  onLegacy,
  onClosed,
}: {
  onLegacy: () => Promise<undefined>;
  onClosed: () => void;
}) {
  const state = useTripStore(
      useShallow((s) => ({ days: s.days, places: s.places, assignments: s.assignments, reservations: s.reservations }))
    ),
    [open, setOpen] = useState(true),
    [original] = useState(state.reservations[0]);
  return (
    <ReservationModal
      isOpen={open}
      reservation={original}
      onClose={() => {
        setOpen(false);
        onClosed();
      }}
      onSave={onLegacy}
      days={state.days}
      places={state.places}
      assignments={state.assignments}
      selectedDayId={null}
      onFileDelete={async () => {}}
    />
  );
}
