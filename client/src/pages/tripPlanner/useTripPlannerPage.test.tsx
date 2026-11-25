import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { TourListItem } from '@trek/shared';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAssignment, buildPlace } from '../../../tests/helpers/factories';
import { hikePlannerDefaults } from '../../../tests/helpers/tourPlannerStub';
import type { Bbox } from '../../components/Map/usePoiExplore';
import type { TourRoutePart } from '../../components/Tours/planner/tourRouting';
import MTourWorkspace from '../../mobile/screens/trip/tours/MTourWorkspace';
import { installPlannerEditorPort } from '../../repo/plannerEditorPort';
import { baseState } from '../TripPlannerPage.wiring.fixture';
import type { useTripPlanner } from './useTripPlanner';
import { useTripPlannerPage, useTripPlannerPageOf } from './useTripPlannerPage';

const ports = vi.hoisted(() => ({
  base: vi.fn(),
  workspace: vi.fn(),
  links: vi.fn(),
  focus: vi.fn(),
  search: vi.fn(),
  parts: vi.fn(),
  obstacle: vi.fn(),
  overview: vi.fn(),
  poi: vi.fn(),
  measured: vi.fn(),
  report: vi.fn(),
  paddlePaint: vi.fn(),
  walkPaint: vi.fn(),
  highlighted: vi.fn(),
  drawn: vi.fn(),
  split: vi.fn(),
  mapProps: null as Record<string, unknown> | null,
  railProps: null as Record<string, unknown> | null,
}));

vi.mock('./useTripPlanner', () => ({ useTripPlanner: () => ports.base() }));
vi.mock('./useTourWorkspace', () => ({ useTourWorkspace: (...args: unknown[]) => ports.workspace(...args) }));
vi.mock('./useAssistantEntityLinks', () => ({ useAssistantEntityLinks: (...args: unknown[]) => ports.links(...args) }));
vi.mock('./usePlannerFocusPoints', () => ({ usePlannerFocusPoints: (...args: unknown[]) => ports.focus(...args) }));
vi.mock('./useMapLocationSearch', () => ({ useMapLocationSearch: (...args: unknown[]) => ports.search(...args) }));
vi.mock('./useTourOverview', () => ({ useTourOverview: (...args: unknown[]) => ports.overview(...args) }));
vi.mock('../../components/Tours/paddle/useTrackPortageParts', () => ({
  useTrackPortageParts: (...args: unknown[]) => ports.parts(...args),
}));
vi.mock('../../components/Tours/paddle/usePaddleObstacleSync', () => ({
  usePaddleObstacleSync: (...args: unknown[]) => ports.obstacle(...args),
}));
vi.mock('../../components/Tours/paddle/paddlePaint', () => ({ usePaddlePaint: () => ports.paddlePaint() }));
vi.mock('../../components/Tours/walk/walkRoutePaint', () => ({ useWalkRoutePaint: () => ports.walkPaint() }));
vi.mock('../../components/Tours/bike/useHighlightedRoute', () => ({
  useHighlightedRoute: (...args: unknown[]) => ports.highlighted(...args),
}));
vi.mock('../../components/Tours/planner/legVariantPaint', () => ({
  useLegVariantLines: (...args: unknown[]) => ports.drawn(...args),
}));
vi.mock('../../components/Map/usePoiExplore', () => ({ usePoiExplore: () => ports.poi() }));
vi.mock('../../hooks/useReportedHeight', () => ({ useMeasuredHeight: () => ports.measured() }));
vi.mock('../../hooks/usePlanMapViewport', () => ({
  usePlanMapViewport: (...args: unknown[]) => ports.report(...args),
}));
vi.mock('../../store/paddleObstacleStore', () => ({
  usePaddleObstacleStore: (selector: (state: { focus: null }) => unknown) => selector({ focus: null }),
}));

