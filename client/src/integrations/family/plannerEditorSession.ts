import {
  acknowledgeEditorIntent,
  assertEditorOriginal,
  editorIntentUrl,
  parkEditorRefusal,
  retainEditorIntent,
} from './editorIntentQueue';
import { checkEditorAcknowledgement, readEditorReceipt } from './editorReceiptTransport';
import { editorScope, type EditorPacket } from './plannerEditorContract';
import {
  createPlannerOriginalSession,
  runPlannerOriginal,
  type PlannerOriginalEnvironment,
  type PlannerOriginalOptions,
} from './plannerOriginalSession';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

export function createEditorSession(
  repo: FamilyFrontendRepository,
  trip: string,
  environment: PlannerOriginalEnvironment
) {
  return createPlannerOriginalSession(
    repo,
    trip,
    environment,
    editorScope,
    () => new FamilyApiError(409, 'editor_session_changed', 'The original edit context changed. Nothing was removed.')
  );
}

export function runEditorOriginal(
  session: ReturnType<typeof createEditorSession>,
  p: EditorPacket,
  options: PlannerOriginalOptions
) {
  return runPlannerOriginal(session, p, options, {
    url: editorIntentUrl,
    retain: retainEditorIntent,
    assertOriginal: assertEditorOriginal,
    receipt: readEditorReceipt,
    acknowledgement: (reply, packet) => checkEditorAcknowledgement(reply?.operation, packet),
    acknowledge: acknowledgeEditorIntent,
    parkRefusal: parkEditorRefusal,
    offline: () => new FamilyApiError(503, 'editor_offline', 'Reconnect before checking or sending the original edit.'),
    invalidAcknowledgement: () =>
      new FamilyApiError(
        502,
        'editor_ack_invalid',
        'The original edit acknowledgement was invalid. It remains retained.'
      ),
    unconfirmedAcknowledgement: () =>
      new FamilyApiError(502, 'editor_ack_unconfirmed', 'The original edit is not confirmed. It remains retained.'),
  });
}
