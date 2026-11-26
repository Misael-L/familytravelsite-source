// What a transport booking draws on the map, worked out once for both renderers.
//
// ReservationOverlay (Leaflet) and reservationsMapbox (GL) used to carry their own
// copy of this: which booking types count, the great-circle arcs per leg and the
// route/duration labels. The drawing itself stays in each renderer.

import { Bike, Bus, CableCar, Car, CarTaxiFront, Plane, Route, Sailboat, Ship, Train, TramFront } from 'lucide-react';
import type { Reservation, ReservationEndpoint } from '../../types';
import { orderedTransportWaypoints } from '../../utils/flightLegs';
import { haversineKm } from '../../utils/geo';
import { frameLine, frameLng, type LngFrame } from '../../utils/lngFrame';
import { geodesicArcs } from './flightGeodesy';
import { formatTransportDuration, formatTransportLabels } from './transportLabels';

export type TransportType =
  | 'flight'
  | 'train'
  | 'cruise'
  | 'car'
  | 'bus'
  | 'taxi'
  | 'bicycle'
  | 'ferry'
  | 'cable_car'
  | 'transit'
  | 'transport_other';
const TRANSPORT_TYPES: TransportType[] = [
  'flight',
  'train',
  'cruise',
  'car',
  'bus',
  'taxi',
  'bicycle',
  'ferry',
  'cable_car',
  'transit',
  'transport_other',
];

export const TRANSPORT_COLOR = '#3b82f6';

export const TRANSPORT_META: Record<TransportType, { icon: typeof Plane; geodesic: boolean }> = {
  flight: { icon: Plane, geodesic: true },
  train: { icon: Train, geodesic: false },
  cruise: { icon: Ship, geodesic: true },
  car: { icon: Car, geodesic: false },
  bus: { icon: Bus, geodesic: false },
  taxi: { icon: CarTaxiFront, geodesic: false },
  bicycle: { icon: Bike, geodesic: false },
  ferry: { icon: Sailboat, geodesic: true },
  // Valley to mountain station as the rope runs: a straight line, never a road (#2535).
  cable_car: { icon: CableCar, geodesic: false },
  transit: { icon: TramFront, geodesic: false },
  transport_other: { icon: Route, geodesic: false },
};

export interface TransportHop {
  res: Reservation;
  from: ReservationEndpoint;
  to: ReservationEndpoint;
  waypoints: ReservationEndpoint[];
  type: TransportType;
  arcs: [number, number][][];
  // Route ("VIE → LHR") and duration/distance line. Computed on every update but
  // not drawn since the stats badge was dropped; the duration helper still guards the
  // non-finite date that used to blank the trip (#1620).
  mainLabel: string | null;
  subLabel: string | null;
}

/**
 * The hop a booking draws, or null when it is no transport or has fewer than two
 * places to connect. wrapArcs says whether a great-circle arc that crosses the
 * antimeridian also gets a copy shifted by 360 degrees: Leaflet needs that, while a
 * GL map repeats features across world copies itself, so there one continuous arc
 * is enough (a shifted duplicate would sit on the wrapped copy and double the opacity).
 * `frame` is Leaflet's longitude frame (#2975): the arcs and the waypoints come back
 * drawn in it, so a pin and the line that ends at it are on the same world copy.
 */
export function transportHop(r: Reservation, wrapArcs: boolean, frame: LngFrame | null = null): TransportHop | null {
  if (!TRANSPORT_TYPES.includes(r.type as TransportType)) return null;
  const sorted = orderedTransportWaypoints(r);
  const waypoints = frame ? sorted.map((e) => ({ ...e, lng: frameLng(frame, e.lng) })) : sorted;
  if (waypoints.length < 2) return null;
  const from = waypoints[0];
  const to = waypoints[waypoints.length - 1];
  const type = r.type as TransportType;
  const isGeo = TRANSPORT_META[type].geodesic;
  // One arc per leg (between consecutive waypoints), concatenated.
  const arcs: [number, number][][] = [];
  let distanceKm = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const segArcs = isGeo
      ? geodesicArcs([a.lat, a.lng], [b.lat, b.lng], wrapArcs, frame)
      : [
          frameLine(frame, [
            [a.lat, a.lng],
            [b.lat, b.lng],
          ] as [number, number][]),
        ];
    arcs.push(...segArcs);
    distanceKm += haversineKm(a, b);
  }
  const duration = formatTransportDuration(from, to, r.reservation_time || null, r.reservation_end_time || null);
  const { mainLabel, subLabel } = formatTransportLabels(waypoints, duration, distanceKm);
  return { res: r, from, to, waypoints, type, arcs, mainLabel, subLabel };
}
