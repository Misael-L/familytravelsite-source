import { expect, it, vi } from 'vitest';
import { previewTourMapLayer, type TrackAction, type TrackCoordinate } from './previewTourMapDraft';

const points: TrackCoordinate[] = [[0, 0], [0, .001], [0, .002], [0, .003]];
const select = vi.fn();

function layer(action: TrackAction, interactive = true) {
  return previewTourMapLayer({
    points, shape: [1, 2], draft: { action, index: 2, lat: '0.0005', lng: '0.0015' },
    interactive, pointLabel: String, insertLabel: 'New point', select,
  });
}

it('previews the moved line and only lets intermediate handles select or drag', () => {
  select.mockClear();
  const map = layer('move');
  expect(map.line).toEqual([[0, 0], [0, .001], [.0005, .0015], [0, .003]]);
  expect(map.plannerWaypoints?.map(point => point.id)).toEqual(['1', '2']);
  expect(map.onPlannerWaypointMove?.('0', 0, .0002)).toBe(false);
  expect(map.onPlannerWaypointMove?.('1', .001, .001)).toBe(true);
  expect(select).toHaveBeenCalledExactlyOnceWith(1, [.001, .001]);
});

it('maps either side of a pending point to the same insertion gap and snaps the click to the line', () => {
  select.mockClear();
  const map = layer('insert');
  expect(map.selectedPlannerWaypointId).toBe('new');
  expect(map.line).toHaveLength(5);
  expect(map.plannerWaypoints?.map(point => point.id)).toEqual(['1', '2', 'new']);
  map.onRouteClick?.(.00022, .00127);
  map.onRouteClick?.(.00022, .00173);
  expect(select.mock.calls.map(([index]) => index)).toEqual([2, 2]);
  expect(select.mock.calls[0][1][0]).toBeGreaterThan(0);
  expect(select.mock.calls[0][1][0]).toBeLessThan(.0005);
});

it('keeps a selected removal visible while previewing its effect and disables map input while locked', () => {
  const map = layer('remove');
  expect(map.line).toEqual([points[0], points[1], points[3]]);
  expect(map.selectedPlannerWaypointId).toBe('2');
  expect(map.onPlannerWaypointMove).toBeUndefined();
  const locked = layer('insert', false);
  expect(locked.onRouteClick).toBeUndefined();
  expect(locked.onPlannerWaypointMove).toBeUndefined();
});
