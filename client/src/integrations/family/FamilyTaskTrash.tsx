import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/shared/Modal';
import { useTranslation } from '../../i18n';
import { currentPlannerTaskPort, type PlannerTaskPort } from '../../repo/plannerTaskPort';
import { useCanDo } from '../../store/permissionsStore';
import { useTripStore } from '../../store/tripStore';
import type { TaskTrashPage } from './taskContract';
export function FamilyTaskTrash() {
  const port = currentPlannerTaskPort(),
    trip = useTripStore((s) => s.trip),
    can = useCanDo(),
    { t } = useTranslation();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [ownedPage, setPage] = useState<{
      port: PlannerTaskPort;
      trip: number | string | undefined;
      value: TaskTrashPage;
    } | null>(null),
    [recovery, setRecovery] = useState('');
  const page = ownedPage?.port === port && ownedPage?.trip === trip?.id ? ownedPage.value : null;
  const generation = useRef(0),
    enabled = port !== null && can('todo_edit', trip);
  useEffect(() => {
    const token = ++generation.current;
    if (open && enabled && port) {
      void port
        .trashPage()
        .then((result) => {
          if (token === generation.current && port === currentPlannerTaskPort())
            setPage({ port, trip: trip?.id, value: result });
        })
        .catch((e: unknown) => {
          if (token === generation.current) setError(e instanceof Error ? e.message : 'Task Trash could not load.');
        })
        .finally(() => {
          if (token === generation.current) setBusy(false);
        });
    }
    return () => {
      generation.current = token + 1;
    };
  }, [port, trip?.id, open, enabled]);
  if (!port || !enabled) return null;
  const run = async (action: () => Promise<void>) => {
    const token = generation.current;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      if (token === generation.current) setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  const refresh = async (more = false) => {
    const token = generation.current,
      result = await port.trashPage(more ? page?.next_cursor : null);
    if (token === generation.current && port === currentPlannerTaskPort())
      setPage({
        port,
        trip: trip?.id,
        value: { ...result, tasks: more ? [...(page?.tasks ?? []), ...result.tasks] : result.tasks },
      });
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setBusy(true);
          setError('');
          setRecovery('');
          setOpen(true);
          setPage(null);
        }}
        className="rounded-full px-3 py-2 text-content-muted"
      >
        {t('todo.subtab.todo')} · {t('files.trash')}
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={`${t('todo.subtab.todo')} · ${t('files.trash')}`}>
        <div className="space-y-4 p-4" aria-busy={busy}>
          {error && <p role="alert">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                const token = generation.current;
                const result = await port.reconcile();
                if (token === generation.current)
                  setRecovery(
                    result === 'committed'
                      ? 'The original task save is confirmed.'
                      : result === 'unknown'
                        ? 'The original save is still unresolved. It has been retained unchanged.'
                        : 'No retained task save was found.'
                  );
              });
            }}
          >
            Check retained task save
          </button>
          {recovery && <p role="status">{recovery}</p>}
          {!page && error && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void run(() => refresh());
              }}
            >
              {t('common.errorRetry')}
            </button>
          )}
          {page?.tasks.length === 0 && <p>{t('files.trashEmpty')}</p>}
          <ul>
            {page?.tasks.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-4">
                <span>{row.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void run(async () => {
                      const token = generation.current;
                      await port.restore(row);
                      if (token === generation.current) await refresh();
                    });
                  }}
                >
                  {t('files.restore')}
                </button>
              </li>
            ))}
          </ul>
          {page?.next_cursor && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void run(() => refresh(true));
              }}
            >
              {t('common.showMore')}
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}
