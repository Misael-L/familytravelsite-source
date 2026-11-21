import type { ArrangementPacket } from '../../../src/integrations/family/plannerArrangementContract';
import { arrangementReceipts, cohortState } from './state';

/** Mocked read-only contract. This never runs the arrangement writer or changes projected state. */
export function fakeArrangementOutcome(args: Record<string, unknown>) {
  if (cohortState.deny) return { data: null, error: cohortState.deny };
  const scope = args.p_scope as ArrangementPacket['scope'];
  if (
    scope.user_id !== cohortState.session.userId ||
    scope.family_id !== cohortState.session.familyId ||
    scope.person_id !== cohortState.session.personId
  )
    return { data: null, error: { code: 'PT409' } };
  const saved = arrangementReceipts.get(String(args.p_operation_id));
  if (saved && saved.hash !== JSON.stringify([scope, args.p_plan])) return { data: null, error: { code: 'PT409' } };
  return {
    data: {
      version: 1,
      trip_id: args.p_trip_id,
      operation_id: args.p_operation_id,
      scope,
      plan: args.p_plan,
      request_sha256: 'a'.repeat(64),
      status: saved ? 'committed' : 'unknown',
      result: saved?.result ?? null,
    },
    error: null,
  };
}
