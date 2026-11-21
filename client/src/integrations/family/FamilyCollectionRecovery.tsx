import { useCallback, useEffect, useRef, useState } from 'react';
import type { CollectionCommandSession } from './collectionCommandSession';
import * as c from './collectionContract';
import { FamilyApiError } from './errors';
type Pending = Awaited<ReturnType<CollectionCommandSession['pending']>>;
type Trash = Awaited<ReturnType<CollectionCommandSession['trash']>>;
type History = Awaited<ReturnType<CollectionCommandSession['history']>>;
type DisplayTrash = {
  kind: 'collection' | 'item';
  items: Array<Trash['items'][number]>;
  next_cursor: Trash['next_cursor'];
};
type DisplayHistory = History & { item: string | null };
const owners = new WeakMap<CollectionCommandSession, number>();
let nextOwner = 0;
/** Each verified session gets its own React lifetime, including its first render. */
export function FamilyCollectionRecovery({
  session,
  onSettled,
}: {
  session: CollectionCommandSession;
  onSettled?: () => Promise<void>;
}) {
  let key = owners.get(session);
  if (key === undefined) {
    key = ++nextOwner;
    owners.set(session, key);
  }
  return <RecoveryOwner key={key} session={session} onSettled={onSettled} />;
}
function boundedRows<T>(previous: readonly T[], incoming: readonly T[], identity: (value: T) => unknown): T[] {
  const rows = [...previous, ...incoming];
  if (rows.length > 1000)
    throw new FamilyApiError(
      413,
      'collection_recovery_bound',
      'The recovery view reached its record limit. Reload before continuing.'
    );
  if (new Set(rows.map(identity)).size !== rows.length) c.collectionInvalid();
  c.collectionJson(rows, 16777216);
  return rows;
}
function text(value: unknown) {
  return typeof value === 'string' ? value : null;
}
function RecoveryOwner({ session, onSettled }: { session: CollectionCommandSession; onSettled?: () => Promise<void> }) {
  const [pending, setPending] = useState<Pending>([]),
    [trash, setTrash] = useState<DisplayTrash | null>(null),
    [history, setHistory] = useState<DisplayHistory | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const live = useRef(false),
    flight = useRef(false),
    pendingRequest = useRef(0);
  const refreshPending = useCallback(async () => {
    const request = ++pendingRequest.current;
    try {
      const p = await session.pending();
      if (live.current && pendingRequest.current === request) setPending(p);
    } catch (error) {
      if (live.current && pendingRequest.current === request) throw error;
    }
  }, [session]);
  useEffect(() => {
    let active = true;
    live.current = true;
    void Promise.resolve()
      .then(() => {
        if (active) return refreshPending();
      })
      .catch(() => {
        if (active && live.current) setMessage('Original work is unavailable in this context.');
      });
    return () => {
      active = false;
      live.current = false;
    };
  }, [refreshPending]);
  const run = async (work: () => Promise<void>) => {
    if (!live.current || flight.current) return;
    flight.current = true;
    pendingRequest.current++;
    setBusy(true);
    setMessage('');
    try {
      await work();
      if (live.current) await onSettled?.();
    } catch (e) {
      if (live.current) {
        if (e instanceof FamilyApiError && (e.status === 401 || e.status === 403)) {
          setTrash(null);
          setHistory(null);
        }
        setMessage(e instanceof Error ? e.message : 'Recovery unavailable. Original work is retained.');
      }
    } finally {
      if (live.current) {
        try {
          await refreshPending();
        } catch {
          /* Retained work is not removed by a failed read. */
        }
      }
      flight.current = false;
      if (live.current) setBusy(false);
    }
  };
  async function deleted(kind: 'collection' | 'item', more = false) {
    const old = more ? trash : null;
    if (more && (!old || old.kind !== kind || !old.next_cursor)) c.collectionInvalid();
    const page = await session.trash(kind, 25, old?.next_cursor ?? null);
    if (!live.current) return;
    const items = boundedRows(old?.items ?? [], page.items, (row) => row.id);
    setTrash({ kind, items, next_cursor: page.next_cursor });
  }
  async function versions(item: string | null, more = false) {
    const old = more ? history : null;
    if (more && (!old || old.item !== item || !old.next_cursor)) c.collectionInvalid();
    const page = await session.history(item, 25, old?.next_cursor?.before_revision ?? null);
    if (!live.current) return;
    const items = boundedRows(old?.items ?? [], page.items, (row) => row.revision);
    setHistory({ ...page, item, items });
  }
  async function resume(id: string, mode: 'check' | 'retry' | 'cancel') {
    const result = await session.run(id, mode);
    if (!live.current) return;
    setMessage(
      result.status === 'committed'
        ? 'Original save confirmed.'
        : result.status === 'cancelled'
          ? 'Original cancellation confirmed.'
          : result.status === 'prepared'
            ? 'Original preparation retained; retry uses the same original.'
            : 'Original outcome remains unknown. The request is retained unchanged.'
    );
    if ((result.status === 'committed' || result.status === 'cancelled') && trash) await deleted(trash.kind);
    if ((result.status === 'committed' || result.status === 'cancelled') && history) await versions(history.item);
  }
  async function restore(row: Trash['items'][number], kind: 'collection' | 'item') {
    const id = await session.retainLifecycle(
      'restore',
      kind === 'item' ? row.id : null,
      kind === 'collection' ? 'trash' : 'active',
      row
    );
    if (live.current) await resume(id, 'retry');
  }
  return (
    <section aria-label="Collection recovery" aria-busy={busy}>
      <h2>Collection recovery</h2>
      {pending.map(({ packet }) => (
        <article key={packet.operation_id}>
          <p>{packet.kind === 'content' ? packet.preparation.intent.action : packet.original.action}</p>
          {(['check', 'retry', 'cancel'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={busy}
              onClick={() => void run(() => resume(packet.operation_id, mode))}
            >
              {mode === 'check' ? 'Check original' : mode === 'retry' ? 'Retry original' : 'Cancel original'}
            </button>
          ))}
        </article>
      ))}
      <button type="button" disabled={busy} onClick={() => void run(() => deleted('item'))}>
        Load deleted items
      </button>
      <button type="button" disabled={busy} onClick={() => void run(() => deleted('collection'))}>
        Load deleted Collections
      </button>
      <button type="button" disabled={busy} onClick={() => void run(() => versions(null))}>
        Collection history
      </button>
      {trash?.items
        .filter((row) => trash.kind === 'item' || row.id === session.scope.collection_id)
        .map((row) => (
          <article key={row.id}>
            <span>
              {trash.kind === 'item' ? 'Deleted saved item' : 'Deleted Collection'} · {row.deleted_at}
            </span>
            <button type="button" disabled={busy} onClick={() => void run(() => restore(row, trash.kind))}>
              {trash.kind === 'item' ? 'Restore item' : 'Restore Collection'}
            </button>
            {trash.kind === 'item' && (
              <button type="button" disabled={busy} onClick={() => void run(() => versions(row.id))}>
                Item history
              </button>
            )}
          </article>
        ))}
      {trash?.next_cursor && (
        <button type="button" disabled={busy} onClick={() => void run(() => deleted(trash.kind, true))}>
          More deleted records
        </button>
      )}
      {history && (
        <section aria-label={history.item === null ? 'Collection history' : 'Saved item history'}>
          <h3>{history.item === null ? 'Collection history' : 'Saved item history'}</h3>
          {history.items.map((row) => (
            <article key={row.revision}>
              <p>
                Revision {row.revision} · {row.recorded_at}
              </p>
              {text(row.snapshot.name) && <p>{text(row.snapshot.name)}</p>}
              {text(row.snapshot.notes) && <p>{text(row.snapshot.notes)}</p>}
              {text(row.location_snapshot?.description) && <p>{text(row.location_snapshot?.description)}</p>}
            </article>
          ))}
          {history.next_cursor && (
            <button type="button" disabled={busy} onClick={() => void run(() => versions(history.item, true))}>
              More history
            </button>
          )}
        </section>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
