import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import type { TourListItem } from '@trek/shared';
import { apiClient } from '../../../api/client';
import { useNetworkMode } from '../../../hooks/useNetworkMode';
import { useTranslation } from '../../../i18n';
import type { PreviewTourStation } from '../../../integrations/family/previewTourTrack';
import { captureReadSession } from '../../../sync/readSession';
import { BOX } from '../../Planner/bookings/bookingParts';
import { usePublishPreviewTourMap } from './PreviewTourMapContext';
import type { TrackCoordinate } from './previewTourMapDraft';
import { parseStay } from './stationModel';

const FIELD = `${BOX} min-w-0 px-2 py-1.5 text-sm text-content disabled:opacity-50`;
const ACTION_LABEL = {
  edit: 'family.previewTour.editStation',
  add: 'family.previewTour.addStation',
  move: 'family.previewTour.moveStation',
  remove: 'family.previewTour.removeStation',
} as const;
type StationAction = keyof typeof ACTION_LABEL;
type StationOption = { id: string; index: number; number: number; name: string; stay: number };
type StationDraft = { id: string; name: string; stay: string };

function stationOptions(points: TrackCoordinate[], stations: readonly PreviewTourStation[]) {
  const edit = stations.map((station, index): StationOption => ({
    id: station.key, index: station.index, number: index + 1, name: station.name, stay: station.stay_minutes,
  }));
  const occupied = new Set(stations.map(station => station.index));
  const destinations: StationOption[] = [];
  for (let index = 1; index < points.length - 1; index++) {
    if (!occupied.has(index)) destinations.push({ id: String(index), index, number: index + 1, name: '', stay: 0 });
  }
  const interior = edit.slice(1, -1);
  const choices = {
    edit,
    add: stations.length < 100 ? destinations : [],
    remove: interior,
    move: destinations.length > 0 ? interior : [],
  };
  return { choices, destinations };
}

function stationFields(option: StationOption): StationDraft {
  return { id: option.id, name: option.name, stay: String(option.stay) };
}

function stationChange(action: StationAction, selected: StationOption | undefined, draft: StationDraft, destination?: StationOption) {
  if (!selected) return null;
  if (action === 'remove') return { action, stationKey: selected.id };
  if (action === 'move') return destination ? { action, stationKey: selected.id, pointIndex: destination.index } : null;
  const name = draft.name.trim();
  const stayMinutes = parseStay(draft.stay);
  if (!name || name.length > 255 || stayMinutes == null) return null;
  if (action === 'add') return { action, pointIndex: selected.index, name, stayMinutes };
  return name !== selected.name || stayMinutes !== selected.stay ? { stationKey: selected.id, name, stayMinutes } : null;
}

function stationSaveError(cause: unknown, action: StationAction) {
  const problem = isAxiosError<{ code?: string }>(cause) ? cause.response : undefined;
  if (problem?.data?.code === 'tour_station_conflict') return 'family.previewTour.stationConflict';
  if (problem?.status === 409) return 'family.previewTour.trackContextChanged';
  if (problem?.status === 400)
    return action === 'edit' ? 'family.previewTour.stationInvalid' : 'family.previewTour.stationSelectionInvalid';
  return 'family.previewTour.stationFailed';
}

