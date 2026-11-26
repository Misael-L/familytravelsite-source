import { isCivilDate } from '@family/backend/lib/civilDate';
import type { CreateTripProposalInput } from './legacy/data/supabase/tripProposals';

export type FlexibleTripProposalArgs = {
  p_family_id: string; p_title: string; p_notes: string | null;
  p_start_date: string | null; p_end_date: string | null; p_day_count: number;
  p_country_ids: string[]; p_place_ids: string[]; p_traveler_person_ids: string[];
  p_primary_country_id: string; p_occasion: CreateTripProposalInput['occasion'];
  p_cover_url: string | null; p_reminder_days: number; p_currency_code: string | null;
};
export function flexibleProposalCalendar(startDate: string, endDate: string, count: number) {
  const start = startDate.trim() || null, end = endDate.trim() || null;
  if ((start && !isCivilDate(start)) || (end && !isCivilDate(end)) || (start && end && end < start)) return null;
  if (!(start && end) && (!Number.isInteger(count) || count < 1 || count > 3660)) return null;
  const days = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1 : count;
  if (days < 1 || days > 3660) return null;
  if (start || end) {
    const first = Date.parse((start ?? end) + 'T00:00:00Z') - (start ? 0 : (days - 1) * 86400000);
    const last = first + (days - 1) * 86400000;
    if (new Date(first).getUTCFullYear() < 1 || new Date(last).getUTCFullYear() > 9999) return null;
  }
  return { start, end, days };
}
export function buildFlexibleTripProposal(input: CreateTripProposalInput & { currencyCode: string | null }) {
  const calendar = flexibleProposalCalendar(input.startDate, input.endDate, input.dayCount);
  if (!input.title.trim()) return { ok: false, error: 'title' } as const;
  if (!calendar) return { ok: false, error: 'dates' } as const;
  if (!input.countryIds.length) return { ok: false, error: 'countries' } as const;
  const args: FlexibleTripProposalArgs = {
    p_family_id: input.familyId, p_title: input.title.trim(), p_notes: input.notes?.trim() || null,
    p_start_date: calendar.start, p_end_date: calendar.end, p_day_count: calendar.days,
    p_country_ids: input.countryIds, p_place_ids: input.placeIds, p_traveler_person_ids: input.travelerPersonIds,
    p_primary_country_id: input.primaryCountryId || input.countryIds[0], p_occasion: input.occasion,
    p_cover_url: input.coverUrl, p_reminder_days: input.reminderDays, p_currency_code: input.currencyCode,
  };
  return { ok: true, args } as const;
}
