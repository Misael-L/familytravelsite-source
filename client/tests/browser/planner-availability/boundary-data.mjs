// Synthetic SDK contracts around the prior Barcelona adaptation; never seeds a DB.
import { family, locations, session, state, trip, uuid, view } from '../planner-native/demo.mjs';
export const formFields = (row) => ({
  name: row.name,
  description: row.description,
  notes: row.notes,
  address: row.address,
  website: row.website,
  phone: row.phone,
  latitude: row.latitude,
  longitude: row.longitude,
  family_place_category_id: row.category?.id ?? null,
});
export function locationContext(args) {
  const row = locations.find((l) => l.id === args.p_location_id);
  if (!row) throw new Error('Unknown synthetic location');
  const fields = formFields(row),
    layer = args.p_layer;
  return globalThis.structuredClone({
    version: 1,
    layer,
    location: row,
    published_location: row,
    observation: {
      version: 1,
      trip_id: trip,
      location_id: row.id,
      family_id: family,
      user_id: session.userId,
      person_id: session.personId,
      revision: row.revision,
      layer,
      draft: null,
      published: fields,
      shown: fields,
    },
  });
}
export function saveLocation(args) {
  const row = locations.find((l) => l.id === args.p_location_id),
    observation = args.p_observation,
    fields = args.p_form;
  if (!row || row.revision !== observation.revision || observation.layer !== 'published')
    throw new Error('Synthetic original observation mismatch');
  Object.assign(row, fields, { revision: row.revision + 1 });
  return {
    version: 1,
    location_id: row.id,
    revision: row.revision,
    state: 'published',
    changed: true,
    draft_id: null,
    op_id: null,
  };
}
export function governance(layer, outcome) {
  return {
    version: 1,
    scope: {
      version: 1,
      trip_id: trip,
      family_id: family,
      user_id: session.userId,
      person_id: session.personId,
      layer,
    },
    permissions: {
      can_mutate: outcome === 'direct',
      can_draft: true,
      outcomes: {
        'trip.places.manage': outcome,
        'trip.schedule.manage': outcome,
        'trip.reservations.manage': 'deny',
        'trip.packing.manage': 'direct',
        'trip.todos.manage': 'direct',
        'trip.costs.manage': 'direct',
        'trip.files.upload': 'direct',
        'trip.files.metadata': 'direct',
        'trip.files.trash': 'direct',
        'trip.metadata.edit': 'direct',
        'trip.archive': 'direct',
      },
    },
    draft: null,
    requests: [],
  };
}
export function plannerView(layer) {
  const result = globalThis.structuredClone(view(layer));
  // Views carry exact per-occurrence location snapshots after a catalog-independent save.
  result.state = globalThis.structuredClone(state);
  result.state.locations = globalThis.structuredClone(locations);
  result.state.visits = result.state.visits.map((v) => ({
    ...v,
    location: result.state.locations.find((l) => l.id === v.plan_location_id) ?? null,
  }));
  if (layer === 'myDraft') result.draft_token = '0'.repeat(64);
  return result;
}
export const syntheticOperation = uuid(900);
