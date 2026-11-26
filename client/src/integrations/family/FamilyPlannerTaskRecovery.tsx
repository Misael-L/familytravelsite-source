import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useNetworkMode } from '../../hooks/useNetworkMode';
import { useTranslation } from '../../i18n';
import { FamilyCreationRecoveryActions } from './FamilyCreationRecoveryActions';
import { FamilyPackingRecoveryActions } from './FamilyPackingRecoveryActions';
import type { PlannerReadProblem } from './plannerBoundaryOwner';
import type { PackingReplacementPage, PlannerTaskRecovery, RetainedTask } from './plannerTaskRecovery';

function settlementMessage(task: RetainedTask, result: 'committed' | 'cancelled') {
  if (result === 'committed') return `The original ${task.domain} save is confirmed. Loading the current Trip…`;
  if (task.domain === 'planner')
    return 'The original place or visit save was cancelled and archived. Loading the current Trip…';
  if (task.intent !== 'cancel-command')
    return 'The original restore was cancelled and archived. Loading the current Trip…';
  return task.domain === 'stay'
    ? 'The original stay change was cancelled. Loading the current Trip…'
    : 'The saved bag change was cancelled and archived. Loading the current Trip…';
}

/** Recovery is owned by the failed read, not by an unpublished or previous native Trip. */
export function FamilyPlannerTaskRecovery({
  problem,
  recovery,
}: {
  problem: PlannerReadProblem | Pick<PlannerReadProblem, 'current' | 'retry'>;
  recovery: PlannerTaskRecovery;
}) {
  const { t } = useTranslation(),
    { offline } = useNetworkMode(),
    [task, setTask] = useState<RetainedTask | null>(null),
    [replacementPage, setReplacementPage] = useState<PackingReplacementPage | null>(null),
    [busy, setBusy] = useState(false),
    [inspection, setInspection] = useState(0),
    [message, setMessage] = useState(''),
    live = useRef(false),
    flight = useRef(false),
    generation = useRef(0);
  const run = async (work: () => Promise<unknown>) => {
    if (flight.current || !live.current || !problem.current()) return;
    flight.current = true;
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (e) {
      if (live.current && problem.current()) {
        setMessage(e instanceof Error ? e.message : t('common.error'));
        try {
          await inspect();
        } catch {
          /* The exact retained work stays protected. */
        }
      }
    } finally {
      flight.current = false;
      if (live.current && problem.current()) setBusy(false);
    }
  };
  const inspect = async () => {
    const token = ++generation.current;
    const result = await recovery.inspect(() => live.current && generation.current === token && problem.current());
    const page = recovery.replacements
      ? await recovery.replacements(() => live.current && generation.current === token && problem.current())
      : null;
    if (live.current && generation.current === token && problem.current()) {
      setReplacementPage(page);
      setTask(result);
      setInspection((n) => n + 1);
      if (!result && !recovery.replacement)
        setMessage('This work cannot be retried here. Export it or open Offline settings; nothing was removed.');
    }
    return result;
  };
  const inspectOnMount = useEffectEvent(() => {
    void run(inspect);
  });
  const retire = useEffectEvent(() => {
    live.current = false;
    generation.current++;
  });
  useEffect(() => {
    live.current = true;
    inspectOnMount();
    return () => {
      retire();
    };
  }, [recovery]);
  const domain = task?.domain ?? (recovery.replacement ? 'packing' : 'task');
  const unavailable = busy || offline;
  const settle = async (result: 'unknown' | 'committed' | 'cancelled') => {
    if (!task) return;
    if (!live.current || !problem.current()) return;
    if (result === 'unknown') {
      setMessage(
        task.intent === 'cancel-restore' || task.intent === 'cancel-command'
          ? 'The cancellation is unresolved. The original remains retained; retry repeats the same cancellation.'
          : 'The original save is still unresolved. It has been retained unchanged. Retry sends that same original command.'
      );
      return;
    }
    setMessage(settlementMessage(task, result));
    const remaining = await inspect();
    if (remaining) return;
    await problem.retry(); // Fresh, guarded canonical read; never publish the historical acknowledgement.
  };
  const confirm = async (retry: boolean) => {
    if (!task) return;
    await settle(await (retry ? task.retry() : task.check()));
  };
  const button = 'rounded-lg border border-edge px-3 py-2 text-content disabled:opacity-50';
  return (
    <section className="flex flex-col gap-3" aria-label={`Retained ${domain} recovery`} aria-busy={busy}>
      {task && <p>{task.name || `Original ${domain} ${task.action}`}</p>}
      <div className="flex flex-wrap gap-2">
        {task && (
          <>
            <button
              type="button"
              className={button}
              disabled={unavailable}
              onClick={() => void run(() => confirm(false))}
            >
              Check retained {domain} save
            </button>
            <button
              type="button"
              className={button}
              disabled={unavailable}
              onClick={() => void run(() => confirm(true))}
            >
              {task.intent === 'cancel-restore' || task.intent === 'cancel-command'
                ? 'Retry original cancellation'
                : `Retry original ${domain} save`}
            </button>
          </>
        )}
        <button type="button" className={button} disabled={unavailable} onClick={() => void run(inspect)}>
          Inspect retained work
        </button>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => void run(() => recovery.export(() => live.current && problem.current()))}
        >
          {t('settings.offline.retained.export')}
        </button>
        <a className={button} href="/settings?tab=offline">
          {t('settings.tabs.offline')}
        </a>
      </div>
      {task?.creation && (
        <FamilyCreationRecoveryActions key={inspection} task={task} busy={unavailable} run={run} settled={settle} />
      )}
      {domain === 'packing' && (
        <FamilyPackingRecoveryActions
          task={task}
          candidates={replacementPage?.items}
          more={
            replacementPage?.next_offset !== null && replacementPage?.next_offset !== undefined
              ? async () => {
                  if (!recovery.replacements) return;
                  const token = generation.current;
                  const page = await recovery.replacements(
                    () => live.current && generation.current === token && problem.current(),
                    replacementPage.next_offset!
                  );
                  if (live.current && generation.current === token && problem.current())
                    setReplacementPage((old) => ({
                      items: [...(old?.items ?? []), ...page.items],
                      next_offset: page.next_offset,
                    }));
                }
              : undefined
          }
          recovery={recovery}
          busy={unavailable}
          run={run}
          inspect={inspect}
          visible={() => live.current && problem.current()}
          reload={async () => {
            await problem.retry();
          }}
          message={setMessage}
        />
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
