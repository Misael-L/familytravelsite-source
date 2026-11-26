import type { VisitStatus } from '@trek/shared';
import type { AtlasPlace } from '../types';

export type AtlasReadSection = 'stats' | 'geography' | 'bucket' | 'regions' | 'layers';

export interface CountryDetail {
  places: AtlasPlace[];
  trips: { id: number; title: string }[];
  manually_marked?: boolean;
  status?: VisitStatus;
}
