import { useRef, useState } from 'react';
import type { TourListItem } from '@trek/shared';
import { useNetworkMode } from '../../../hooks/useNetworkMode';
import { useTranslation } from '../../../i18n';
import {
  previewTourStations, previewTourTrack, type PreviewTourSaved, type PreviewTourStation,
} from '../../../integrations/family/previewTourTrack';
import { isFamilyRoutePlanningPreview } from '../../../integrations/family/routePlanningPreview';
import { familyCanDo, useFamilyUiPermissions } from '../../../integrations/family/uiPermissions';
import { BOX } from '../../Planner/bookings/bookingParts';
import PreviewTourStationEditor from './PreviewTourStationEditor';
import PreviewTourTrackEditor from './PreviewTourTrackEditor';

function Stations({ stations }: { stations: readonly PreviewTourStation[] }) {
  const { t } = useTranslation();
  const title = t('family.previewTour.stations');
  return <section aria-label={title} className={`${BOX} p-2`}>
    <h3 className="m-0 mb-1 px-1 text-sm font-semibold text-content">{title}</h3>
    <ol className="m-0 flex list-decimal flex-col gap-1 pl-6 pr-1 text-sm text-content">
      {stations.map(station => <li key={station.key}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="min-w-0 break-words">{station.name}</span>
          <span className="whitespace-nowrap text-content-muted">
            {t('tours.durationMinutes', { count: station.stay_minutes })}
          </span>
        </div>
      </li>)}
    </ol>
  </section>;
}

export default function PreviewTourEditors({ tripId, tour, onSaved }: {
  tripId: number | string;
  tour: TourListItem;
  onSaved?: PreviewTourSaved;
}) {
  const controller = useFamilyUiPermissions(state => state.controller);
  const track = previewTourTrack(tour);
  const stations = previewTourStations(tour);
  const { place_id: placeId, revision } = tour;
  if (!isFamilyRoutePlanningPreview() || tour.tour_type !== 'walk' || !stations.length) return null;

  const editable = track && revision !== undefined && onSaved && controller?.gov.layer === 'published' &&
    controller.gov.actionOutcomes['trip.places.manage'] === 'direct' && familyCanDo('place_edit', controller);
  return <>
    {editable && <WalkEditors key={`${tripId}:${placeId}:${revision}`}
      tripId={tripId} placeId={placeId} revision={revision} track={track} stations={stations} onSaved={onSaved} />}
    <Stations stations={stations} />
  </>;
}

function WalkEditors({ tripId, placeId, track, revision, stations, onSaved }: {
  tripId: number | string;
  placeId: number;
  revision: number;
  track: string;
  stations: readonly PreviewTourStation[];
  onSaved: PreviewTourSaved;
}) {
  const { t } = useTranslation();
  const { offline } = useNetworkMode();
  const [editor, setEditor] = useState<'track' | 'station' | null>(null);
  const retry = useRef<Partial<Record<'track' | 'station', { fingerprint: string; id: string }>>>({});
  const close = () => setEditor(null);
  function operationId(edit: 'track' | 'station', fingerprint: string) {
    const last = retry.current[edit];
    if (last?.fingerprint === fingerprint) return last.id;
    const id = crypto.randomUUID();
    retry.current[edit] = { fingerprint, id };
    return id;
  }
  const field = `${BOX} flex-1 px-2 py-1.5 text-sm text-content disabled:opacity-50`;
  if (editor === 'track') return <PreviewTourTrackEditor tripId={tripId} placeId={placeId} revision={revision}
    track={track} stationIndices={stations.map(station => station.index)} onClose={close}
    operationIdFor={fingerprint => operationId('track', fingerprint)}
    onSaved={tour => { close(); onSaved(tour, 'track'); }} />;
  if (editor === 'station') return <PreviewTourStationEditor tripId={tripId} placeId={placeId} revision={revision}
    stations={stations} track={track} onClose={close} operationIdFor={fingerprint => operationId('station', fingerprint)}
    onSaved={tour => { close(); onSaved(tour, 'station'); }} />;
  return <div className="flex gap-2">
    <button type="button" className={field} disabled={offline} onClick={() => setEditor('track')}>{t('family.previewTour.editTrack')}</button>
    <button type="button" className={field} disabled={offline} onClick={() => setEditor('station')}>{t('family.previewTour.editStations')}</button>
  </div>;
}
