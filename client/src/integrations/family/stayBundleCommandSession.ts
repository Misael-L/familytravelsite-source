import { stayAuthIdentity } from '@family/backend/supabase/stayRpc';
import { checkedBookingStayView } from './bookingStayContract';
import { createBookingStayReader } from './bookingStayRead';
import { OriginalStayCommandSession, type OriginalStayEnvironment } from './originalStayCommandSession';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { originalStayBundle, type StayBundleEnvelope } from './stayBundleContract';
import {
  acknowledgeStayBundleIntent,
  inspectStayBundleIntent,
  parkStayBundleRefusal,
  retainStayBundleIntent,
} from './stayBundleIntentQueue';
import { createStayBundleTransport } from './stayBundleTransport';
/** The C4 dialect keeps its original API, error codes and core-only service completion. */
export class StayBundleCommandSession extends OriginalStayCommandSession<
  StayBundleEnvelope,
  Awaited<ReturnType<ReturnType<typeof createStayBundleTransport>['execute']>>,
  ReturnType<typeof checkedBookingStayView>
> {
  constructor(
    repo: FamilyFrontendRepository,
    environment: OriginalStayEnvironment,
    original: StayBundleEnvelope,
    dependencies: {
      transport?: ReturnType<typeof createStayBundleTransport>;
      auth?: typeof stayAuthIdentity;
      readCurrent?: (trip: number | string) => Promise<unknown>;
    } = {}
  ) {
    super(
      repo,
      environment,
      original,
      {
        parse: originalStayBundle,
        transport: dependencies.transport ?? createStayBundleTransport(),
        queue: {
          inspect: inspectStayBundleIntent,
          retain: retainStayBundleIntent,
          acknowledge: acknowledgeStayBundleIntent,
          park: parkStayBundleRefusal,
        },
        checkCurrent: checkedBookingStayView,
        revision: (current) => current.trip_revision,
        changed: () =>
          new FamilyApiError(
            409,
            'stay_bundle_session_changed',
            'The original atomic stay context changed. Retained work was not rebound.'
          ),
        queued: () =>
          new FamilyApiError(
            503,
            'stay_bundle_queued',
            'The original atomic stay is retained; reconnect to confirm it.'
          ),
        outcomeOffline: () =>
          new FamilyApiError(503, 'stay_bundle_outcome_offline', 'Reconnect to inspect the original atomic stay.'),
      },
      {
        auth: dependencies.auth,
        readCurrent:
          dependencies.readCurrent ??
          createBookingStayReader(repo, { source: environment.source, auth: dependencies.auth }),
      }
    );
  }
}
