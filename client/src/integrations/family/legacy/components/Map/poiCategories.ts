import { BedDouble, Camera, Coffee, Landmark, Ticket, Trees, Utensils, Wine, type LucideIcon } from 'lucide-react';

// The POI categories shown in the map "explore" pill. The `key` is the contract
// with the server (CATEGORY_OSM_FILTERS in mapsService.ts) — the OSM tag mapping
// lives there; label/icon/colour live here. `color` doubles as the active-pill
// fill AND the marker colour, so the pill and the map agree visually.
export interface PoiCategory {
  key: string;
  labelKey: string;
  Icon: LucideIcon;
  color: string;
}

const POI_PALETTE = {
  restaurant: '#EF4444',
  cafe: '#B45309',
  bar: '#A855F7',
  hotel: '#2563EB',
  sights: '#EC4899',
  museum: '#6366F1',
  nature: '#16A34A',
  activity: '#F59E0B',
} as const;

export const POI_CATEGORIES: PoiCategory[] = [
  { key: 'restaurant', labelKey: 'poi.cat.restaurants', Icon: Utensils, color: POI_PALETTE.restaurant },
  { key: 'cafe', labelKey: 'poi.cat.cafes', Icon: Coffee, color: POI_PALETTE.cafe },
  { key: 'bar', labelKey: 'poi.cat.bars', Icon: Wine, color: POI_PALETTE.bar },
  { key: 'hotel', labelKey: 'poi.cat.hotels', Icon: BedDouble, color: POI_PALETTE.hotel },
  { key: 'sights', labelKey: 'poi.cat.sights', Icon: Camera, color: POI_PALETTE.sights },
  { key: 'museum', labelKey: 'poi.cat.museums', Icon: Landmark, color: POI_PALETTE.museum },
  { key: 'nature', labelKey: 'poi.cat.nature', Icon: Trees, color: POI_PALETTE.nature },
  { key: 'activity', labelKey: 'poi.cat.activities', Icon: Ticket, color: POI_PALETTE.activity },
];

export const POI_CATEGORY_BY_KEY: Record<string, PoiCategory> = Object.fromEntries(
  POI_CATEGORIES.map((c) => [c.key, c])
);

/** CATEGORY_ICON_MAP keys for the shared trip-place hover overlay. */
const POI_HOVER_ICON: Record<string, string> = {
  restaurant: 'Utensils',
  cafe: 'Coffee',
  bar: 'Wine',
  hotel: 'BedDouble',
  sights: 'Camera',
  museum: 'Landmark',
  nature: 'TreePine',
  activity: 'Ticket',
};

/** Map an Explore POI onto the TREK trip-place hover tooltip DTO. */
export function poiToHoverCard(poi: Poi): {
  name: string;
  address: string | null;
  category_name: string;
  category_color: string;
  category_icon: string;
} {
  const cat = POI_CATEGORY_BY_KEY[poi.category];
  return {
    name: poi.name,
    address: poi.address,
    category_name: poi.poi_type?.trim() || poi.category,
    category_color: cat?.color ?? '#6b7280',
    category_icon: POI_HOVER_ICON[poi.category] ?? 'MapPin',
  };
}

// One POI result from /api/maps/pois (mirror of the server's OverpassPoi).
export interface Poi {
  osm_id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  poi_type: string;
  address: string | null;
  website: string | null;
  phone: string | null;
  opening_hours: string | null;
  cuisine: string | null;
  source: 'openstreetmap' | 'catalog';
}
