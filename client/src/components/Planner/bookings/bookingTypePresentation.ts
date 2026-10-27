// Presentation copied from TREK d4da05b. Family controllers retain data and focus ownership.
import {
  Plane, Hotel, Utensils, Train, Car, Ship, Bus, Sailboat, CableCar, Bike, CarTaxiFront, Route, Ticket, FileText,
  TramFront, Users, ParkingSquare, type LucideIcon,
} from 'lucide-react'
export interface ReservationTypeInfo {
  Icon: LucideIcon
  labelKey: string
  /** The name on a chip or pill, shorter where the full one would crowd a card's head. */
  chipKey: string
  color: string
}

/** Type-chip accent per transport type, the same on the desktop and the phone. */
export const TRANSPORT_TYPE_COLOR: Record<string, string> = {
  flight: '#3b82f6',
  train: '#06b6d4',
  bus: '#059669',
  car: '#6b7280',
  taxi: '#ca8a04',
  bicycle: '#84cc16',
  cruise: '#0ea5e9',
  ferry: '#0d9488',
  cable_car: '#dc2626',
  transit: '#7c3aed',
  transport_other: '#6b7280',
}

/** Type-chip accent per booking type (hotel, restaurant, event, tour, parking, other). */
export const BOOKING_TYPE_COLOR: Record<string, string> = {
  hotel: '#8b5cf6',
  restaurant: '#ef4444',
  event: '#f59e0b',
  tour: '#10b981',
  parking: '#2563eb',
  other: '#6b7280',
}

// Icons and label keys for every reservation type. The colours above are shared with
// the phone's tabs so the two shells can never drift apart on what a flight looks like.
const TYPES: Record<string, { Icon: LucideIcon; chipKey?: string }> = {
  flight: { Icon: Plane }, train: { Icon: Train }, bus: { Icon: Bus }, car: { Icon: Car },
  taxi: { Icon: CarTaxiFront }, bicycle: { Icon: Bike }, cruise: { Icon: Ship }, ferry: { Icon: Sailboat }, cable_car: { Icon: CableCar },
  transit: { Icon: TramFront, chipKey: 'reservations.typeShort.transit' }, transport_other: { Icon: Route },
  hotel: { Icon: Hotel }, restaurant: { Icon: Utensils }, event: { Icon: Ticket }, tour: { Icon: Users },
  parking: { Icon: ParkingSquare }, other: { Icon: FileText },
}

export function typeInfo(type: string): ReservationTypeInfo {
  const known = TYPES[type] ? type : 'other'
  return {
    Icon: TYPES[known].Icon,
    labelKey: `reservations.type.${known}`,
    chipKey: TYPES[known].chipKey ?? `reservations.type.${known}`,
    color: TRANSPORT_TYPE_COLOR[known] || BOOKING_TYPE_COLOR[known] || '#6b7280', // theme-lint-disable: fallback type colour, as on the phone
  }
}
