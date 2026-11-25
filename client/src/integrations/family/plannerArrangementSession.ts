import {
  acknowledgeArrangementIntent,
  arrangementIntentUrl,
  assertArrangementOriginal,
  parkArrangementRefusal,
  retainArrangementIntent,
} from './arrangementIntentQueue';
import { checkArrangementAcknowledgement, readArrangementReceipt } from './arrangementReceiptTransport';
import type { ArrangementPacket } from './plannerArrangementContract';
import {
  createPlannerOriginalSession,
  runPlannerOriginal,
  type PlannerOriginalEnvironment,
  type PlannerOriginalOptions,
} from './plannerOriginalSession';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

export function createArrangementSession(
  repo: FamilyFrontendRepository,
  trip: string,
  environment: PlannerOriginalEnvironment
) {
  return createPlannerOriginalSession(
    repo,
    trip,
    environment,
    (p: ArrangementPacket) => p.scope,
    () =>
      new FamilyApiError(
        409,
        'arrangement_session_changed',
        'The original arrangement context changed. Nothing was removed.'
      )
  );
}

export function runArrangementOriginal(
  session: ReturnType<typeof createArrangementSession>,
  p: ArrangementPacket,
  options: PlannerOriginalOptions
) {
  return runPlannerOriginal(session, p, options, {
    url: arrangementIntentUrl,
    retain: retainArrangementIntent,
    assertOriginal: assertArrangementOriginal,
    receipt: readArrangementReceipt,
    acknowledgement: (reply, packet) => checkArrangementAcknowledgement(reply, packet),
    acknowledge: acknowledgeArrangementIntent,
    parkRefusal: parkArrangementRefusal,
    offline: () =>
      new FamilyApiError(503, 'arrangement_offline', 'Reconnect before checking or sending the original arrangement.'),
    invalidAcknowledgement: () =>
      new FamilyApiError(
        502,
        'arrangement_ack_invalid',
        'The original arrangement acknowledgement was invalid. It remains retained.'
      ),
    unconfirmedAcknowledgement: () =>
      new FamilyApiError(
        502,
        'arrangement_ack_unconfirmed',
        'The original arrangement is not confirmed. It remains retained.'
      ),
  });
}
