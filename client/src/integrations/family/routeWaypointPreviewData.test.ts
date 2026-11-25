import { expect, it } from 'vitest';
import type { Assignment, AssignmentsMap } from '../../types';
import { previewVias } from './routeWaypointPreviewData';
import type { WaypointView } from './routeWaypointContract';

const assignment = (id: number, order_index: number): Assignment => ({
  id, order_index, day_id: 1, place_id: id, place: { id, name: String(id), lat: 19, lng: -98 },
});
const view: WaypointView = {
  editable: true,
  legs: [{ dayId: 1, fromId: 100, toId: 101, revision: 1, waypointId: 500, point: { lat: 19.2438, lng: -98.8748 } }],
};

it('projects a stable pair at its current native leg index', () => {
  const assignments: AssignmentsMap = { 1: [assignment(99, 0), assignment(100, 1), assignment(101, 2)] };
  expect(previewVias(view, assignments)).toEqual({
    1: [{ id: 500, day_id: 1, after_order_index: 1, sequence: 0, lat: 19.2438, lng: -98.8748 }],
  });
});

it('never moves a waypoint to a different or reversed leg', () => {
  expect(previewVias(view, { 1: [assignment(100, 0), assignment(99, 1), assignment(101, 2)] })).toEqual({});
  expect(previewVias(view, { 1: [assignment(101, 0), assignment(100, 1)] })).toEqual({});
  expect(previewVias(view, { 2: [assignment(100, 0), assignment(101, 1)] })).toEqual({});
});
