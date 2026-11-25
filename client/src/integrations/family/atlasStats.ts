import { continentForCountry } from '@trek/shared';
import { FamilyApiError } from './errors';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';

function invalid(): never {
  throw new FamilyApiError(502, 'family_atlas_incomplete', 'Travel statistics could not be read completely.');
}

function count(value: unknown): number {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return invalid();
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) return invalid();
  return result;
}

/** Completed-travel totals and explicit Family visit marks, not per-country Trip counts. */
export async function fetchFamilyAtlasStats(familyId: string) {
  const client = getSupabaseBrowserClient();
  const [totals, marks] = await Promise.all([
    client
      .from('family_travel_stats')
      .select('total_trips,total_days,total_places')
      .eq('family_id', familyId)
      .maybeSingle(),
    client.from('family_country_visited').select('country_id').eq('family_id', familyId),
  ]);
  if (totals.error) throw totals.error;
  if (marks.error) throw marks.error;
  if (!Array.isArray(marks.data) || totals.data === undefined) return invalid();
  const ids = [
    ...new Set(
      marks.data.map((row) => {
        if (typeof row.country_id !== 'string' || !row.country_id) return invalid();
        return row.country_id;
      })
    ),
  ];
  let codes: string[] = [];
  if (ids.length) {
    const countries = await client.from('countries').select('id,iso2').in('id', ids);
    if (countries.error) throw countries.error;
    if (!Array.isArray(countries.data) || countries.data.length !== ids.length) return invalid();
    const found = new Set<string>();
    codes = countries.data
      .map((row) => {
        if (!ids.includes(row.id) || found.has(row.id) || typeof row.iso2 !== 'string') return invalid();
        found.add(row.id);
        const code = row.iso2.trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) return invalid();
        return code;
      })
      .sort();
    if (new Set(codes).size !== codes.length) return invalid();
  }
  // The canonical view groups completed, unarchived Trips by Family. No group is a genuine zero.
  const row = totals.data;
  const continents: Record<string, number> = {};
  for (const code of codes) {
    const continent = continentForCountry(code);
    if (continent) continents[continent] = (continents[continent] ?? 0) + 1;
  }
  return {
    countries: codes.map((code) => ({ code, status: 'visited' as const })),
    stats: {
      totalTrips: row === null ? 0 : count(row.total_trips),
      totalPlaces: row === null ? 0 : count(row.total_places),
      totalDays: row === null ? 0 : count(row.total_days),
      totalCountries: codes.length,
    },
    continents,
  };
}
