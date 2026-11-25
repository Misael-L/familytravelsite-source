import type { FamilyTransportLegDraft, FamilyTransportReservation } from './legacy/data/supabase/tripReservations';
/** TREK keeps segment fields in metadata; Family keeps them on its existing leg rows. */
export function transportLegDrafts(
  meta: Record<string, unknown>,
  old: FamilyTransportReservation | undefined,
  type: string
): FamilyTransportLegDraft[] {
  const rows = Array.isArray(meta.legs)
    ? (meta.legs.filter((row) => row && typeof row === 'object') as Record<string, unknown>[])
    : null;
  const leg = (data: Record<string, unknown>, index: number): FamilyTransportLegDraft => {
    const before = old?.legs[index];
    const value = (name: string, fallback: string | null | undefined) =>
      typeof data[name] === 'string' ? (data[name] as string) : (fallback ?? '');
    return {
      carrierName: value('airline', before?.carrierName),
      serviceNumber: value(type === 'flight' ? 'flight_number' : 'train_number', before?.serviceNumber),
      platform: value('platform', before?.platform),
      seat: value('seat', before?.seat),
    };
  };
  if (rows) return rows.map(leg);
  if (Object.keys(meta).some((k) => ['airline', 'flight_number', 'train_number', 'platform', 'seat'].includes(k)))
    return [
      leg(meta, 0),
      ...(old?.legs.slice(1).map((l) => ({
        carrierName: l.carrierName ?? '',
        serviceNumber: l.serviceNumber ?? '',
        platform: l.platform ?? '',
        seat: l.seat ?? '',
      })) ?? []),
    ];
  return (
    old?.legs.map((l) => ({
      carrierName: l.carrierName ?? '',
      serviceNumber: l.serviceNumber ?? '',
      platform: l.platform ?? '',
      seat: l.seat ?? '',
    })) ?? []
  );
}
