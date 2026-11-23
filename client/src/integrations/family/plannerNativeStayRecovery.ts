import { stayAuthIdentity } from '@family/backend/supabase/stayRpc';
import { captureWriteSession } from '../../sync/writeSession';
import {
  NativeStayCommandSession,
  type NativeStaySessionDependencies,
  type NativeStaySessionEnvironment,
} from './nativeStayCommandSession';
import { originalNativeStayIntent } from './nativeStayContract';
import { matchesNativeStayIntent } from './nativeStayIntentQueue';
import { sameOriginalStayRow } from './originalStayIntentQueue';
import type { PlannerTaskRecovery, RetainedTask } from './plannerTaskRecovery';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
type Environment = {
  source: () => string;
  current: () => boolean;
  confirmCurrent?: NativeStaySessionEnvironment['confirmCurrent'];
  prepareCurrent?: NativeStaySessionEnvironment['prepareCurrent'];
};
/** Cold original-command inspection never requires or publishes an already loaded Trip cohort. */
export function createPlannerNativeStayRecovery(
  repo: FamilyFrontendRepository,
  trip: string,
  env: Environment,
  dependencies: Omit<NativeStaySessionDependencies, 'expected' | 'cold'> = {}
): Pick<PlannerTaskRecovery, 'inspect'> {
  const captured = captureWriteSession(),
    context = repo.captureContext(trip, { revision: false }),
    source = env.source(),
    ids = repo.knownViews()?.ids,
    native = ids?.register('trip', trip),
    auth = dependencies.auth ?? stayAuthIdentity;
  const changed = () =>
    new FamilyApiError(
      409,
      'native_stay_recovery_changed',
      'The original lodging recovery context changed. Nothing was removed.'
    );
  const check = () => {
    captured.assertCurrent();
    context.assertCurrent();
    if (
      !env.current() ||
      env.source() !== source ||
      ids !== repo.knownViews()?.ids ||
      native === undefined ||
      repo.getLayer(trip) !== 'published'
    )
      throw changed();
  };
  const fence = async (p: ReturnType<typeof originalNativeStayIntent>) => {
    check();
    const a = await auth();
    check();
    const s = await repo.session();
    check();
    const old = p.command.scope;
    if (
      p.source_url !== source ||
      old.trip_id !== trip ||
      a.user_id !== old.user_id ||
      s.userId !== old.user_id ||
      s.familyId !== old.family_id ||
      s.personId !== old.person_id
    )
      throw changed();
    return a.session_id;
  };
  return {
    async inspect(visible = () => true) {
      check();
      if (!visible()) throw changed();
      const rows = (await captured.db.mutationQueue.toArray()).filter(
        (r) => r.tripId === native || typeof r.url !== 'string' || r.url.startsWith(`/trips/${trip}/`)
      );
      check();
      if (rows.length !== 1 || native === undefined) return null;
      const row = rows[0];
      let p: ReturnType<typeof originalNativeStayIntent>;
      try {
        p = originalNativeStayIntent(row.body);
      } catch {
        return null;
      }
      if (row.status === 'syncing' || !matchesNativeStayIntent(row, p, native)) return null;
      const session = await fence(p),
        cancel = session !== p.command.scope.session_id;
      const current = () => {
        try {
          check();
          return visible();
        } catch {
          return false;
        }
      };
      const original = await captured.db.mutationQueue.get(row.id);
      check();
      if (!visible() || !sameOriginalStayRow(row, original)) throw changed();
      const channel = new NativeStayCommandSession(
        repo,
        {
          source: env.source,
          disposed: () => !current(),
          confirmCurrent: env.confirmCurrent,
          prepareCurrent: env.prepareCurrent,
        },
        p,
        { ...dependencies, expected: row, cold: true }
      );
      const run = async (retry: boolean): Promise<'committed' | 'unknown' | 'cancelled'> => {
        check();
        if (!visible() || (await fence(p)) !== session) throw changed();
        let result = await channel.reconcile(retry && cancel);
        if (retry && !cancel && result.status === 'unknown') result = await channel.submit();
        if (result.status === 'none') throw changed();
        return result.status;
      };
      const i = p.command.inner;
      return {
        domain: 'stay',
        name: 'format' in i ? i.observation.candidate_location.name : (i.observation.stay?.location.name ?? ''),
        action: 'format' in i ? 'create' : i.action,
        ...(cancel ? { intent: 'cancel-command' as const } : {}),
        check: () => run(false),
        retry: () => run(true),
      } satisfies RetainedTask;
    },
  };
}
