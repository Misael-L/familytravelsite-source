import { stayAuthIdentity } from '@family/backend/supabase/stayRpc';
import api from '../../api/client';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { captureWriteSession } from '../../sync/writeSession';
import { nativeStayRefusal } from './nativeStayPatch';
import type { PlannerTaskRecovery, RetainedTask } from './plannerTaskRecovery';
import type { FamilyFrontendRepository } from './repository';
import { stayEnvelope, stayJson, stayScope, type StayEnvelope } from './stayContract';
import {
  acknowledgeStayIntent,
  inspectStayIntent,
  matchesStayIntent,
  parkStayRefusal,
  stayIntentUrl,
} from './stayIntentQueue';
import { checkStayAck, createStayTransport } from './stayTransport';
type RecoveryEnvironment = { source: () => string; current: () => boolean };
/** Recover exact original stay intent without requiring a planner publication blocked by that intent. */
export function createPlannerStayRecovery(
  repo: FamilyFrontendRepository,
  trip: string,
  env: RecoveryEnvironment
): Pick<PlannerTaskRecovery, 'inspect'> {
  const captured = captureWriteSession(),
    context = repo.captureContext(trip, { revision: false }),
    source = env.source(),
    ids = repo.knownViews()?.ids,
    native = ids?.register('trip', trip);
  const check = () => {
    captured.assertCurrent();
    context.assertCurrent();
    if (
      !env.current() ||
      source !== env.source() ||
      repo.getLayer(trip) !== 'published' ||
      ids !== repo.knownViews()?.ids ||
      native === undefined
    )
      throw nativeStayRefusal('The original stay recovery scope changed.');
  };
  const owner = recoveryOwner(captured, check);
  const fence = async (p: StayEnvelope) => {
    check();
    const a = await stayAuthIdentity(),
      s = await repo.session();
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
      throw nativeStayRefusal('The retained command belongs to another actor or source.');
    return stayScope.parse({ ...old, session_id: a.session_id });
  };
  return {
    async inspect(visible = () => true) {
      check();
      if (!visible()) throw nativeStayRefusal('The recovery view ended.');
      const rows = (await owner.db.mutationQueue.toArray()).filter(
        (r) => r.tripId === native || r.url.startsWith('/trips/' + trip + '/')
      );
      check();
      if (rows.length !== 1) return null;
      const row = rows[0],
        parsed = stayEnvelope.safeParse(row.body);
      if (
        !parsed.success ||
        native === undefined ||
        !matchesStayIntent(row, parsed.data, native) ||
        row.status === 'syncing'
      )
        return null;
      const p = parsed.data,
        now = await fence(p),
        cancel = now.session_id !== p.command.scope.session_id;
      const exact = async () => {
        const r = await inspectStayIntent(owner, p, native);
        if (stayJson(r) !== stayJson(row)) throw nativeStayRefusal('The original retained row changed.');
      };
      const run = async (retry: boolean): Promise<'committed' | 'unknown' | 'cancelled'> => {
        check();
        if (!visible() || isEffectivelyOffline()) throw nativeStayRefusal('Reconnect in the original recovery view.');
        const release = await acquireQueueLock(owner, 'exclusive', true);
        if (!release) throw nativeStayRefusal('Another tab owns stay recovery.');
        try {
          const scope = await fence(p);
          await exact();
          check();
          if (!visible() || cancel !== (scope.session_id !== p.command.scope.session_id))
            throw nativeStayRefusal('The recovery session changed.');
          const out = await createStayTransport().outcome(p, scope, retry && cancel);
          await fence(p);
          await exact();
          check();
          if (!visible()) throw nativeStayRefusal('The recovery view ended.');
          if (out.status === 'unknown') {
            if (!retry) return 'unknown';
            if (cancel) throw nativeStayRefusal('The original cancellation is unresolved.');
            try {
              const ack = (
                await api.post(stayIntentUrl(p), structuredClone(p), {
                  headers: { 'X-Idempotency-Key': p.command.operation_id },
                })
              ).data;
              checkStayAck(ack, p);
            } catch (e) {
              await fence(p);
              await exact();
              await parkStayRefusal(owner, p, native, e, row);
              throw e;
            }
          }
          await fence(p);
          await exact();
          check();
          if (!visible()) throw nativeStayRefusal('The recovery view ended.');
          await acknowledgeStayIntent(owner, p, native, row);
          repo.invalidate(trip);
          return out.status === 'cancelled' ? 'cancelled' : 'committed';
        } finally {
          release();
        }
      };
      return {
        domain: 'stay',
        name: p.command.observation.stay?.location.name ?? '',
        action: p.command.action,
        ...(cancel ? { intent: 'cancel-command' as const } : {}),
        check: () => run(false),
        retry: () => run(true),
      } satisfies RetainedTask;
    },
  };
}

function recoveryOwner(captured: ReturnType<typeof captureWriteSession>, check: () => void) {
  return {
    ...captured,
    assertCurrent: check,
    current: () => {
      try {
        check();
        return true;
      } catch {
        return false;
      }
    },
  };
}
