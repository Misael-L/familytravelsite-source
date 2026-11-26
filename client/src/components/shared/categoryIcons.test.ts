import { Coffee, Croissant, MapPin, ShoppingBasket, type LucideIcon } from 'lucide-react';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAssignment, buildCategory, buildDay, buildPlace, buildTrip } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { buildPlacePopupHtml as buildFamilyPopup } from '../../integrations/family/legacy/components/Map/placePopup';
import * as family from '../../integrations/family/legacy/components/shared/categoryIcons';
import {
  PLACE_CATEGORY_ICON_KEYS,
  formFromCategory,
  isAllowedPlaceCategoryIcon,
} from '../../integrations/family/legacy/pages/admin/familyPlaceCategoriesModel';
import { ICON_NAMES } from '../Admin/useCategoryAdmin';
import { categoryIconSvg } from '../Map/categoryIconSvg';
import { buildPlacePopupHtml } from '../Map/placePopup';
import { downloadTripPDF } from '../PDF/TripPDF';
import * as native from './categoryIcons';

const familyOptions = [
  ['MapPin', 'Pin'],
  ['Building2', 'Building'],
  ['BedDouble', 'Hotel'],
  ['UtensilsCrossed', 'Restaurant'],
  ['Landmark', 'Attraction'],
  ['ShoppingBag', 'Shopping'],
  ['Bus', 'Bus'],
  ['Train', 'Train'],
  ['Car', 'Car'],
  ['Plane', 'Plane'],
  ['Ship', 'Ship'],
  ['Bike', 'Bicycle'],
  ['Activity', 'Activity'],
  ['Dumbbell', 'Fitness'],
  ['Mountain', 'Mountain'],
  ['Tent', 'Camping'],
  ['Anchor', 'Harbor'],
  ['Coffee', 'Cafe'],
  ['Beer', 'Bar'],
  ['Wine', 'Wine'],
  ['Utensils', 'Food'],
  ['Camera', 'Photo'],
  ['Music', 'Music'],
  ['Theater', 'Theater'],
  ['Ticket', 'Events'],
  ['TreePine', 'Nature'],
  ['Waves', 'Beach'],
  ['Leaf', 'Green'],
  ['Flower2', 'Garden'],
  ['Sun', 'Sun'],
  ['Globe', 'World'],
  ['Compass', 'Explore'],
  ['Flag', 'Flag'],
  ['Navigation', 'Navigation'],
  ['Map', 'Map'],
  ['Church', 'Church'],
  ['Library', 'Museum'],
  ['Store', 'Market'],
  ['Home', 'Accommodation'],
  ['Cross', 'Medicine'],
  ['Heart', 'Favorite'],
  ['Star', 'Top'],
  ['CreditCard', 'Bank'],
  ['Wifi', 'Internet'],
  ['Luggage', 'Luggage'],
  ['Backpack', 'Backpack'],
  ['Zap', 'Adventure'],
] as const;
const nativeOptions = [...familyOptions, ['Croissant', 'Bakery'], ['ShoppingBasket', 'Groceries']];

afterEach(() => document.getElementById('pdf-preview-overlay')?.remove());

