import type { PlannedTransitLeg } from '../../components/Planner/transitLeg';
import { transportPlannerActionsAvailable } from '../../integrations/family/uiPermissions';
import type { Reservation } from '../../types';

type TransitPoint = { name: string; lat: number; lng: number } | null;

/** The planner state the transport editor opens from. usePlannerDialogs owns it. */
export interface TransportEditorSetters {
  setEditingTransport: (r: Reservation | null) => void;
  setTransportModalDayId: (dayId: number | null) => void;
  setTransportModalAutomated: (automated: boolean) => void;
  setTransitPrefill: (prefill: { from?: TransitPoint; to?: TransitPoint; time?: string | null } | null) => void;
  setTransitJourney: (r: Reservation | null) => void;
  setShowTransportModal: (open: boolean) => void;
}

/** Shared launchers for the day panel and its drawer. */
export function dayPlanTransportActions(
  setters: Omit<TransportEditorSetters, 'setTransitJourney'>,
  { canEdit, tripHasDates }: { canEdit: boolean; tripHasDates: boolean },
  onOpen?: () => void
) {
  if (!canEdit) return {};
  const openNew = (dayId: number, automated: boolean, prefill: Parameters<typeof setters.setTransitPrefill>[0]) => {
    setters.setTransportModalDayId(dayId);
    setters.setEditingTransport(null);
    setters.setTransitPrefill(prefill);
    setters.setTransportModalAutomated(automated);
    setters.setShowTransportModal(true);
    onOpen?.();
  };
  return {
    onAddTransport: (dayId: number) => openNew(dayId, false, null),
    onPlanTransit: tripHasDates ? (dayId: number) => openNew(dayId, true, null) : undefined,
    onPlanTransitLeg: tripHasDates ? ({ dayId, ...leg }: PlannedTransitLeg) => openNew(dayId, true, leg) : undefined,
    onEditTransport: (reservation: Reservation) => {
      setters.setEditingTransport(reservation);
      setters.setTransportModalDayId(reservation.day_id ?? null);
      setters.setShowTransportModal(true);
      onOpen?.();
    },
  };
}

/**
 * The store copy of a journey held in planner state. A save or a socket update may
 * have replaced the entry since the journey view opened; without a match the held
 * copy is the best there is.
 */
export function latestReservation(reservations: Reservation[], r: Reservation): Reservation {
  return reservations.find((x) => x.id === r.id) ?? r;
}

/**
 * The full transport editor on a saved entry. For a transit journey that is where
 * travellers, costs, files, code and status live; an unchanged-endpoints save keeps
 * the stored itinerary (#2148).
 */
export function openTransportEditorWith(setters: TransportEditorSetters, r: Reservation): void {
  if (!transportPlannerActionsAvailable()) return;
  setters.setEditingTransport(r);
  setters.setTransportModalDayId(r.day_id ?? null);
  setters.setTransportModalAutomated(false);
  setters.setTransitPrefill(null);
  setters.setTransitJourney(null);
  setters.setShowTransportModal(true);
}

/**
 * Re-enters the transit search seeded with a journey's route; the journey is
 * REPLACED on save (editingTransport drives handleSaveTransport's update path).
 */
export function changeTransitRouteWith(setters: TransportEditorSetters, r: Reservation): void {
  if (!transportPlannerActionsAvailable()) return;
  const eps = r.endpoints || [];
  const from = eps.find((e) => e.role === 'from');
  const to = eps.find((e) => e.role === 'to');
  setters.setTransitPrefill({
    from: from ? { name: from.name, lat: from.lat, lng: from.lng } : null,
    to: to ? { name: to.name, lat: to.lat, lng: to.lng } : null,
  });
  setters.setEditingTransport(r);
  setters.setTransportModalDayId(r.day_id ?? null);
  setters.setTransportModalAutomated(true);
  setters.setTransitJourney(null);
  setters.setShowTransportModal(true);
}
