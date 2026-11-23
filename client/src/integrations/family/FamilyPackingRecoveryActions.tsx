import { useState } from 'react';
import type { PlannerTaskRecovery, RetainedTask } from './plannerTaskRecovery';
type Choice = { label: string; confirm: () => Promise<void> };
/** Explicit decisions over the captured original. Dismissing a confirmation sends nothing. */
export function FamilyPackingRecoveryActions({
  task,
  candidates,
  more,
  recovery,
  busy,
  run,
  inspect,
  visible,
  reload,
  message,
}: {
  task: RetainedTask | null;
  candidates?: Array<{ id: string; action: string }>;
  more?: () => Promise<void>;
  recovery: PlannerTaskRecovery;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  inspect: () => Promise<RetainedTask | null>;
  visible: () => boolean;
  reload: () => Promise<void>;
  message: (text: string) => void;
}) {
  const [choice, setChoice] = useState<Choice | null>(null),
    [parents, setParents] = useState<Array<{ id: string; name: string }>>([]),
    [settled, setSettled] = useState<string[]>([]);
  const button = 'rounded-lg border border-edge px-3 py-2 text-content disabled:opacity-50';
  const cancel = async (id: string) => {
    if (!task?.terminal) return;
    const decision = await task.terminal.prepare(id);
    if (!visible()) return;
    setChoice({
      label:
        task.action.startsWith('bag-') && task.action !== 'bag-restore'
          ? 'Cancel this saved bag change?'
          : 'Cancel this saved restore attempt?',
      confirm: async () => {
        const result = await decision.cancel();
        if (!visible()) return;
        if (result === 'cancelled') setSettled((old) => [...new Set([...old, id])]);
        await inspect();
        const bagChange = task.action.startsWith('bag-') && task.action !== 'bag-restore';
        if (bagChange) await reload();
        message(
          result === 'cancelled'
            ? bagChange
              ? 'The saved bag change was cancelled. Its original is kept for export.'
              : 'This saved restore was cancelled. Its original is kept for export.'
            : bagChange
              ? 'The earlier bag change already committed. Refresh the Trip to see its current state.'
              : 'The earlier restore already committed. Refresh the Trip to see its current state.'
        );
      },
    });
  };
  return (
    <div className="flex flex-col gap-3" aria-label="Packing restore decisions">
      {task?.parents && (
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const p = await task.parents!.list();
              if (visible()) {
                setParents(p);
                if (!p.length) message('No deleted parent bag needs restoring. The saved attempt is unchanged.');
              }
            })
          }
        >
          Find parent bag
        </button>
      )}
      {parents.map((parent) => (
        <button
          key={parent.id}
          className={button}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (!task?.parents) return;
              const p = await task.parents.prepare(parent.id);
              if (!visible()) return;
              if (p.status === 'child-committed') {
                await inspect();
                message('The saved restore already committed.');
                return;
              }
              setChoice({
                label: 'Restore parent bag ' + parent.name + '?',
                confirm: async () => {
                  const status = await p.submit();
                  if (!visible()) return;
                  await inspect();
                  setParents([]);
                  message(
                    status === 'committed'
                      ? 'Parent bag restored. The remaining saved restore is unchanged.'
                      : 'The parent restore is unresolved; keep the original attempt.'
                  );
                },
              });
            })
          }
        >
          Restore parent bag · {parent.name}
        </button>
      ))}
      {(task?.terminal?.operations ?? []).map((op) => (
        <button key={op.id} className={button} disabled={busy} onClick={() => void run(() => cancel(op.id))}>
          Cancel saved{' '}
          {op.action === 'bag-restore'
            ? 'bag restore'
            : op.action === 'category-restore-batch'
              ? 'list restore'
              : op.action.startsWith('bag-')
                ? 'bag change'
                : 'item restore'}
        </button>
      ))}
      {(recovery.replacements ? (candidates ?? []) : settled.map((id) => ({ id, action: 'restore' }))).map(
        ({ id, action }) => (
          <button
            key={id}
            className={button}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!recovery.replacement) return;
                const p = await recovery.replacement(id, visible);
                if (!visible()) return;
                setChoice({
                  label: 'Try a new restore using the current Trip?',
                  confirm: async () => {
                    await p.submit();
                    if (!visible()) return;
                    setSettled((old) => old.filter((x) => x !== id));
                    await inspect();
                    await reload();
                  },
                });
              })
            }
          >
            Prepare new restore
            {recovery.replacements
              ? ' · ' + (action === 'category-restore-batch' ? 'list' : action === 'bag-restore' ? 'bag' : 'item')
              : ''}
          </button>
        )
      )}
      {more && (
        <button className={button} disabled={busy} onClick={() => void run(more)}>
          More saved restores
        </button>
      )}
      {choice && (
        <section role="alertdialog" aria-label={choice.label} className="flex flex-col gap-2">
          <p>{choice.label}</p>
          <p>The original saved attempt remains available for export.</p>
          <button
            className={button}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const held = choice;
                setChoice(null);
                await held.confirm();
              })
            }
          >
            Confirm
          </button>
          <button className={button} disabled={busy} onClick={() => setChoice(null)}>
            Keep current attempt
          </button>
        </section>
      )}
      <button className={button} disabled={busy} onClick={() => void run(reload)}>
        Refresh Trip
      </button>
    </div>
  );
}
