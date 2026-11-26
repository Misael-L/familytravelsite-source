import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WaypointView } from '../../integrations/family/routeWaypointContract'
import { usePreviewWaypointGestures } from './usePreviewWaypointGestures'

const mock = vi.hoisted(() => ({ save: vi.fn(), readOnly: vi.fn(() => false) }))
vi.mock('../../hooks/usePreviewRouteWaypoints', () => ({ savePreviewWaypoint: mock.save }))
vi.mock('../../integrations/family/routePlanningPreview', () => ({ isFamilyRoutePlanningPreview: () => true }))
vi.mock('../../db/readOnlySession', () => ({ hasReadOnlySession: mock.readOnly }))

const point = { lat: 19.25874, lng: -98.88367 }
const drop = { lat: 19.259, lng: -98.885 }
const view: WaypointView = {
  editable: true,
  legs: [
    { dayId: 1, fromId: 10, toId: 11, waypointId: 20, revision: 2, point },
    { dayId: 1, fromId: 11, toId: 12, waypointId: null, revision: 0, point: null },
  ],
}

function open(snapshot = view, unavailable = false) {
  const toast = { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  const { result } = renderHook(() => usePreviewWaypointGestures({ tripId: 15, view: snapshot, editable: !unavailable }, { t: key => key, toast }))
  if (!result.current) throw new Error('Expected waypoint gestures')
  return { gesture: result.current, toast }
}

describe('Family preview waypoint gestures', () => {
  beforeEach(() => {
    mock.save.mockReset().mockResolvedValue(undefined)
    mock.readOnly.mockReset().mockReturnValue(false)
  })

  it('adds only an empty directed leg and leaves an occupied leg alone', async () => {
    const { gesture, toast } = open()
    expect(await gesture.place(1, 10, 11, drop)).toBe(false)
    expect(toast.info).toHaveBeenCalledWith('family.routeWaypoint.occupied')
    expect(await gesture.place(1, 12, 11, drop)).toBe(false)
    expect(await gesture.place(1, 11, 12, drop)).toBe(true)
    expect(mock.save).toHaveBeenCalledExactlyOnceWith(15, { dayId: 1, fromId: 11, toId: 12, revision: 0, point: drop })
  })

  it('drags the same saved leg with its observed revision and reports a rejected drop', async () => {
    const { gesture, toast } = open()
    mock.save.mockRejectedValueOnce(new Error('This waypoint changed.'))
    expect(await gesture.move(1, 20, drop)).toBe(false)
    expect(mock.save).toHaveBeenCalledExactlyOnceWith(15, { dayId: 1, fromId: 10, toId: 11, revision: 2, point: drop })
    expect(toast.error).toHaveBeenCalledWith('This waypoint changed.')
    expect(await gesture.remove(2, 20)).toBe(false)
    expect(await gesture.remove(1, 20)).toBe(true)
    expect(mock.save).toHaveBeenLastCalledWith(15, { dayId: 1, fromId: 10, toId: 11, revision: 2, point: null })
  })

  it('refuses offline, read-only, and competing gestures', async () => {
    expect(await open(view, true).gesture.move(1, 20, drop)).toBe(false)
    mock.readOnly.mockReturnValueOnce(true)
    const { gesture } = open()
    expect(await gesture.move(1, 20, drop)).toBe(false)
    expect(mock.save).not.toHaveBeenCalled()
    const saving = gesture.move(1, 20, drop)
    expect(await gesture.remove(1, 20)).toBe(false)
    expect(await saving).toBe(true)
    expect(mock.save).toHaveBeenCalledTimes(1)
  })
})
