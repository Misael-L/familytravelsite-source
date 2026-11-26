import { useStayActionScope } from './stayActionScope';

export function useStayModalScope(trip: { id: number } | null | undefined, open: boolean) {
  return useStayActionScope(trip?.id ?? 0, open ? 1 : 0);
}
export function usePhoneStayScope(tripId: number, open: boolean, payload: { accId?: number; dayId?: number }) {
  return useStayActionScope(tripId, open ? (payload.accId ?? payload.dayId ?? 0) : undefined);
}

export function phoneStayInitialRange(days: { id: number }[]) {
  return { start: days[0]?.id ?? 0, end: days[days.length - 1]?.id ?? 0 };
}
