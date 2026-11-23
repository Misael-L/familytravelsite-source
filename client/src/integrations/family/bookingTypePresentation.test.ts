import { FileText } from 'lucide-react';
import { expect, it } from 'vitest';
import {
  BOOKING_TYPE_COLOR,
  TRANSPORT_TYPE_COLOR,
  TYPE_ORDER,
  typeInfo as nativeTypeInfo,
} from '../../components/Planner/bookings/bookingsModel';
import {
  BOOKING_TYPE_COLOR as legacyBookingColors,
  TRANSPORT_TYPE_COLOR as legacyTransportColors,
  typeInfo as legacyTypeInfo,
} from './legacy/components/Planner/bookings/bookingTypePresentation';

it('keeps the palettes used by phone transport and booking tabs', () => {
  expect(legacyTransportColors).toEqual(TRANSPORT_TYPE_COLOR);
  expect(legacyBookingColors).toEqual(BOOKING_TYPE_COLOR);
});

it.each(TYPE_ORDER)('shares the existing %s icon, labels and color', (type) => {
  const native = nativeTypeInfo(type);
  const legacy = legacyTypeInfo(type);
  expect(legacy).toEqual(native);
  expect(native.Icon).toBeDefined();
  expect(native.labelKey).toBe(`reservations.type.${type}`);
  expect(native.chipKey).toBe(type === 'transit' ? 'reservations.typeShort.transit' : native.labelKey);
});

it.each(['spaceship', '', 'constructor', '__proto__', 'toString'])(
  'shows the Other icon, labels and color for the unsupported type %j',
  (type) => {
    const other = {
      Icon: FileText,
      labelKey: 'reservations.type.other',
      chipKey: 'reservations.type.other',
      color: '#6b7280',
    };
    expect([nativeTypeInfo(type), legacyTypeInfo(type)]).toEqual([other, other]);
  }
);
