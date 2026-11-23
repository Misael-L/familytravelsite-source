import type { FamilyTripFile } from '../../data/supabase/tripFiles';

export type FamilyReservationDetailFile = Pick<FamilyTripFile, 'id' | 'originalName' | 'storagePath'>;

export function projectReservationDetailFiles(
  reservationId: string,
  files?: readonly FamilyTripFile[]
): FamilyReservationDetailFile[] {
  const seen = new Set<string>();
  const result: FamilyReservationDetailFile[] = [];
  for (const file of files ?? []) {
    if (file.deletedAt || seen.has(file.id)) continue;
    if (!file.links.some((link) => link.reservationId === reservationId)) continue;
    seen.add(file.id);
    result.push({
      id: file.id,
      originalName: file.originalName,
      storagePath: file.storagePath,
    });
  }
  return result;
}
