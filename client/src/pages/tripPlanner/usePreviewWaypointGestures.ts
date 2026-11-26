import { useRef } from 'react'
import type { RoadtripVias } from '../../components/Roadtrip/useRoadtripVias'
import { hasReadOnlySession } from '../../db/readOnlySession'
import { savePreviewWaypoint } from '../../hooks/usePreviewRouteWaypoints'
import { isFamilyRoutePlanningPreview } from '../../integrations/family/routePlanningPreview'
import type { WaypointSave, WaypointView } from '../../integrations/family/routeWaypointContract'
import type { PlannerBase } from './plannerTypes'

type Leg = WaypointView['legs'][number]
type Point = NonNullable<WaypointSave['point']>

export function usePreviewWaypointGestures(
  preview: RoadtripVias['preview'], { t, toast }: Pick<PlannerBase, 't' | 'toast'>,
) {
  const pending = useRef(false)
  if (!preview) return undefined
  const { tripId, view, editable } = preview

  async function save(leg: Leg | undefined, point: WaypointSave['point']) {
    if (!isFamilyRoutePlanningPreview() || hasReadOnlySession() || pending.current) return false
    if (!editable) {
      toast.info(t('family.routeWaypoint.mapUnavailable'))
      return false
    }
    if (!leg) {
      toast.info(t('family.routeWaypoint.chooseMapLeg'))
      return false
    }
    pending.current = true
    try {
      const { dayId, fromId, toId, revision } = leg
      await savePreviewWaypoint(tripId, { dayId, fromId, toId, revision, point })
      toast.success(t(point ? 'family.routeWaypoint.saved' : 'family.routeWaypoint.removed'))
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('places.saveError'))
      return false
    } finally {
      pending.current = false
    }
  }

  const savedLeg = (dayId: number, id: number) => view?.legs.find(leg =>
    leg.dayId === dayId && leg.waypointId === id && leg.point !== null,
  )

  return {
    place: async (dayId: number, fromId: number, toId: number, point: Point) => {
      const leg = view?.legs.find(candidate => candidate.dayId === dayId && candidate.fromId === fromId && candidate.toId === toId)
      if (leg?.point) {
        toast.info(t('family.routeWaypoint.occupied'))
        return false
      }
      return save(leg, point)
    },
    move: (dayId: number, id: number, point: Point) => save(savedLeg(dayId, id), point),
    remove: (dayId: number, id: number) => save(savedLeg(dayId, id), null),
  }
}
