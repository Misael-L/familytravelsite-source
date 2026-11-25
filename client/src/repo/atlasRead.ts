import apiClient from '../api/client';
import type { AtlasReadSection, CountryDetail } from '../types/atlasRead';

const paths: Record<AtlasReadSection, string> = {
  stats: '/addons/atlas/stats',
  geography: '/addons/atlas/countries/geo',
  bucket: '/addons/atlas/bucket-list',
  regions: '/addons/atlas/regions',
  layers: '/atlas-layers',
};

/**
 * Atlas aggregate/detail reads are online-only. Do not manufacture cached or
 * empty success for unavailable facts. The caller owns current actor/source
 * publication and section validation; the transport retains its Auth guards.
 */
export function readAtlasSection(section: AtlasReadSection, signal: AbortSignal) {
  return apiClient.get<unknown>(paths[section], {
    signal,
    ...(section === 'geography' ? { timeout: 30000 } : {}),
  });
}

export function readAtlasCountry(code: string) {
  return apiClient.get<CountryDetail>(`/addons/atlas/country/${code}`);
}