export default function PreviewTourStationEditor({ tripId, placeId, revision, stations, track, operationIdFor, onSaved, onClose }: {
  tripId: number | string;
  placeId: number;
  revision: number;
  stations: readonly PreviewTourStation[];
  track: string;
  operationIdFor: (fingerprint: string) => string;
  onSaved: (tour: TourListItem) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { offline } = useNetworkMode();
  const actionField = useId();
  const points: TrackCoordinate[] = useMemo(() => JSON.parse(track), [track]);
  const { choices: options, destinations } = useMemo(() => stationOptions(points, stations), [points, stations]);
  const [action, setAction] = useState<StationAction>('edit');
  const [session] = useState(captureReadSession);
  const [draft, setDraft] = useState(() => stationFields(options.edit[0]));
  const [destinationId, setDestinationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const choices = options[action];
  const selected = choices.find(option => option.id === draft.id);
  const destination = destinations.find(option => option.id === destinationId);
  const change = stationChange(action, selected, draft, destination);
  const locked = busy || offline;
  const choose = useCallback((id: string) => {
    if (locked || !session.contextCurrent()) return;
    const option = choices.find(item => item.id === id);
    if (!option) return;
    setDraft(current => action === 'add' ? { ...current, id } : stationFields(option));
    if (action === 'move') setDestinationId('');
    setError('');
  }, [action, choices, locked, session]);
  const chooseDestination = useCallback((id: string) => {
    if (locked || !session.contextCurrent()) return;
    if (id && !destinations.some(option => option.id === id)) return;
    setDestinationId(id);
    setError('');
  }, [destinations, locked, session]);
  const map = useMemo(() => {
    if (action === 'edit') return null;
    const moving = action === 'move';
    const markers = (moving ? destinations : choices).map(option => ({
      id: option.id, lat: points[option.index][0], lng: points[option.index][1],
      name: option.name || t('family.previewTour.point', { number: option.number }),
      label: String(option.number),
    }));
    if (moving && selected) {
      const [lat, lng] = points[selected.index];
      markers.push({ id: 'current-station', lat, lng, label: '•',
        name: t('family.previewTour.currentStation', { name: selected.name }) });
    }
    return { tripId, placeId, revision, line: points, plannerWaypoints: markers,
      selectedPlannerWaypointId: moving ? destinationId : draft.id,
      onPlannerWaypointClick: locked ? undefined : moving ? chooseDestination : choose };
  }, [action, choices, choose, chooseDestination, destinationId, destinations, draft.id, locked, placeId, points, revision, selected, t, tripId]);
  usePublishPreviewTourMap(map);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offline || !change || pending.current || !session.contextCurrent()) return;
    const abort = new AbortController();
    pending.current = abort;
    setBusy(true);
    setError('');
    const command = { expectedRevision: revision, ...change };
    try {
      const { data } = await apiClient.put<{ tour: TourListItem }>(
        `/trips/${tripId}/family/tours/${placeId}/station`,
        { ...command, operationId: operationIdFor(JSON.stringify(command)) }, { signal: abort.signal },
      );
      if (!abort.signal.aborted && session.contextCurrent()) onSaved(data.tour);
    } catch (cause) {
      if (!abort.signal.aborted && session.contextCurrent()) setError(stationSaveError(cause, action));
    } finally {
      pending.current = null;
      if (!abort.signal.aborted) setBusy(false);
    }
  }

  return <form aria-label={t('family.previewTour.editStations')} className="flex flex-col gap-2"
    onSubmit={event => { void save(event); }}>
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={actionField}>{t('family.previewTour.stationAction')}</label>
      <select id={actionField} className={FIELD} disabled={busy} value={action} onChange={event => {
        const next = event.target.value as StationAction;
        const target = options[next]?.[0];
        if (!target) return;
        setAction(next);
        setDraft(stationFields(target));
        setDestinationId('');
        setError('');
      }}>
        {(Object.keys(ACTION_LABEL) as StationAction[]).filter(option => options[option].length > 0).map(option =>
          <option key={option} value={option}>{t(ACTION_LABEL[option])}</option>)}
      </select>
    </div>
    <StationChoiceField label={t(action === 'add' ? 'family.previewTour.choosePoint' : 'family.previewTour.station')}
      choices={choices} value={draft.id} disabled={locked} onChange={choose} />
    {action === 'move' && <StationChoiceField label={t('family.previewTour.stationDestination')}
      choices={destinations} value={destinationId} disabled={locked} onChange={chooseDestination}
      placeholder={t('family.previewTour.chooseStationDestination')} />}
    {action === 'remove' && <p className="m-0 text-sm text-content-muted">{t('family.previewTour.removeStationHint')}</p>}
    {(action === 'edit' || action === 'add') && <StationDetails draft={draft} disabled={busy} onChange={setDraft} />}
    {error && <p className="m-0 text-sm text-content" role="alert">{t(error)}</p>}
    <div className="flex gap-2">
      <button type="submit" className="flex-1 rounded-[10px] bg-accent px-2 py-1.5 text-sm font-semibold text-accent-text disabled:opacity-50"
        disabled={busy || offline || !change}>{t(action === 'edit' ? 'family.previewTour.saveStation' : ACTION_LABEL[action])}</button>
      <button type="button" className={FIELD} disabled={busy} onClick={onClose}>{t('common.cancel')}</button>
    </div>
  </form>;
}

function StationChoiceField({ label, choices, value, disabled, onChange, placeholder }: {
  label: string;
  choices: readonly StationOption[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  return <div className="flex flex-col gap-1 text-sm">
    <label htmlFor={id}>{label}</label>
    <select id={id} className={FIELD} disabled={disabled} value={value} onChange={event => onChange(event.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {choices.map(option => <option key={option.id} value={option.id}>{option.name
        ? `${option.number}. ${option.name}`
        : t('family.previewTour.point', { number: option.number })}</option>)}
    </select>
  </div>;
}

function StationDetails({ draft, disabled, onChange }: {
  draft: StationDraft;
  disabled: boolean;
  onChange: (draft: StationDraft) => void;
}) {
  const { t } = useTranslation();
  return <>
    <label className="flex flex-col gap-1 text-sm">
      {t('family.previewTour.stationName')}
      <input className={FIELD} disabled={disabled} required maxLength={255} value={draft.name}
        onChange={event => onChange({ ...draft, name: event.target.value })} />
    </label>
    <label className="flex flex-col gap-1 text-sm">
      {t('family.previewTour.stationStay')}
      <input className={FIELD} disabled={disabled} required type="number" min={0} max={1440} step={1} value={draft.stay}
        onChange={event => onChange({ ...draft, stay: event.target.value })} />
    </label>
  </>;
}
