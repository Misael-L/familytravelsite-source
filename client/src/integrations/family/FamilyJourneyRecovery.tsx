import { History } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import api from '../../api/client';
import Modal from '../../components/shared/Modal';
import { useJourneyStore } from '../../store/journeyStore';
import type { EntryHistory, RecoveryEntry, TrashPage } from './journeyRecovery';

/** Family-only recovery action; native desktop/phone Journal presentation stays intact. */
export function FamilyJourneyRecovery() {
  const current = useJourneyStore((s) => s.current);
  const loadJourney = useJourneyStore((s) => s.loadJourney);
  const { id } = useParams();
  const [open, setOpen] = useState(false);
  const [trash, setTrash] = useState<RecoveryEntry<number>[]>([]);
  const [cursor, setCursor] = useState<TrashPage<number>['next_cursor']>(null);
  const [history, setHistory] = useState<EntryHistory<number> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    setOpen(false);
    setTrash([]);
    setCursor(null);
    setHistory(null);
    setError('');
    setBusy(false);
    return () => {
      generation.current += 1;
    };
  }, [id]);

  if (
    !current ||
    !('entry_recovery_version' in current) ||
    current.entry_recovery_version !== 1 ||
    String(current.id) !== id ||
    !['owner', 'editor'].includes(current.my_role ?? '')
  )
    return null;
  const journeyId = current.id;
  async function run(action: () => Promise<void>) {
    const request = generation.current;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      if (request === generation.current) {
        const failure = e as { response?: { data?: { error?: string } }; message?: string };
        setError(failure.response?.data?.error ?? failure.message ?? 'Recovery failed. Reload and retry.');
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  async function refreshTrash(before?: TrashPage<number>['next_cursor']) {
    const request = generation.current;
    const result = await api.get<TrashPage<number>>(`/journeys/${journeyId}/recovery`, {
      params: before ? { before_id: before.id, before_deleted_at: before.deleted_at } : {},
    });
    if (request === generation.current) {
      setTrash((previous) => (before ? [...previous, ...result.data.entries] : result.data.entries));
      setCursor(result.data.has_more ? result.data.next_cursor : null);
    }
  }
  async function inspect(entryId: string | number, before?: number) {
    const request = generation.current;
    const result = await api.get<EntryHistory<number>>(`/journeys/entries/${entryId}/history`, {
      params: before ? { before_revision: before } : {},
    });
    if (request === generation.current)
      setHistory((previous) =>
        before && previous
          ? {
              ...result.data,
              current_revision: previous.current_revision,
              versions: [...previous.versions, ...result.data.versions],
            }
          : result.data
      );
  }
  return (
    <>
      <button
        type="button"
        className="fixed bottom-20 end-4 z-40 rounded-full bg-surface-card px-4 py-2 text-body text-content shadow-lg"
        onClick={() => {
          setOpen(true);
          void run(() => refreshTrash());
        }}
      >
        <History className="me-2 inline" size={16} />
        Journal recovery
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Journal recovery" size="xl">
        <div className="space-y-4 p-4" aria-busy={busy}>
          <p>
            Deleted entries stay in Trash. Restoring keeps their identity and attached photos. History restores create a
            new revision.
          </p>
          {error && <p role="alert">{error}</p>}
          <section aria-label="Trashed entries">
            <h3>Trash</h3>
            {trash.length === 0 && !busy && <p>No deleted entries.</p>}
            {trash.map((entry) => (
              <div key={entry.id} className="my-2 flex items-center justify-between gap-2">
                <span>{entry.title || entry.entry_date}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const request = generation.current;
                      await api.post(`/journeys/entries/${entry.id}/restore`, { expected_revision: entry.revision });
                      if (
                        request !== generation.current ||
                        String(useJourneyStore.getState().current?.id) !== String(journeyId)
                      )
                        return;
                      await loadJourney(journeyId);
                      await refreshTrash();
                    })
                  }
                >
                  Restore entry
                </button>
              </div>
            ))}
            {cursor && (
              <button type="button" disabled={busy} onClick={() => void run(() => refreshTrash(cursor))}>
                More deleted entries
              </button>
            )}
          </section>
          <section aria-label="Entry history">
            <h3>History</h3>
            <select
              aria-label="Choose entry history"
              disabled={busy}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) void run(() => inspect(e.target.value));
              }}
            >
              <option value="">Choose an entry</option>
              {current.entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title || entry.entry_date}
                </option>
              ))}
            </select>
            {history?.versions.map((version) => (
              <article key={version.revision} className="my-3 rounded border p-3">
                <p>
                  Revision {version.revision} · {version.recorded_at}
                </p>
                <p>{version.title}</p>
                <p className="whitespace-pre-wrap">{version.story}</p>
                {!version.deleted_at && version.revision !== history.current_revision && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const request = generation.current;
                        await api.post(`/journeys/entries/${history.entry_id}/restore-version`, {
                          revision: version.revision,
                          expected_revision: history.current_revision,
                        });
                        if (
                          request !== generation.current ||
                          String(useJourneyStore.getState().current?.id) !== String(journeyId)
                        )
                          return;
                        await loadJourney(journeyId);
                        await inspect(history.entry_id);
                      })
                    }
                  >
                    Restore revision {version.revision}
                  </button>
                )}
              </article>
            ))}
            {history?.has_more && history.next_revision && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => inspect(history.entry_id, history.next_revision ?? undefined))}
              >
                More history
              </button>
            )}
          </section>
        </div>
      </Modal>
    </>
  );
}
