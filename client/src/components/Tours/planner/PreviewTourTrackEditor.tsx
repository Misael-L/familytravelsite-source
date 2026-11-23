import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { TourListItem } from '@trek/shared';
import { isAxiosError } from 'axios';
import { apiClient } from '../../../api/client';
import { useNetworkMode } from '../../../hooks/useNetworkMode';
import { useTranslation } from '../../../i18n';
import { captureReadSession } from '../../../sync/readSession';
import { BOX } from '../../Planner/bookings/bookingParts';
import { usePublishPreviewTourMap } from './PreviewTourMapContext';
import { draftCoordinate, previewTourMapLayer, type TrackCoordinate as Point, type TrackAction } from './previewTourMapDraft';

const ACTION_LABEL = {
  move: 'family.previewTour.movePoint',
  insert: 'family.previewTour.addPoint',
  remove: 'family.previewTour.removePoint',
} as const;
const SUBMIT_LABEL = { ...ACTION_LABEL, move: 'family.previewTour.saveTrack' } as const;
const MAP_HINT = {
  move: 'family.previewTour.moveOnMap',
  insert: 'family.previewTour.addOnMap',
  remove: 'family.previewTour.removeOnMap',
} as const;
const FIELD = `${BOX} min-w-0 px-2 py-1.5 text-sm text-content disabled:opacity-50`;

function pointDraft(action: TrackAction, index: number, points: Point[]) {
  const [lat, lng] = points[index];
  if (action !== 'insert') return { action, index, lat: String(lat), lng: String(lng) };
  const [fromLat, fromLng] = points[index - 1];
  const delta = ((lng - fromLng + 540) % 360) - 180;
  const midpoint = ((fromLng + delta / 2 + 540) % 360) - 180;
  return { action, index, lat: String(Number(((fromLat + lat) / 2).toFixed(8))), lng: String(Number(midpoint.toFixed(8))) };
}

function trackSaveError(cause: unknown, action: TrackAction) {
  const problem = isAxiosError<{ code?: string }>(cause) ? cause.response : undefined;
  if (problem?.data?.code === 'tour_track_conflict') return 'family.previewTour.trackConflict';
  if (problem?.status === 400)
    return action === 'remove' ? 'family.previewTour.removePointInvalid' : 'family.previewTour.trackInvalid';
  return problem?.status === 409 ? 'family.previewTour.trackContextChanged' : 'family.previewTour.trackFailed';
}

