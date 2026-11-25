import type { FamilyAirportPick } from './FamilyAirportSelect';

export type FlightWaypoint = {
  airport: FamilyAirportPick | null;
  arrDayId: string;
  arrTime: string;
  depDayId: string;
  depTime: string;
  airline: string;
  flightNumber: string;
  seat: string;
};

export type StationWaypoint = {
  name: string;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  arrDayId: string;
  arrTime: string;
  depDayId: string;
  depTime: string;
  trainNumber: string;
  platform: string;
  seat: string;
};

export function emptyFlight(dayId = ''): FlightWaypoint {
  return {
    airport: null,
    arrDayId: dayId,
    arrTime: '',
    depDayId: dayId,
    depTime: '',
    airline: '',
    flightNumber: '',
    seat: '',
  };
}

export function emptyStation(dayId = ''): StationWaypoint {
  return {
    name: '',
    placeId: null,
    latitude: null,
    longitude: null,
    arrDayId: dayId,
    arrTime: '',
    depDayId: dayId,
    depTime: '',
    trainNumber: '',
    platform: '',
    seat: '',
  };
}

export function asDayId(v: string | number): string {
  return String(v);
}
