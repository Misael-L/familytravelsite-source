import { useImportAccountScope, type ImportAction } from '../../sync/importSessionScope'
import { canReviewBookingImport } from '../Planner/bookingImportAvailability'
import { useStayState } from '../Planner/stayActionScope'
import { captureWriteSession } from '../../sync/writeSession'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Loader2, CheckCircle2, AlertCircle, AlertTriangle, X } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useToast } from '../shared/Toast'
import { addListener, removeListener } from '../../api/websocket'
import { reservationsApi, healthApi } from '../../api/client'
import { saveImportFiles } from '../../db/offlineDb'
import { isEffectivelyOffline } from '../../sync/networkMode'
import { useBackgroundTasksStore, taskFoundSomething, type BackgroundImportTask } from '../../store/backgroundTasksStore'
import type { ReceiptRead } from '@trek/shared'

/**
 * One reading of a finished job's result, wherever it arrives from (the push,
 * the reload reconcile, the poll): a booking parse answers `items`, a receipt
 * scan `receipt`.
 */
function settleJob(id: string, tripId: string, result: unknown): void {
  const r = result as { items?: unknown[]; warnings?: string[]; receipt?: ReceiptRead | null } | undefined
  useBackgroundTasksStore.getState().setDone(id, tripId, (r?.items ?? []) as never, r?.warnings ?? [], r?.receipt)
}

/** Reconcile only a job still present in the originating account's widget. */
function reconcile(task: BackgroundImportTask, action: ImportAction, expired: () => void) {
  const present = () => useBackgroundTasksStore.getState().tasks.some(t => t.id === task.id && t.tripId === task.tripId);
  return action.perform(() => reservationsApi.importJobStatus(task.tripId, task.id)).then(status => action.effect(() => {
    if (!present()) return;
    const store = useBackgroundTasksStore.getState();
    if (status.status === 'done') settleJob(task.id, task.tripId, status.result);
    else if (status.status === 'error') store.setError(task.id, task.tripId, status.error ?? 'error');
    else store.setProgress(task.id, task.tripId, status.done, status.total);
  }), (error: { response?: { status?: number } }) => action.effect(() => {
    if (!present() || error?.response?.status !== 404) return;
    // Keep the reference to the original booking files while review is unavailable.
    if (reviewAllowedFor(task)) expired();
    else useBackgroundTasksStore.getState().setUnavailable(task.id, task.tripId);;
  }));
}

function reviewAllowedFor(task: BackgroundImportTask) {
  return task.kind === 'costs' || canReviewBookingImport()
}

/** What a job that is still reading says: a receipt scan reads, a booking import parses. */
function readingKey(task: BackgroundImportTask): string {
  return task.kind === 'costs' ? 'costs.scan.reading' : 'reservations.import.parsing'
}

/**
 * Global, route-independent widget (bottom-right) that tracks background booking
 * imports. Mounted once at the app root so it survives navigation. It listens to the
 * user's WebSocket for import:progress / import:done / import:error and reflects each
 * job; a finished job offers a "review" action that takes the user to the trip, where
 * the per-item review flow opens. Polls running jobs as a backstop for missed pushes.
 */