describe('category icon catalogs', () => {
  it('preserves the ordered keys and labels used by the native and Family pickers', () => {
    expect(Object.entries(native.ICON_LABELS)).toEqual(nativeOptions);
    expect(Object.entries(family.ICON_LABELS)).toEqual(familyOptions);
    expect(Object.keys(native.CATEGORY_ICON_MAP)).toEqual(nativeOptions.map(([key]) => key));
    expect(Object.keys(family.CATEGORY_ICON_MAP)).toEqual(familyOptions.map(([key]) => key));
    expect(ICON_NAMES).toEqual(nativeOptions.map(([key]) => key));
    expect(PLACE_CATEGORY_ICON_KEYS).toEqual(familyOptions.map(([key]) => key));
    expect(family.CATEGORY_ICON_MAP).not.toBe(native.CATEGORY_ICON_MAP);
  });

  it('keeps common saved values and native-only icons in their existing scopes', () => {
    for (const [key] of familyOptions) expect(family.getCategoryIcon(key)).toBe(native.getCategoryIcon(key));
    expect(family.getCategoryIcon('Coffee')).toBe(Coffee);
    expect(native.getCategoryIcon('Croissant')).toBe(Croissant);
    expect(native.getCategoryIcon('ShoppingBasket')).toBe(ShoppingBasket);
    const category = { id: 'category', familyId: 'family', name: 'Cafe', colorHex: '#6366f1', sortOrder: 2 };
    expect(isAllowedPlaceCategoryIcon('Coffee')).toBe(true);
    expect(formFromCategory({ ...category, iconKey: 'Coffee' }).icon).toBe('Coffee');
    for (const key of ['Croissant', 'ShoppingBasket', 'RetiredIcon']) {
      expect(isAllowedPlaceCategoryIcon(key)).toBe(false);
      expect(formFromCategory({ ...category, iconKey: key }).icon).toBe('MapPin');
      expect(family.getCategoryIcon(key)).toBe(MapPin);
    }
    for (const missing of [undefined, null, '', 'RetiredIcon']) {
      expect(native.getCategoryIcon(missing)).toBe(MapPin);
      expect(family.getCategoryIcon(missing)).toBe(MapPin);
    }
  });

  it('selects own catalog entries and uses the fallback for an inherited fixture entry', () => {
    const icons = Object.create({ InheritedFixtureIcon: Coffee }) as Record<string, LucideIcon>;
    icons.Coffee = Coffee;
    expect(native.resolveCategoryIcon(icons, 'Coffee')).toBe(Coffee);
    expect(native.resolveCategoryIcon(icons, 'InheritedFixtureIcon')).toBe(MapPin);
  });

  it('shows the expected glyph in native pins and both popup builders', () => {
    expect(categoryIconSvg('RetiredIcon', 15)).toBe(categoryIconSvg('MapPin', 15));
    expect(categoryIconSvg('Croissant', 15)).toContain('lucide-croissant');
    const popup = { ...buildPlace({ address: null }), category_name: 'Bakery' };
    expect(buildPlacePopupHtml({ ...popup, category_icon: 'Croissant' }, null)).toContain('lucide-croissant');
    expect(buildFamilyPopup({ ...popup, category_icon: 'Croissant' }, null)).toContain('lucide-map-pin');
    expect(buildPlacePopupHtml({ ...popup, category_icon: 'Coffee' }, null)).toContain('lucide-coffee');
    expect(buildFamilyPopup({ ...popup, category_icon: 'Coffee' }, null)).toContain('lucide-coffee');
  });

  it('prints the expected category thumbnail glyphs in the native PDF', async () => {
    server.use(
      http.get('/api/trips/:tripId/accommodations', () => HttpResponse.json({ accommodations: [] })),
      http.get('/api/pdf-sections/:tripId', () => HttpResponse.json({ sections: [] }))
    );
    const trip = buildTrip({ id: 4, cover_image: null });
    const day = { ...buildDay({ id: 17, trip_id: trip.id }), day_number: 1 };
    const categories = ['Coffee', 'Croissant', 'RetiredIcon'].map((icon, index) =>
      buildCategory({ id: index + 1, icon })
    );
    const places = categories.map(({ id }) =>
      buildPlace({
        id,
        trip_id: trip.id,
        category_id: id,
        lat: null,
        lng: null,
        image_url: null,
        google_place_id: null,
      })
    );
    const assignments = {
      [day.id]: places.map((place, order_index) =>
        buildAssignment({ id: place.id, day_id: day.id, place_id: place.id, place, order_index })
      ),
    };
    await downloadTripPDF({
      trip,
      days: [day],
      places,
      assignments,
      categories,
      dayNotes: [],
      reservations: [],
      t: (key) => key,
      locale: 'en-US',
    });
    const frame = document.querySelector<HTMLIFrameElement>('#pdf-preview-overlay iframe');
    if (!frame) throw new Error('Missing print preview');
    const print = new DOMParser().parseFromString(frame.srcdoc, 'text/html');
    const thumbnails = Array.from(print.querySelectorAll('.place-thumb-fallback svg'));
    expect(thumbnails.map((svg) => Array.from(svg.classList).find((name) => name.startsWith('lucide-')))).toEqual([
      'lucide-coffee',
      'lucide-croissant',
      'lucide-map-pin',
    ]);
  });
});