export default function PreviewTourTrackEditor({ tripId, placeId, onSaved, onClose, revision, track, stationIndices, operationIdFor }: {
  tripId: number | string;
  placeId: number;
  onSaved: (tour: TourListItem) => void;
  onClose: () => void;
  revision: number;
  track: string;
  stationIndices: readonly number[];
  operationIdFor: (fingerprint: string) => string;
}) {
  const { t } = useTranslation();
  const { offline } = useNetworkMode();
  const points: Point[] = useMemo(() => JSON.parse(track), [track]);
  const shape = useMemo(() => {
    const stations = new Set(stationIndices);
    return points.flatMap((_, index) => stations.has(index) ? [] : [index]);
  }, [points, stationIndices]);
  const initialAction = shape.length ? 'move' : 'insert';
  const [draft, setDraft] = useState(() => pointDraft(initialAction, shape[0] ?? 1, points));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [session] = useState(captureReadSession);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const { action, index, lat, lng } = draft;
  const options = action === 'insert' ? points.slice(1).map((_, position) => position + 1) : shape;
  const actions: TrackAction[] = shape.length ? ['move', 'remove'] : [];
  if (points.length < 2000) actions.splice(1, 0, 'insert');
  const [oldLat, oldLng] = points[index];
  const valid = draftCoordinate(draft) !== null;
  const changed = Number(lat) !== oldLat || Number(lng) !== oldLng;
  const canSave = action === 'remove' || (valid && (action === 'insert' || changed));
  const select = (next: TrackAction, choice: number) => {
    setDraft(pointDraft(next, choice, points));
    setError('');
  };
  const selectFromMap = useCallback((choice: number, point?: Point) => {
    if (busy || offline || !session.contextCurrent()) return;
    setDraft(current => point
      ? { action: current.action, index: choice, lat: String(Number(point[0].toFixed(8))), lng: String(Number(point[1].toFixed(8))) }
      : pointDraft(current.action, choice, points));
    setError('');
  }, [busy, offline, points, session]);
  const map = useMemo(() => ({
    tripId, placeId, revision,
    ...previewTourMapLayer({ points, shape, draft, interactive: !busy && !offline, select: selectFromMap,
      pointLabel: position => t('family.previewTour.point', { number: position + 1 }),
      insertLabel: t('family.previewTour.newMapPoint'),
    }),
  }), [busy, draft, offline, placeId, points, revision, selectFromMap, shape, t, tripId]);
  usePublishPreviewTourMap(map);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offline || !canSave || pending.current || !session.contextCurrent()) return;
    const abort = new AbortController();
    pending.current = abort;
    setBusy(true);
    setError('');
    try {
      const observed = { expectedRevision: revision, pointIndex: index };
      const point = [Number(lat), Number(lng)];
      const shapeEdit = action === 'remove' ? { ...observed, action } : { ...observed, action, point };
      const { data } = await apiClient.put<{ tour: TourListItem }>(
        `/trips/${tripId}/family/tours/${placeId}/track-point`,
        action === 'move' ? { ...observed, point } : { ...shapeEdit, operationId: operationIdFor(JSON.stringify(shapeEdit)) },
        { signal: abort.signal },
      );
      if (!abort.signal.aborted && session.contextCurrent()) onSaved(data.tour);
    } catch (cause) {
      if (abort.signal.aborted || !session.contextCurrent()) return;
      setError(trackSaveError(cause, action));
    } finally {
      pending.current = null;
      if (!abort.signal.aborted) setBusy(false);
    }
  }

  return (
    <form aria-label={t('family.previewTour.editTrack')} className="flex flex-col gap-2" onSubmit={event => { void save(event); }}>
      <p className="m-0 text-sm text-content-muted">{t('family.previewTour.trackHint')}</p>
      <p className="m-0 text-sm text-content-muted">{t(MAP_HINT[action])}</p>
      <label className="flex flex-col gap-1 text-sm">
        {t('family.previewTour.trackAction')}
        <select className={FIELD} disabled={busy} value={action} onChange={event => {
          const next = event.target.value as TrackAction;
          select(next, next === 'insert' ? 1 : shape[0]);
        }}>
          {actions.map(item => <option key={item} value={item}>{t(ACTION_LABEL[item])}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t(action === 'insert' ? 'family.previewTour.chooseGap' : 'family.previewTour.choosePoint')}
        <select className={FIELD} disabled={busy} value={index} onChange={event => select(action, Number(event.target.value))}>
          {options.map(position =>
            <option key={position} value={position}>{action === 'insert'
              ? t('family.previewTour.trackGap', { from: position, to: position + 1 })
              : t('family.previewTour.point', { number: position + 1 })}</option>
          )}
        </select>
      </label>
      {action !== 'remove' && <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          {t('family.routeWaypoint.latitude')}
          <input className={FIELD} type="number" value={lat} min={-90} max={90} step="any"
            required disabled={busy} onChange={event => setDraft({ ...draft, lat: event.target.value })} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          {t('family.routeWaypoint.longitude')}
          <input className={FIELD} type="number" value={lng} min={-180} max={180} step="any"
            required disabled={busy} onChange={event => setDraft({ ...draft, lng: event.target.value })} />
        </label>
      </div>}
      {error && <p className="m-0 text-sm text-content" role="alert">{t(error)}</p>}
      <div className="flex gap-2">
        <button type="submit" className="flex-1 rounded-[10px] bg-accent px-2 py-1.5 text-sm font-semibold text-accent-text disabled:opacity-50"
          disabled={busy || offline || !canSave}>
          {t(SUBMIT_LABEL[action])}
        </button>
        <button type="button" className={FIELD} disabled={busy} onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
