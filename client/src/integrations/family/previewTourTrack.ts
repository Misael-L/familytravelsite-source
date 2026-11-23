import type { TourListItem } from '@trek/shared';
import type { Place } from '../../types';

export type PreviewTourStation = { key: string; name: string; index: number; stay_minutes: number };
export type PreviewTourSaved = (tour: TourListItem, edit: 'track' | 'station') => void;

export function previewTourStations(tour: TourListItem): readonly PreviewTourStation[] {
  return 'previewStations' in tour && Array.isArray(tour.previewStations) ? tour.previewStations : [];
}

export function previewTourTrack(tour: TourListItem): string | undefined {
  return 'previewTrack' in tour && typeof tour.previewTrack === 'string' ? tour.previewTrack : undefined;
}

export function withPreviewTourTracks(places: Place[], tours: TourListItem[]): Place[] {
  const tracks = new Map<number, string>();
  for (const tour of tours) {
    const track = previewTourTrack(tour);
    if (track) tracks.set(tour.place_id, track);
  }
  if (!tracks.size) return places;
  return places.map(place => {
    const track = tracks.get(place.id);
    return track ? { ...place, route_geometry: track } : place;
  });
}
