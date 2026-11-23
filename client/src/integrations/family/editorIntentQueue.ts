import { FamilyApiError } from './errors';
import { editorScope, type EditorPacket } from './plannerEditorContract';
import { createPlannerIntentQueue } from './plannerIntentQueue';

export const editorIntentUrl = (p: EditorPacket) => `/trips/${editorScope(p).trip_id}/family/planner-editor-command`;

export const {
  matchesOriginal: matchesEditorOriginal,
  assertOriginal: assertEditorOriginal,
  assertAvailable: assertEditorAvailable,
  retain: retainEditorIntent,
  acknowledge: acknowledgeEditorIntent,
  parkRefusal: parkEditorRefusal,
} = createPlannerIntentQueue<EditorPacket>({
  tripId: (p) => editorScope(p).trip_id,
  url: editorIntentUrl,
  changed: () =>
    new FamilyApiError(
      409,
      'editor_original_changed',
      'The original edit or retained work changed. Nothing was removed.'
    ),
  refusalMessage: 'Original edit refused; retained intact.',
});
