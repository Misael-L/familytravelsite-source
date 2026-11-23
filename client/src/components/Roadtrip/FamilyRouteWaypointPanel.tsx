import { useState, type FormEvent } from 'react'
import { savePreviewWaypoint, usePreviewRouteWaypoints } from '../../hooks/usePreviewRouteWaypoints'
import { useTranslation } from '../../i18n/TranslationContext'
import type { WaypointSave } from '../../integrations/family/routeWaypointContract'
import { waypointLegIndex } from '../../integrations/family/routeWaypointPreviewData'
import { isHostedOrdinaryTripPreview } from '../../integrations/family/routePlanningPreview'
import { useTripStore } from '../../store/tripStore'
import { roadtripStopList } from '../../utils/dayRouteVias'

type Leg = WaypointSave & { label: string }

function PointFields({ leg, pending, save }: { leg: Leg; pending: boolean; save: (point: WaypointSave['point']) => void }) {
  const { t } = useTranslation()
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    save({ lat: Number(fields.get('latitude')), lng: Number(fields.get('longitude')) })
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-caption">
          {t('family.routeWaypoint.latitude')}
          <input className="min-w-0 rounded-lg border border-edge bg-surface-input p-2" name="latitude"
            type="number" min={-90} max={90} step="any" required defaultValue={leg.point?.lat} disabled={pending} />
        </label>
        <label className="grid gap-1 text-caption">
          {t('family.routeWaypoint.longitude')}
          <input className="min-w-0 rounded-lg border border-edge bg-surface-input p-2" name="longitude"
            type="number" min={-180} max={180} step="any" required defaultValue={leg.point?.lng} disabled={pending} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-accent px-3 py-2 font-semibold text-accent-text disabled:opacity-50">
          {t('family.routeWaypoint.save')}
        </button>
        {leg.point && (
          <button type="button" disabled={pending} onClick={() => save(null)}
            className="rounded-lg border border-edge px-3 py-2 disabled:opacity-50">
            {t('family.routeWaypoint.remove')}
          </button>
        )}
      </div>
    </form>
  )
}

export default function FamilyRouteWaypointPanel({ tripId }: { tripId: number }) {
  const { t } = useTranslation()
  const { view, failed, offline } = usePreviewRouteWaypoints(tripId, true)
  const assignments = useTripStore(state => state.assignments)
  const days = useTripStore(state => state.days)
  const [selected, setSelected] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const legs = days.flatMap(day => {
    const stops = roadtripStopList(assignments[String(day.id)])
    return (view?.legs ?? []).flatMap(leg => {
      if (leg.dayId !== day.id) return []
      const index = waypointLegIndex(stops, leg.fromId, leg.toId)
      if (index < 0) return []
      const label = t('family.routeWaypoint.leg', {
        day: day.day_number,
        from: stops[index].place.name,
        to: stops[index + 1].place.name,
      })
      return [{ ...leg, label }]
    })
  })
  const current = legs.find(leg => leg.fromId === selected) ?? legs[0]
  const savedLegs = legs.filter(leg => leg.point)
  async function save(leg: Leg, point: WaypointSave['point']) {
    if (pending || offline || failed || !view?.editable) return
    setPending(true)
    setMessage('')
    try {
      const { dayId, fromId, toId, revision } = leg
      await savePreviewWaypoint(tripId, { dayId, fromId, toId, revision, point })
      setMessage(t(point ? 'family.routeWaypoint.saved' : 'family.routeWaypoint.removed'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('places.saveError'))
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-4 text-body">
      <h2 className="font-semibold">{t('family.routeWaypoint.title')}</h2>
      {isHostedOrdinaryTripPreview() && <p className="text-caption text-content-muted">{t('family.routePlanning.savedStops')}</p>}
      {offline || failed ? (
        <p role="status" className="text-caption text-content-muted">{t('family.routeWaypoint.unavailable')}</p>
      ) : current && view?.editable ? (
        <>
          <p className="text-caption text-content-muted">{t('family.routeWaypoint.mapHint')}</p>
          <label className="grid gap-1 text-caption">
            {t('family.routeWaypoint.chooseLeg')}
            <select value={current.fromId} onChange={event => { setSelected(Number(event.target.value)); setMessage('') }}
              disabled={pending} className="min-w-0 rounded-lg border border-edge bg-surface-input p-2 text-body">
              {legs.map(leg => <option key={leg.fromId} value={leg.fromId}>{leg.label}</option>)}
            </select>
          </label>
          <PointFields key={`${current.fromId}:${current.revision}`} leg={current} pending={pending} save={point => void save(current, point)} />
        </>
      ) : view && !view.editable && savedLegs.length > 0 ? (
        <ul className="space-y-2 text-caption text-content-muted">
          {savedLegs.map(leg => <li key={leg.fromId}>{leg.label}</li>)}
        </ul>
      ) : (
        <p className="text-caption text-content-muted">{t(view ? 'family.routeWaypoint.noLegs' : 'common.loading')}</p>
      )}
      {message && <p role="status" className="text-caption text-content-muted">{message}</p>}
    </section>
  )
}
