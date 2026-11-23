import { describe, expect, it } from 'vitest';
import { FamilyIdentityRegistry } from './identity';
import type { FamilyScheduleItem } from './legacy/data/supabase/scheduleItems';
import type { FamilyTripDay } from './legacy/data/supabase/tripDays';
import type { FamilyTripPlace } from './legacy/data/supabase/tripPlaces';
import type { FamilyTransportReservation } from './legacy/data/supabase/tripReservations';
import { FamilyViews } from './views';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const ids = () => new FamilyIdentityRegistry(uuid(1));
const day: FamilyTripDay = {
  id: uuid(3),
  tripId: uuid(2),
  civilDay: '2026-08-13',
  dayIndex: 0,
  title: 'Rome',
};
const place: FamilyTripPlace = {
  id: uuid(4),
  name: 'Rome',
  lat: 41.9,
  lng: 12.5,
  notes: null,
  timeZone: 'Europe/Rome',
  countryId: null,
  placeTypeId: null,
  isPrimary: true,
  imageUrl: null,
  familyPlaceCategoryId: null,
  familyPlaceCategoryName: null,
  familyPlaceCategoryColor: null,
  familyPlaceCategoryIcon: null,
};
const visit: FamilyScheduleItem = {
  id: uuid(5),
  tripId: uuid(2),
  activity: 'Visit',
  placeId: uuid(4),
  startsAt: '2026-08-13T02:00:00.000Z',
  endsAt: null,
  address: null,
  timeZone: 'America/Mexico_City',
  sortOrder: 0,
  experienceId: null,
  foodId: null,
  linkUrl: null,
};
describe('complete TREK frontend Family view boundary', () => {
  it('keeps canonical UUIDs and repeat occurrences while producing upstream view keys', () => {
    const v = new FamilyViews(ids());
    const result = v.days([day], [visit, { ...visit, id: uuid(6), sortOrder: 1 }], [], [place]);
    expect(result[0].assignments).toHaveLength(2);
    const [a, b] = result[0].assignments!;
    expect(a.place_id).toBe(b.place_id);
    expect(a.id).not.toBe(b.id);
    expect(v.ids.uuid('assignment', a.id)).toBe(visit.id);
    expect(v.ids.uuid('place', a.place_id)).toBe(place.id);
    expect(result[0].date).toBe('2026-08-13');
    expect(a.assignment_time).toBe('02:00');
    expect(visit.startsAt).toBe('2026-08-13T02:00:00.000Z');
  });
  it('leaves assignment anchors untimed and standalone activities without a fake Place identity', () => {
    const v = new FamilyViews(ids());
    const a = v.assignment({ ...visit, placeId: null, startsAt: '2026-08-13T00:00:00.000Z' }, day, []);
    expect(a.assignment_time).toBeNull();
    expect(a.place_id).toBe(0);
    expect(() => v.ids.uuid('place', 0)).toThrow();
  });
  it('preserves every recorded transport endpoint field, including midnight and nullable coordinates', () => {
    const row: FamilyTransportReservation = {
      id: uuid(7),
      tripId: uuid(2),
      title: 'Night flight',
      type: 'flight',
      status: 'confirmed',
      startTripDayId: day.id,
      endTripDayId: day.id,
      startsAt: '2026-08-13T21:00:00.000Z',
      endsAt: null,
      confirmationCode: null,
      notes: null,
      url: null,
      metadata: {},
      sortOrder: 2,
      createdAt: '2026-01-01',
      legs: [],
      endpoints: [
        {
          id: uuid(8),
          role: 'to',
          sequence: 2,
          name: 'Rome',
          code: 'FCO',
          airportId: null,
          placeId: null,
          latitude: null,
          longitude: null,
          timeZone: 'Europe/Rome',
          localDate: '2026-08-13',
          localTime: '00:00',
        },
      ],
    };
    const v = new FamilyViews(ids());
    const r = v.reservation(row);
    const endpoint = r.endpoints?.[0];
    expect(endpoint).toMatchObject({
      role: 'to',
      sequence: 2,
      local_time: '00:00',
      local_date: '2026-08-13',
      timezone: 'Europe/Rome',
      lat: null,
      lng: null,
    });
    if (!endpoint || endpoint.id == null) throw new Error('missing endpoint');
    expect(v.ids.uuid('endpoint', endpoint.id)).toBe(uuid(8));
    expect(r.reservation_time).toBe(row.startsAt);
  });
  it('does not invent a trip creator, grant ownership, or persist a signed file URL', () => {
    const v = new FamilyViews(ids());
    const trip = v.trip({
      id: uuid(2),
      family_id: uuid(10),
      title: 'Trip',
      description: null,
      start_date: null,
      end_date: null,
      cover_image: null,
      is_archived: 0,
      currency: 'EUR',
      reminder_days: 7,
      status: 'planned',
    });
    expect(trip).not.toHaveProperty('user_id');
    expect(trip.is_owner).toBe(0);
    const file = v.file({
      id: uuid(11),
      tripId: uuid(2),
      storagePath: 'private/path.pdf',
      originalName: 'Ticket.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12,
      uploadedBy: null,
      starred: false,
      description: null,
      deletedAt: null,
      createdAt: '2026-01-01',
      links: [],
      signedUrl: 'https://fixture.invalid/expired',
    });
    expect(file.url).toMatch(/^\/api\/family\/files\/\d+\/open$/);
    expect(JSON.stringify(file)).not.toContain('expired');
  });
});
