import { useRef, useState } from 'react'
import { useToast } from '../components/shared/Toast'
import { hasReadOnlySession } from '../db/readOnlySession'
import { useTranslation } from '../i18n/TranslationContext'
import { isFamilyRoutePlanningPreview } from '../integrations/family/routePlanningPreview'
import { currentPlannerAssignmentPort } from '../repo/plannerAssignmentPort'
import { useTripStore } from '../store/tripStore'
import { roadtripVisitOrder } from '../utils/dayRouteVias'
import { refreshPreviewRouteWaypoints, usePreviewRouteWaypoints } from './usePreviewRouteWaypoints'

export function usePreviewRoadtripReorder() {
  const { t } = useTranslation()
  const toast = useToast()
  const tripId = useTripStore(state => state.trip?.id ?? null)
  const { view, failed, offline } = usePreviewRouteWaypoints(tripId, isFamilyRoutePlanningPreview())
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  if (!tripId || !view?.editable || failed || offline || saving || hasReadOnlySession()) return undefined

  return async (dayId: number, visitId: number, destination: number) => {
    const trip = useTripStore.getState()
    if (!isFamilyRoutePlanningPreview() || pending.current || trip.trip?.id !== tripId || hasReadOnlySession()) return
    const planner = currentPlannerAssignmentPort()
    if (!planner) return
    const order = roadtripVisitOrder(trip.assignments[String(dayId)] ?? [], visitId, destination)
    if (!order) return
    pending.current = true
    setSaving(true)
    try {
      // Use the existing planner command with its original trip, visit revisions and receipt.
      await planner.execute({ action: 'reorder', trip: tripId, day: dayId, order })
      refreshPreviewRouteWaypoints(tripId)
      toast.success(t('family.roadtripOrder.saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('places.saveError'))
    } finally {
      pending.current = false
      setSaving(false)
    }
  }
}
