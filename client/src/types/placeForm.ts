import type { PlaceFieldOrigins, RoadtripStopType } from '@trek/shared';

export interface PlaceFormData {
  name: string;
  description: string;
  address: string;
  lat: string;
  lng: string;
  category_id: string;
  place_time: string;
  end_time: string;
  notes: string;
  transport_mode: string;
  website: string;
  // Populated from a maps-search pick, and typed in by hand since #2472.
  phone?: string;
  // Typed in by hand (#2472). Absent from DEFAULT_FORM like phone: the mobile sheet
  // shares this type and never sets them, and a missing key writes nothing.
  email?: string;
  // The place's own hours as JSON text, seven days Monday first; '' clears them.
  opening_hours?: string;
  google_place_id?: string;
  google_ftid?: string;
  osm_id?: string;
  amap_poi_id?: string;
  // Hero image picked from the detail column. Optional and absent from
  // DEFAULT_FORM on purpose: the mobile sheet shares this type and never sets
  // it, and places.service already writes image_url through on create/update.
  // Null drops the place's picture on save; undefined keeps it.
  image_url?: string | null;
  // Day-specific note on the in-context assignment (#2163). Only hydrated when
  // the form opened with an assignment in context; both forms drop it from the
  // submit payload when unchanged, and useTripPlanner strips it off the place
  // update and PUTs it per assignment instead.
  assignment_notes?: string;
  // What kind of stop on a drive this is, if any (#1797). Optional and absent from
  // DEFAULT_FORM for the same reason as image_url: a missing key writes nothing, and a
  // place created outside a road trip has no opinion about fuel stops.
  stop_type?: RoadtripStopType | null;
  // Offered only while creating, and only alongside a stop_type: the corridor popup
  // suggests how long that kind of pause usually takes, and the full form should not
  // throw the suggestion away on the way through. Editing a stay is the rail's job.
  duration_minutes?: number;
  // Which shareable fields the user typed and which a pick or the details column filled
  // (placeFieldOrigins.ts). Rides along to the save as `fieldOrigins`; never shown.
  fieldOrigins?: PlaceFieldOrigins;
}

// The submit payload mirrors the form, but lat/lng are parsed to numbers and
// category_id is normalised, plus any files chosen before the place existed.
export interface PlaceSubmitData extends Omit<PlaceFormData, 'lat' | 'lng' | 'category_id'> {
  lat: number | null;
  lng: number | null;
  category_id: string | null;
  _pendingFiles?: File[];
  /**
   * Where a road-trip service stop belongs on the drive, worked out from the
   * coordinates being saved. Travels the same way `_pendingFiles` does: the planner
   * reads it, strips it, and assigns the new place at that position.
   */
  _serviceStop?: { dayId: number; position: number; offRouteKm: number } | null;
}
