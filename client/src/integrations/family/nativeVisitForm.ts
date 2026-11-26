import { z } from 'zod';
import api from '../../api/client';
import type { PlaceSubmitData } from '../../components/Planner/PlaceFormModal';
import { isEffectivelyOffline } from '../../sync/networkMode';
import type { Assignment, Place } from '../../types';
import type { FamilyIdentityRegistry } from './identity';
import { nativeLocationValues } from './nativeLocationForm';
import { savedLocationResponse } from './planLocations';
import { FamilyApiError } from './repository';
import { visitFormContextSchema, visitFormReceiptSchema, visitFormValuesSchema } from './visitFormContract';
const editorSchema = visitFormContextSchema.extend({
  native_place: z.custom<Place>((p) => typeof p === 'object' && p !== null && 'id' in p && typeof p.id === 'number'),
  native_assignment: z.custom<Assignment>(
    (p) => typeof p === 'object' && p !== null && 'id' in p && typeof p.id === 'number'
  ),
});
const replySchema = z.object({ version: z.literal(1), operation: visitFormReceiptSchema, editor: editorSchema });

/** Atomic selected-occurrence form; no native markup or default planner adapter change. */
export async function openFamilyVisitForm(
  trip: string,
  visit: string,
  layer: 'published' | 'myDraft',
  ids: FamilyIdentityRegistry
) {
  const path = `/trips/${trip}/family/visits/${visit}/form`;
  const editor = savedLocationResponse(editorSchema, (await api.get(path, { params: { layer } })).data);
  const observation = structuredClone(editor.observation),
    keys = new Map<string, string>();
  function prepare(data: PlaceSubmitData) {
    const { place_time, end_time, assignment_notes, ...locationData } = data;
    const form = visitFormValuesSchema.parse({
      location: nativeLocationValues(locationData, observation.location, editor.native_place, ids),
      visit_notes: assignment_notes === undefined ? observation.shown_visit.explanations : assignment_notes,
      clocks: {
        start:
          place_time === undefined ? (observation.shown_visit.start_local?.slice(11, 16) ?? null) : place_time || null,
        end: end_time === undefined ? (observation.shown_visit.end_local?.slice(11, 16) ?? null) : end_time || null,
      },
    });
    const key = JSON.stringify(form);
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
        'visit_form_needs_connection',
        'This editor needs a connection. Your form has not been discarded.'
      );
    const body = prepare(data);
    return savedLocationResponse(
      replySchema,
      (await api.post(path, body, { headers: { 'X-Idempotency-Key': body.operation_id } })).data
    );
  }
  return { place: editor.native_place, assignment: editor.native_assignment, editor, path, prepare, save };
}
