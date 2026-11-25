import { placeFieldOriginsSchema } from '@trek/shared';
import { z } from 'zod';
import api from '../../api/client';
import type { PlaceSubmitData } from '../../components/Planner/PlaceFormModal';
import { isEffectivelyOffline } from '../../sync/networkMode';
import type { Place } from '../../types';
import type { FamilyIdentityRegistry } from './identity';
import { formContextSchema, formReceiptSchema, type FormObservation, type FormValues } from './locationFormContract';
import { savedLocationResponse } from './planLocations';
import { FamilyApiError } from './repository';
const editorSchema = formContextSchema.extend({
  native_place: z.custom<Place>((p) => typeof p === 'object' && p !== null && 'id' in p && typeof p.id === 'number'),
});
const replySchema = z.object({ version: z.literal(1), operation: formReceiptSchema, editor: editorSchema });

/** Unsupported edits refuse the whole save; they never become a partial location write. */
export function nativeLocationValues(
  data: Omit<PlaceSubmitData, 'place_time' | 'end_time'>,
  observation: Pick<FormObservation, 'shown'>,
  place: Pick<Place, 'image_url' | 'osm_id'>,
  ids: FamilyIdentityRegistry
): FormValues {
  const allowed = new Set(['name', 'description', 'notes', 'address', 'website', 'phone', 'lat', 'lng', 'category_id']);
  const defaults = new Set([
    'transport_mode',
    'stop_type',
    '_pendingImage',
    '_serviceStop',
    'place_time',
    'end_time',
    'email',
    'opening_hours',
    'google_place_id',
    'google_ftid',
    'osm_id',
    'amap_poi_id',
  ]);
  const neutral = (key: string, value: unknown) => {
    // 5.1.2 marks provider-filled fields in the native form. Validate the metadata,
    // but do not turn client claims into shared Family catalog provenance. The
    // supported values below still pass the original observed command contract.
    // Native 5.1.4 POI forms spread an absent duration as an explicit undefined key.
    // A real duration still needs the separate scheduling/stay contract.
    if (key === 'duration_minutes') return value === undefined;
    if (key === 'fieldOrigins') return value === undefined || placeFieldOriginsSchema.strict().safeParse(value).success;
    if (key === 'osm_id' && place.osm_id) return value === undefined || value === place.osm_id;
    if (key === 'image_url') return value === undefined || value === (place.image_url ?? null);
    if (key === 'assignment_notes') return value === undefined;
    if (key === '_pendingFiles') return value === undefined || (Array.isArray(value) && value.length === 0);
    return defaults.has(key) && (value == null || value === '' || (key === 'transport_mode' && value === 'walking'));
  };
  for (const [key, value] of Object.entries(data)) {
    if (!allowed.has(key) && !neutral(key, value))
      throw new FamilyApiError(
        409,
        'location_form_field_not_connected',
        `The ${key} edit is not connected to this saved-location form.`
      );
  }
  return {
    name: data.name,
    description: data.description,
    notes: data.notes,
    address: data.address,
    website: data.website,
    phone: data.phone === undefined ? observation.shown.phone : data.phone,
    latitude: data.lat,
    longitude: data.lng,
    family_place_category_id: data.category_id ? ids.uuid('category', data.category_id) : null,
  };
}

/** Online editor orchestration for the pinned native form, without mutating its markup or published caches.
 * prepare() preserves the original body for the native queue; UI offline optimism is a later cutover gate.
 */
export async function openFamilyLocationForm(
  trip: string,
  id: string,
  layer: 'published' | 'myDraft',
  ids: FamilyIdentityRegistry
) {
  const path = `/trips/${trip}/family/plan-locations/${id}/form`;
  const editor = savedLocationResponse(editorSchema, (await api.get(path, { params: { layer } })).data);
  const observation = structuredClone(editor.observation),
    keys = new Map<string, string>();
  function prepare(data: PlaceSubmitData) {
    const form = nativeLocationValues(data, observation, editor.native_place, ids),
      key = JSON.stringify(form);
    let operation = keys.get(key);
    if (!operation) {
      operation = crypto.randomUUID();
      keys.set(key, operation);
    }
    return { operation_id: operation, observation: structuredClone(observation), form };
  }
  async function save(data: PlaceSubmitData) {
    if (isEffectivelyOffline())
      throw new FamilyApiError(
        409,
        'location_form_needs_connection',
        'This editor currently needs a connection. Your form has not been discarded.'
      );
    const body = prepare(data);
    return savedLocationResponse(
      replySchema,
      (await api.post(path, body, { headers: { 'X-Idempotency-Key': body.operation_id } })).data
    );
  }
  return { place: editor.native_place, editor, path, prepare, save };
}
