import { z } from 'zod';
import { FamilyApiError } from './errors';
import { formSaveSchema } from './locationFormContract';
import { locationId } from './planLocationContract';
import { visitFormSaveSchema } from './visitFormContract';
const fields = {
  version: z.literal(1),
  source_url: z.string().url().max(2048),
  target_id: locationId,
  operation_id: locationId,
};
export const editorPacket = z.discriminatedUnion('kind', [
  z.object({ ...fields, kind: z.literal('location'), request: formSaveSchema }).strict(),
  z.object({ ...fields, kind: z.literal('visit'), request: visitFormSaveSchema }).strict(),
]);
export type EditorPacket = z.infer<typeof editorPacket>;
export function editorScope(p: EditorPacket) {
  const o = p.kind === 'location' ? p.request.observation : p.request.observation.location;
  const target = p.kind === 'location' ? o.location_id : p.request.observation.visit_id;
  if (p.operation_id !== p.request.operation_id || p.target_id !== target)
    throw new FamilyApiError(
      409,
      'editor_original_identity',
      'The original editor identity changed. Nothing was removed.'
    );
  return { ...o, layer: p.request.observation.layer };
}