export default function BackgroundTasksWidget() {
  const { t } = useTranslation()
  const capture = useImportAccountScope()
  const toast = useToast()
  const navigate = useNavigate()
  const tasks = useBackgroundTasksStore((s) => s.tasks)
  const setProgress = useBackgroundTasksStore((s) => s.setProgress)
  const setError = useBackgroundTasksStore((s) => s.setError)
  const requestReview = useBackgroundTasksStore((s) => s.requestReview)
  const dismiss = useBackgroundTasksStore((s) => s.dismiss)
  const addTask = useBackgroundTasksStore((s) => s.addTask)

  const [aiParsing, setAiParsing] = useStayState(capture, false)
  useEffect(() => {
    // Cancelled on unmount, so a late answer never sets state on a torn-down widget.
    let cancelled = false
    const action = capture(() => !cancelled)
    action.perform(() => healthApi.features())
      .then((f) => { action.effect(() => setAiParsing(!!f.aiParsing)) })
      .catch(() => { action.effect(() => setAiParsing(false)) })
    return () => { cancelled = true }
  }, [capture, setAiParsing])

  // Re-runs the same files with force-ai: the LLM sees every file, kitinerary is skipped.
  const [retrying, setRetrying] = useStayState<string | null>(capture, null)
  const retryWithAi = async (task: BackgroundImportTask) => {
    const action = capture(() => useBackgroundTasksStore.getState().tasks.some(t => t.id === task.id && t.tripId === task.tripId))
    const work = captureWriteSession()
    if (!action.current() || !canReviewBookingImport()) return
    const files = task.sourceFiles
    if (!files || files.length === 0 || retrying === task.id) return
    // Offline the card stays as it is, with its button, for a try once the connection is back.
    if (isEffectivelyOffline()) { toast.error(t('reservations.needsConnection')); return }
    setRetrying(task.id)
    try {
      const { jobId } = await work.perform(() => reservationsApi.importBookingAsync(task.tripId, files, 'force-ai'))
      // Same as the modal's first submit: the review attaches each source document to the
      // booking it created, and only IndexedDB survives a reload mid-parse.
      await work.perform(() => saveImportFiles(jobId, files))
      action.effect(() => { dismiss(task.id); addTask({ id: jobId, tripId: task.tripId, label: task.label, total: files.length, files, mode: 'force-ai', kind: task.kind }) })
    } catch (err) {
      // 409 when the addon is enabled but this user has no model configured.
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      action.effect(() => setError(task.id, task.tripId, message ?? t('reservations.import.error')))
    } finally {
      capture().effect(() => setRetrying(active => active === task.id ? null : active))
    }
  }

  // On (re)load, reconcile tasks restored from localStorage with the server: a parse
  // that was still running when the page reloaded must keep its widget, so re-fetch each
  // job's real status (and its parsed items) once. Expired jobs are dismissed
  // where review is supported. Otherwise keep the booking job's file reference.
  useEffect(() => {
    let live = true
    const action = capture(() => live)
    for (const task of useBackgroundTasksStore.getState().tasks) {
      void reconcile(task, action, () => dismiss(task.id))
    }
    return () => { live = false }
  }, [capture, dismiss])

  // Server pushes import:* to the user on whatever page they're on.
  useEffect(() => {
    const action = capture()
    const handler = (e: Record<string, unknown>) => {
      if (!action.current()) return
      const type = typeof e.type === 'string' ? e.type : ''
      if (!type.startsWith('import:')) return
      const id = String(e.jobId ?? '')
      const tripId = String(e.tripId ?? '')
      if (!id) return
      if (type === 'import:progress') setProgress(id, tripId, Number(e.done ?? 0), Number(e.total ?? 1))
      else if (type === 'import:done') settleJob(id, tripId, e.result)
      else if (type === 'import:error') setError(id, tripId, String(e.message ?? 'error'))
    }
    addListener(handler)
    return () => removeListener(handler)
  }, [setProgress, setError, capture])

  // Backstop: poll jobs whose state we still need — running ones (in case a WebSocket push
  // was missed) and a restored 'done' task whose items haven't been re-fetched yet (so a
  // failed one-shot rehydrate self-heals instead of getting stuck on "preview empty").
  useEffect(() => {
    const pending = tasks.filter((task) => task.status === 'running' || (task.status === 'done' && task.items === undefined))
    if (pending.length === 0) return
    let live = true
    const action = capture(() => live)
    const iv = setInterval(() => {
      for (const task of pending) void reconcile(task, action, () => setError(task.id, task.tripId, t('common.unknownError')))
    }, 5000)
    return () => { live = false; clearInterval(iv) }
  }, [tasks, setError, t, capture])

  if (tasks.length === 0) return null

  const review = (task: BackgroundImportTask) => {
    if (!reviewAllowedFor(task)) return
    requestReview(task.id)
    navigate(`/trips/${task.tripId}`)
  }

  return createPortal(
    <div
      style={{ position: 'fixed', insetInlineEnd: 16, bottom: 16, zIndex: 50000, display: 'flex', flexDirection: 'column', gap: 8, width: 380, maxWidth: 'calc(100vw - 32px)', fontFamily: 'var(--font-system)' }}
    >
      {tasks.map((task) => (
        <div
          key={task.id}
          className="bg-surface-card"
          style={{ borderRadius: 12, border: '1px solid var(--border-primary)', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: '11px 13px', backdropFilter: 'blur(8px)', display: 'flex', gap: 10, alignItems: 'flex-start' }}
        >
          <div style={{ flexShrink: 0, marginTop: 1 }}>
            {(task.status === 'running' || (task.status === 'done' && task.items === undefined)) && <Loader2 size={16} className="animate-spin" color="var(--accent)" />}
            {task.status === 'done' && task.items !== undefined && taskFoundSomething(task) && <CheckCircle2 size={16} color="var(--success)" />}
            {/* A parse that found nothing is not a success, whatever the job
                status says: the same card used to show a green tick next to
                "no reservations could be extracted" (#2477). */}
            {task.status === 'done' && task.items !== undefined && !taskFoundSomething(task) && <AlertTriangle size={16} color="var(--warning)" />}
            {task.status === 'error' && <AlertCircle size={16} color="var(--danger)" />}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.label}
            </div>

            {task.status === 'running' && (
              <div style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', color: 'var(--text-faint)', marginTop: 1 }}>
                {t(readingKey(task))}
                {task.total > 1 ? ` · ${task.done}/${task.total}` : ''}
              </div>
            )}

            {task.status === 'done' && (
              task.items === undefined ? (
                // Restored from a reload; items are being re-fetched (see the poll backstop).
                <div style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', color: 'var(--text-faint)', marginTop: 1 }}>{t(readingKey(task))}</div>
              ) : taskFoundSomething(task) ? (
                <div>
                  {reviewAllowedFor(task) ? (
                    <button type="button"
                      onClick={() => review(task)}
                      className="bg-accent text-accent-text"
                      style={{ marginTop: 4, border: 'none', borderRadius: 8, padding: '4px 12px', fontSize: 'calc(11.5px * var(--fs-scale-caption, 1))', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      {t(task.kind === 'costs' ? 'costs.scan.review' : 'common.import')}
                    </button>
                  ) : (
                    <p>{t('assistant.error.importUnavailable')}</p>
                  )}
                  {/* A partly-understood import warns too. Warnings used to be
                      shown only when nothing at all was found, so anything the
                      parse could not place — a station it could not locate, say
                      (#1969) — was dropped without a word on exactly the imports
                      that did produce something. */}
                  {(task.warnings?.length ?? 0) > 0 && (
                    <div style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', color: '#b45309', marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 96, overflowY: 'auto' }}>
                      {task.warnings!.join('\n')}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', color: 'var(--text-faint)', marginTop: 1 }}>
                    {t(task.kind === 'costs' ? 'costs.scan.nothingRead' : 'reservations.import.previewEmpty')}
                    {(task.warnings?.length ?? 0) > 0 && (
                      <div style={{ color: '#b45309', marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 96, overflowY: 'auto' }}>
                        {task.warnings!.join('\n')}
                      </div>
                    )}
                  </div>
                  {aiParsing && canReviewBookingImport() && task.kind !== 'costs' && task.mode !== 'force-ai' && task.sourceFiles && task.sourceFiles.length > 0 && (
                    <button type="button"
                      onClick={() => retryWithAi(task)}
                      disabled={retrying === task.id}
                      className="bg-surface-tertiary text-content"
                      style={{ marginTop: 4, border: 'none', borderRadius: 8, padding: '4px 12px', fontSize: 'calc(11.5px * var(--fs-scale-caption, 1))', fontWeight: 600, cursor: retrying === task.id ? 'default' : 'pointer', opacity: retrying === task.id ? 0.6 : 1, fontFamily: 'inherit' }}
                    >
                      {t('reservations.import.tryAi')}
                    </button>
                  )}
                </div>
              )
            )}

            {task.status === 'unavailable' && <p>{t('assistant.error.importUnavailable')}</p>}

            {task.status === 'error' && (
              <div style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', color: '#b91c1c', marginTop: 1, whiteSpace: 'pre-wrap' }}>{task.error}</div>
            )}
          </div>

          {task.status !== 'running' && (
            <button type="button"
              onClick={() => dismiss(task.id)}
              className="bg-transparent text-content-faint"
              style={{ flexShrink: 0, border: 'none', cursor: 'pointer', padding: 2, borderRadius: 6, display: 'flex', alignItems: 'center' }}
              aria-label={t('common.close')}
            >
              <X size={13} />
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body
  )
}
