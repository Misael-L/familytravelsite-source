// Test-only adaptation of liketrek/TREK demo-seed.ts, Barcelona scenario.
// Reference dc36c21c08f681fd2806764fad8e17b270f6f175; retain repository LICENSE.
// This never seeds a database. Distinct Family location/visit UUIDs replace native demo IDs.
export const uuid = (n) => `a0450000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const at = '2026-11-08T00:00:00Z',
  trip = uuid(1),
  family = uuid(2);
export const session = {
  userId: uuid(3),
  personId: uuid(4),
  familyId: family,
  user: { username: 'Local fixture traveler', email: 'local@example.invalid', avatar_url: null, created_at: at },
};
const names = [
  'W Barcelona',
  'Sagrada Familia',
  'Park Guell',
  'La Boqueria Market',
  'Barceloneta Beach',
  'Gothic Quarter',
  'Casa Batllo',
  'El Born & Tapas',
];
export const locations = names.map((name, i) => ({
  id: uuid(100 + i),
  trip_id: trip,
  revision: 1,
  deleted_at: null,
  source: { kind: i === 0 ? 'hotel' : i === 7 ? 'food' : 'experience', id: uuid(200 + i) },
  source_archived: false,
  name,
  description: `${name}: shared catalog description.`,
  notes: null,
  latitude: 41.38 + i / 1000,
  longitude: 2.17 + i / 1000,
  is_located: true,
  address: `${i + 1} Fixture Street, Barcelona`,
  website: null,
  phone: null,
  context_place_id: uuid(20),
  context_place_name: 'Barcelona',
  country_id: uuid(21),
  country_name: 'Spain',
  country_code: 'ES',
  time_zone: 'Europe/Madrid',
  source_type_label: i === 7 ? 'Restaurant' : i === 0 ? 'Hotel' : 'Attraction',
  cover_media_id: i === 2 ? null : uuid(300 + i),
  category: {
    id: uuid(i === 7 ? 31 : 30),
    name: i === 7 ? 'Restaurant' : 'Sightseeing',
    color: '#8b5cf6',
    icon: 'MapPin',
  },
  overrides: {},
  created_at: at,
  updated_at: at,
}));
export const days = Array.from({ length: 4 }, (_, i) => ({
  id: uuid(10 + i),
  trip_id: trip,
  civil_day: `2026-05-${21 + i}`,
  day_index: i + 1,
  revision: 1,
  title: `Barcelona day ${i + 1}`,
  updated_at: at,
}));
// Nine native demo visits plus a second restaurant visit. One genuine midnight,
// one dinner clock and otherwise unknown times; no invented midnight appointments.
const itinerary = [
  [0, 4, 7],
  [1, 6, 3],
  [2, 5],
  [4, 7],
];
export const visits = itinerary.flatMap((indexes, d) =>
  indexes.map((l, order) => {
    const midnight = d === 0 && l === 0,
      dinner = l === 7,
      clock = midnight ? '00:00' : dinner ? '19:30' : null;
    return {
      id: uuid(400 + d * 10 + order),
      trip_id: trip,
      activity: names[l],
      starts_at: clock ? `${days[d].civil_day}T${midnight ? '22:00' : '17:30'}:00Z` : null,
      ends_at: null,
      time_zone: clock ? 'Europe/Madrid' : null,
      sort_order: order,
      explanations: dinner ? `Dinner notes for day ${d + 1}` : null,
      updated_at: at,
      plan_location_id: locations[l].id,
      location: locations[l],
      timing_kind: clock ? 'timed' : 'untimed',
      trip_day_id: days[d].id,
      planning_day: days[d].civil_day,
      revision: 1,
      duration_minutes: null,
      planned_duration_minutes: null,
      start_local: clock ? `${days[d].civil_day}T${clock}:00` : null,
      end_local: null,
      deleted_at: null,
    };
  })
);
// Correct midnight instant belongs to the prior UTC day in Europe/Madrid.
visits[0].starts_at = '2026-05-20T22:00:00Z';
export const state = {
  version: 1,
  trip_id: trip,
  family_id: family,
  trip_revision: 1,
  locations,
  visits,
  days,
  notes: [
    {
      id: uuid(500),
      trip_id: trip,
      civil_day: days[1].civil_day,
      body: 'Tickets already booked for 10:00 AM slot',
      icon: 'Ticket',
      sort_order: 0,
      updated_at: at,
    },
  ],
  destinations: [],
};
export const header = {
  id: trip,
  family_id: family,
  title: 'P04as Barcelona rehearsal',
  description: null,
  start_date: days[0].civil_day,
  end_date: days[3].civil_day,
  cover_image: null,
  is_archived: 0,
  currency: 'EUR',
  reminder_days: 0,
  status: 'planned',
};
export function view(layer) {
  return {
    version: 1,
    scope: { user_id: session.userId, family_id: family, person_id: session.personId, trip_id: trip, layer },
    state,
    draft_token: layer === 'published' ? null : '0'.repeat(64),
    operations: [],
    bindings: [],
    readiness: { ready: true, blockers: [] },
  };
}
