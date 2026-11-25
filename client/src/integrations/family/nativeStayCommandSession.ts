import { stayAuthIdentity } from '@family/backend/supabase/stayRpc';
import type { QueuedMutation } from '../../db/offlineDb';
import { createNativeStayReader } from './bookingStayRead';
import { originalNativeStayIntent, type NativeStayAck, type NativeStayEnvelope } from './nativeStayContract';
import {
  acknowledgeNativeStayIntent,
  inspectNativeStayIntent,
  parkNativeStayRefusal,
  retainNativeStayIntent,
} from './nativeStayIntentQueue';
import { checkedNativeStayView, type NativeStayView } from './nativeStayReadContract';
import { createNativeStayTransport } from './nativeStayTransport';
import {
  OriginalStayCommandSession,
  type OriginalStayEnvironment,
  type OriginalStayPreparedRefresh,
} from './originalStayCommandSession';
import type { PlannerReadGuard } from './plannerReadGuard';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
export type NativeStaySessionDependencies = {
  transport?: ReturnType<typeof createNativeStayTransport>;
  auth?: typeof stayAuthIdentity;
  readCurrent?: (trip: number | string) => Promise<unknown>;
  expected?: QueuedMutation;
  cold?: boolean;
};
export type NativeStaySessionEnvironment = OriginalStayEnvironment & {
  confirmCurrent?: (current: NativeStayView, guard: PlannerReadGuard) => Promise<void>;
  prepareCurrent?: (current: NativeStayView, guard: PlannerReadGuard) => Promise<OriginalStayPreparedRefresh>;
};
/** Original outer intent only. A known commit remains retained until complete refresh succeeds. */
export class NativeStayCommandSession extends OriginalStayCommandSession<
  NativeStayEnvelope,
  NativeStayAck,
  NativeStayView
> {
  constructor(
    repo: FamilyFrontendRepository,
    environment: NativeStaySessionEnvironment,
    original: NativeStayEnvelope,
    dependencies: NativeStaySessionDependencies = {}
  ) {
    super(
      repo,
      environment,
      original,
      {
        parse: originalNativeStayIntent,
        transport: dependencies.transport ?? createNativeStayTransport(),
        queue: {
          inspect: inspectNativeStayIntent,
          retain: retainNativeStayIntent,
          acknowledge: acknowledgeNativeStayIntent,
          park: parkNativeStayRefusal,
        },
        checkCurrent: checkedNativeStayView,
        revision: (current) => current.core.trip_revision,
        requireRefresh: true,
        confirmCurrent: environment.confirmCurrent,
        prepareCurrent: environment.prepareCurrent,
        changed: () =>
          new FamilyApiError(
            409,
            'native_stay_session_changed',
            'The original native stay context changed. Retained work was not rebound.'
          ),
        queued: () =>
          new FamilyApiError(
            503,
            'native_stay_queued',
            'The complete original lodging operation is retained; reconnect to confirm it.'
          ),
        outcomeOffline: () =>
          new FamilyApiError(
            503,
            'native_stay_outcome_offline',
            'Reconnect to inspect the original lodging operation.'
          ),
      },
      {
        ...dependencies,
        readCurrent:
          dependencies.readCurrent ??
          createNativeStayReader(repo, { source: environment.source, auth: dependencies.auth }),
      }
    );
  }
}