// The touch shell's real workspace must borrow its planner, while heavy rails/maps stay controlled.
vi.mock('../../hooks/sizeClass', () => ({ useIsSplit: () => ports.split() }));
vi.mock('../../hooks/useTouchDragBridge', () => ({ useTouchDragBridge: () => {} }));
vi.mock('../../mobile/screens/trip/tabHeadSlot', () => ({ useTabHeadSlot: () => null }));
vi.mock('../../components/Tours/TourGpxDropZone', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../components/Tours/TourWorkspaceRail', () => ({ default: () => null }));
vi.mock('../../components/Tours/planner/railHead', () => ({
  FloatingRailHeads: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../components/Tours/planner/TourPlannerPanels', () => ({
  TourPlannerToursRail: (props: Record<string, unknown>) => {
    ports.railProps = props;
    return null;
  },
}));
vi.mock('./TourPlannerMapStage', () => ({
  TourPlannerMapStage: (props: Record<string, unknown>) => {
    ports.mapProps = props;
    return null;
  },
}));
vi.mock('./LazyPanel', () => ({ LazyPanel: ({ children }: { children: ReactNode }) => children }));
vi.mock('../../mobile/components/MIconBtn', () => ({ default: () => null }));
vi.mock('../../mobile/components/MSegmented', () => ({ default: () => null }));

type Planner = ReturnType<typeof useTripPlanner>;
type Line = [number, number][];
const line: Line = [
  [19, -99],
  [20, -98],
];
const other: Line = [
  [21, -97],
  [22, -96],
];
const third: Line = [
  [23, -95],
  [24, -94],
];
let removeEditor: (() => void) | undefined;

function model() {
  const events: string[] = [];
  const planner = {
    ...baseState(),
    activeTab: 'plan',
    enabledAddons: { tours: false },
    tourPlaceIds: new Set<number>(),
    tourStageStops: {},
    tours: [] as TourListItem[],
    editingPlace: null as ReturnType<typeof buildPlace> | null,
    assignments: {} as Record<string, ReturnType<typeof buildAssignment>[]>,
    can: vi.fn((_action: string, _trip: unknown) => false),
    setSelectedPlaceId: vi.fn(),
    setShowPlaceForm: vi.fn((v: boolean) => events.push(`show:${v}`)),
    setEditingPlace: vi.fn((v: unknown) => events.push(`place:${v}`)),
    setEditingAssignmentId: vi.fn((v: unknown) => events.push(`assignment:${v}`)),
    setPrefillCoords: vi.fn((v: unknown) => events.push(`coords:${v}`)),
    setServiceStopForm: vi.fn((v: boolean) => events.push(`service:${v}`)),
  };
  const controller = {
    ...hikePlannerDefaults(),
    mode: { type: 'neutral', tour: { tour_type: 'hike' } },
    route: null as Line | null,
    routeParts: null as TourRoutePart[] | null,
    readOnlyGpxAnalysis: null as { routeCoordinates: Line } | null,
    mapFocusKey: 0,
    closeGpxTour: vi.fn(),
    error: null as string | null,
  };
  const workspace = {
    tourPlanner: controller,
    wandererBrowser: { open: false, line: null as Line | null, selected: null as { id: string } | null },
    tourConversion: { line: null as Line | null, status: 'idle', points: other },
    viewImportedTour: vi.fn(),
    openTourInPlanner: vi.fn(),
    tourGpxImport: {},
    recordedTrack: {},
    trackPaddlePlan: {},
    paddleChecklist: {},
    skiClassification: {},
    tourDetailActions: {},
  };
  const focus = { focusPoints: line, lastPlanMapViewportRef: { current: null as Bbox | null } };
  const location = { mapFocusPoints: line, mapFocusKey: 'search:1', locationSearch: {} };
  const overview = { framePoints: line, tourPlaces: [], focusSuffix: '' };
  const poi = { onViewportChange: vi.fn(() => events.push('poi')) };
  const report = vi.fn(() => events.push('report'));
  ports.base.mockReturnValue(planner);
  ports.workspace.mockReturnValue(workspace);
  ports.focus.mockReturnValue(focus);
  ports.search.mockReturnValue(location);
  ports.parts.mockReturnValue(null);
  ports.overview.mockReturnValue(overview);
  ports.poi.mockReturnValue(poi);
  ports.measured.mockReturnValue({ height: 20, measure: vi.fn() });
  ports.report.mockReturnValue(report);
  ports.paddlePaint.mockReturnValue({ portage: 'brown', rapids: 'amber', gap: 'red', disc: 'white' });
  ports.walkPaint.mockReturnValue({ ferry: 'blue', stale: 'grey' });
  ports.highlighted.mockImplementation((_enabled: unknown, route: unknown, walking: unknown, colors: unknown) => ({
    route,
    walking,
    colors,
  }));
  ports.drawn.mockImplementation((route: unknown, walking: unknown, colors: unknown) => ({
    route,
    walking,
    colors,
    overlays: [],
  }));
  ports.split.mockReturnValue(true);
  // One fixture boundary supplies only fields the real page hook consumes; no live planner/provider is started.
  return {
    planner: planner as unknown as Planner,
    raw: planner,
    workspace,
    controller,
    focus,
    location,
    overview,
    poi,
    report,
    events,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ports.mapProps = null;
  ports.railProps = null;
});
afterEach(() => {
  cleanup();
  removeEditor?.();
  removeEditor = undefined;
  vi.restoreAllMocks();
});

describe('planner page route and ownership contract', () => {
  it.each([
    'neutral',
    'wanderer-line',
    'wanderer-empty',
    'gpx-no-analysis',
    'gpx-empty',
    'gpx-line',
    'gpx-conversion',
    'gpx-parts',
    'gpx-empty-parts',
    'new-draft-line',
    'edit-saved-line',
    'draft-parts',
    'draft-empty-parts',
    'draft-empty-route',
  ])('keeps route precedence for %s', (scenario) => {
    const m = model();
    let expected: Line[] | null = null;
    if (scenario.startsWith('wanderer')) {
      m.workspace.wandererBrowser.open = true;
      m.workspace.wandererBrowser.line = scenario === 'wanderer-line' ? line : null;
      m.controller.mode.type = 'edit-saved';
      m.controller.route = other;
      expected = scenario === 'wanderer-line' ? [line] : null;
    } else if (scenario.startsWith('gpx')) {
      m.controller.mode.type = 'view-gpx';
      if (scenario !== 'gpx-no-analysis')
        m.controller.readOnlyGpxAnalysis = { routeCoordinates: scenario === 'gpx-empty' ? [] : line };
      if (scenario === 'gpx-conversion') {
        m.workspace.tourConversion.line = other;
        expected = [line, other];
      } else if (scenario === 'gpx-parts') {
        ports.parts.mockReturnValue([
          { coordinates: other, free: false },
          { coordinates: third, free: true },
        ]);
        expected = [other, third];
      } else if (scenario === 'gpx-empty-parts') {
        ports.parts.mockReturnValue([]);
        expected = [];
      } else if (scenario === 'gpx-line') expected = [line];
    } else if (scenario !== 'neutral') {
      m.controller.mode.type = scenario === 'edit-saved-line' ? 'edit-saved' : 'new-draft';
      m.controller.route = scenario === 'draft-empty-route' ? null : line;
      if (scenario === 'draft-parts') {
        m.controller.routeParts = [{ coordinates: other, free: false }];
        expected = [other];
      } else {
        if (scenario === 'draft-empty-parts') m.controller.routeParts = [];
        expected = m.controller.route ? [line] : null;
      }
    }
    const { result } = renderHook(() => useTripPlannerPageOf(m.planner));
    expect(result.current.tourMap.route).toEqual(expected);
    if (expected) expected.forEach((segment, i) => expect(result.current.tourMap.route?.[i]).toBe(segment));
    expect(ports.base).not.toHaveBeenCalled();
  });

  it('keeps memo ownership and recomputes when a route dependency changes', () => {
    const m = model();
    m.controller.mode.type = 'new-draft';
    m.controller.route = line;
    const { result, rerender } = renderHook(() => useTripPlannerPageOf(m.planner));
    const before = result.current.tourMap.route;
    rerender();
    expect(result.current.tourMap.route).toBe(before);
    m.controller.route = other;
    rerender();
    expect(result.current.tourMap.route).toEqual([other]);
    expect(result.current.tourMap.route).not.toBe(before);
  });

  it.each([false, true])('passes rights through without enabling disabled features (editable=%s)', (editable) => {
    const m = model();
    m.raw.can.mockReturnValue(editable);
    const { result } = renderHook(() => useTripPlannerPageOf(m.planner));
    expect(m.raw.can.mock.calls).toEqual([
      ['place_edit', m.planner.trip],
      ['day_edit', m.planner.trip],
    ]);
    expect(ports.workspace).toHaveBeenCalledWith(m.planner, editable, editable);
    expect(result.current.permissions).toEqual({ canPlaceEdit: editable, canDayEdit: editable });
    expect(m.raw.enabledAddons.tours).toBe(false);
    expect(ports.obstacle).toHaveBeenCalledWith(null, false);
    expect(ports.report).toHaveBeenCalledWith(m.planner.tripId, true);
    expect(m.controller.closeGpxTour).toHaveBeenCalledOnce();
  });

  it('keeps independent edit/assign rights, the wrapper and every returned reference', () => {
    const m = model();
    m.raw.can.mockImplementation((action: string) => action === 'day_edit');
    const { result } = renderHook(() => useTripPlannerPage());
    expect(ports.base).toHaveBeenCalledOnce();
    expect(result.current.planner).toBe(m.planner);
    expect(result.current.permissions).toEqual({ canPlaceEdit: false, canDayEdit: true });
    for (const key of [
      'tourPlanner',
      'tourGpxImport',
      'wandererBrowser',
      'viewImportedTour',
      'tourConversion',
      'recordedTrack',
      'trackPaddlePlan',
      'paddleChecklist',
      'skiClassification',
      'tourDetailActions',
    ] as const) {
      expect(result.current[key]).toBe(m.workspace[key]);
    }
    expect(result.current.locationSearch).toBe(m.location.locationSearch);
    expect(result.current.tourMap.openOverviewTour).toBe(m.workspace.openTourInPlanner);
    expect(result.current.dayPlanTours.tourPlaceIds).toBe(m.raw.tourPlaceIds);
    expect(result.current.dayPlanTours.tourStageStops).toBe(m.raw.tourStageStops);
    expect(ports.links).toHaveBeenCalledWith({ planner: m.planner, workspace: m.workspace });
  });

  it('retains GPX/conversion, paddle paint, stale walking and camera precedence', () => {
    const m = model();
    m.raw.activeTab = 'tour-planner';
    m.controller.mode.type = 'view-gpx';
    m.controller.mode.tour.tour_type = 'kayak';
    m.controller.readOnlyGpxAnalysis = { routeCoordinates: line };
    m.workspace.tourConversion.line = other;
    m.workspace.tourConversion.status = 'ready';
    const { result, rerender } = renderHook(() => useTripPlannerPageOf(m.planner));
    expect(ports.obstacle).toHaveBeenLastCalledWith(line, true);
    expect(result.current.tourMap.routeWalking).toEqual([true, false]);
    expect(result.current.tourMap.previewPoints).toBe(other);
    expect(m.controller.closeGpxTour).not.toHaveBeenCalled();
    m.controller.mode.type = 'edit-saved';
    m.controller.isPaddle = true;
    m.controller.error = 'walk-gap';
    m.controller.routeParts = [{ coordinates: line, free: false, land: true }];
    rerender();
    expect(result.current.tourMap.routeColors).toEqual([{ line: 'grey', casing: 'white' }]);
    expect(result.current.tourMap.routeWalking).toEqual([true]);
    m.workspace.wandererBrowser.open = true;
    m.workspace.wandererBrowser.selected = { id: 'trail-7' };
    rerender();
    expect(result.current.tourMap.focusKey).toBe('wanderer:trail-7');
  });

  it('reports viewport in order and refreshes the POI callback without changing the held callback', () => {
    const m = model();
    let snapshot: Bbox | null = null;
    Object.defineProperty(m.focus.lastPlanMapViewportRef, 'current', {
      get: () => snapshot,
      set: (v) => {
        snapshot = v;
        m.events.push('snapshot');
      },
    });
    const { result, rerender } = renderHook(() => useTripPlannerPageOf(m.planner));
    const capture = result.current.tourMap.captureViewport;
    const bounds = { south: 1, west: 2, north: 3, east: 4 };
    act(() => capture(bounds));
    expect(snapshot).toBe(bounds);
    expect(m.events).toEqual(['snapshot', 'poi', 'report']);
    m.events.length = 0;
    m.poi.onViewportChange = vi.fn(() => m.events.push('new-poi'));
    rerender();
    expect(result.current.tourMap.captureViewport).toBe(capture);
    act(() => capture(bounds));
    expect(m.events).toEqual(['snapshot', 'new-poi', 'report']);
  });

  it.each([false, true])('cancels the observed editor before the original form resets (port=%s)', (installed) => {
    const m = model();
    if (installed)
      removeEditor = installPlannerEditorPort({
        openEditor: async () => ({ place: buildPlace(), assignment: null }),
        saveForm: async () => ({ id: 1, state: 'published' }),
        confirmEditor: async () => {},
        selectedAssignment: () => null,
        cancelEditor: () => {
          m.events.push('cancel');
        },
        reportError: vi.fn(),
      });
    const { result } = renderHook(() => useTripPlannerPageOf(m.planner));
    act(() => result.current.placeForm.close());
    expect(m.events).toEqual([
      ...(installed ? ['cancel'] : []),
      'show:false',
      'place:null',
      'assignment:null',
      'coords:null',
      'service:false',
    ]);
  });

  it('keeps the latest observed visit and tour data in the place form', () => {
    const m = model();
    const place = buildPlace({ id: 7 });
    m.raw.editingPlace = place;
    const stale = buildAssignment({ id: 5, place });
    const fresh = { ...stale, notes: 'current visit' };
    m.raw.assignments = { day: [stale] };
    const tour = {
      place_id: 7,
      duration: 60,
      planned_duration_minutes: 90,
      break_additional_minutes: 10,
    } as TourListItem;
    m.raw.tours = [tour];
    const selected = vi.fn(() => fresh);
    removeEditor = installPlannerEditorPort({
      openEditor: async () => ({ place, assignment: fresh }),
      saveForm: async () => ({ id: 7, state: 'published' }),
      confirmEditor: async () => {},
      selectedAssignment: selected,
      cancelEditor: vi.fn(),
      reportError: vi.fn(),
    });
    const { result } = renderHook(() => useTripPlannerPageOf(m.planner));
    expect(selected).toHaveBeenCalledWith(7);
    expect(result.current.placeForm.dayAssignments).toEqual([fresh]);
    expect(result.current.placeForm.tour).toBe(tour);
    expect(result.current.dayPlanTours.plannedTourDurations.get(7)).toMatchObject({ plannedTotalMinutes: 90, tour });
  });

  it('retains a tour opener only for the selected tour and element', () => {
    const m = model();
    const { result } = renderHook(() => useTripPlannerPageOf(m.planner));
    const opener = document.createElement('button');
    const tour = { place_id: 7 } as TourListItem;
    act(() => result.current.tourDetails.onSelectTour(tour, opener));
    expect(result.current.tourDetails.openerRef.current).toEqual({ placeId: 7, element: opener });
    expect(m.raw.setSelectedPlaceId).toHaveBeenLastCalledWith(7);
    act(() => result.current.tourDetails.onSelectTour(tour));
    expect(result.current.tourDetails.openerRef.current).toBeNull();
    act(() => result.current.tourDetails.onSelectTour(null, opener));
    expect(m.raw.setSelectedPlaceId).toHaveBeenLastCalledWith(null);
  });

  it('renders the touch workspace over its existing planner, without creating another one', () => {
    const m = model();
    m.raw.activeTab = 'tour-planner';
    render(createElement(MTourWorkspace, { planner: m.planner }));
    expect(ports.base).not.toHaveBeenCalled();
    expect(ports.workspace).toHaveBeenCalledWith(m.planner, false, false);
    expect(ports.mapProps).toMatchObject({ tripId: m.planner.tripId, tourPlanner: m.controller, canPlaceEdit: false });
    expect(ports.railProps).toMatchObject({ canEdit: false, canAssign: false, tours: m.raw.tours });
  });
});
