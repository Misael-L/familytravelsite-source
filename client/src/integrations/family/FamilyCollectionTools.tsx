import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { DialogButton, DialogHeader, DialogShell, DialogTile, NEUTRAL_TINT } from '../../components/shared/DialogShell';
import { useCollectionStore } from '../../store/collectionStore';
import type { CollectionCohort } from './collectionCohort';
import type { CollectionCommandSession } from './collectionCommandSession';
import { getFamilyCollectionCohort, useFamilyCollectionUI } from './collectionRuntime';
import { FamilyCollectionRecovery } from './FamilyCollectionRecovery';
/** One reachable recovery surface on either native shell, outside upstream layout markup. */
export function FamilyCollectionTools() {
  const ui = useFamilyCollectionUI();
  if (!ui.family) return null;
  if (!ui.writeReady)
    return (
      <div className="fixed bottom-20 end-4 z-[35] max-w-sm rounded-xl bg-surface-card p-3 shadow-lg">
        <p role="status">
          Collections are read only here until this source is qualified for retained writes. {ui.error}
        </p>
        {ui.snapshot?.roots
          .filter((root) => root.unavailable)
          .map((root) => (
            <p role="status" key={root.canonical.collection.id}>
              {root.canonical.collection.name}: owner link unavailable. Its contents remain retained.
            </p>
          ))}
      </div>
    );
  return <CollectionToolsOwner key={ui.lifetime} />;
}
function canMaterialize(snapshot: ReturnType<typeof useFamilyCollectionUI>['snapshot'], selected: number | null) {
  const item = snapshot?.items.find((row) => row.native.id === selected),
    root = snapshot?.roots.find((row) => row.canonical.collection.id === item?.canonical.collection_id);
  return Boolean(root?.canonical.can_edit_items && item?.canonical.content_mode === 'reference');
}
function CollectionToolsOwner() {
  const labelId = useId();
  const ui = useFamilyCollectionUI(),
    active = useCollectionStore((s) => s.activeId),
    selected = useCollectionStore((s) => s.selectedPlaceId);
  const [open, setOpen] = useState(false),
    [target, setTarget] = useState<string | null>(null),
    [session, setSession] = useState<CollectionCommandSession | null>(null),
    [options, setOptions] = useState<Array<{ id: string; name: string }>>([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [order, setOrder] = useState<Awaited<ReturnType<CollectionCohort['openOrder']>> | null>(null),
    [ordered, setOrdered] = useState<number[]>([]);
  const generation = useRef(0);
  const flight = useRef<{ epoch: number } | null>(null);
  const acceptRoots = useEffectEvent((cohort: CollectionCohort, roots: Array<{ id: string; name: string }>) => {
    setOptions(roots);
    const opened = typeof active === 'number' ? cohort.parent(active) : null;
    const next =
      opened && roots.some((row) => row.id === opened)
        ? opened
        : target && roots.some((row) => row.id === target)
          ? target
          : (roots[0]?.id ?? null);
    setTarget(next);
    setSession(next ? cohort.commands(next) : null);
  });
  useEffect(() => {
    if (!open) return;
    const seq = generation.current;
    let live = true;
    void (async () => {
      const cohort = await getFamilyCollectionCohort();
      const index = await cohort.library();
      const roots = index.collections.map((r) => ({
        id: r.canonical.collection.id,
        name: r.canonical.collection.name,
      }));
      let cursor = null as Parameters<CollectionCohort['deletedRoots']>[0];
      do {
        const page = await cohort.deletedRoots(cursor);
        cohort.assertCurrent();
        roots.push(...page.items.map((row) => ({ id: row.id, name: 'Deleted Collection ' + row.id })));
        cursor = page.next_cursor;
        if (roots.length > 1000)
          throw Error('Choose a more specific recovery target; the Collection view reached its bound.');
      } while (cursor);
      if (!live || generation.current !== seq) return;
      acceptRoots(cohort, roots);
    })().catch((e) => {
      if (live && generation.current === seq) setMessage(e instanceof Error ? e.message : 'Recovery unavailable.');
    });
    return () => {
      live = false;
    };
  }, [open, active, ui.lifetime]);
  if (!ui.family) return null;
  const run = async (work: (cohort: CollectionCohort, assertCurrent: () => void) => Promise<void>) => {
    const seq = generation.current;
    if (flight.current?.epoch === seq) return;
    const ticket = { epoch: seq };
    flight.current = ticket;
    const check = () => {
      if (generation.current !== seq) throw Error('The Collection tools were closed. Original work is retained.');
    };
    setBusy(true);
    setMessage('');
    try {
      const cohort = await getFamilyCollectionCohort();
      check();
      await work(cohort, check);
      cohort.assertCurrent();
      if (seq === generation.current) setMessage('Collection change confirmed.');
    } catch (e) {
      if (seq === generation.current)
        setMessage(e instanceof Error ? e.message : 'The change was not confirmed. Original work is retained.');
    } finally {
      if (flight.current === ticket) flight.current = null;
      if (seq === generation.current) setBusy(false);
    }
  };
  const currentRoot = ui.snapshot?.roots.find((row) => row.native?.id === active),
    materializable = canMaterialize(ui.snapshot, selected);
  return (
    <>
      <div
        className="fixed bottom-20 end-4 z-[var(--z-nav)] max-w-sm rounded-xl bg-surface-card p-2 shadow-lg"
        aria-label="Family Collection status"
      >
        {ui.error && <p role="alert">{ui.error}</p>}
        {ui.snapshot?.roots
          .filter((r) => r.unavailable)
          .map((r) => (
            <p role="status" key={r.canonical.collection.id}>
              {r.canonical.collection.name}: owner link unavailable. Its contents remain retained.
            </p>
          ))}
        <DialogButton onClick={() => setOpen(true)}>Collection recovery and saved items</DialogButton>
      </div>
      <DialogShell
        labelledBy={labelId}
        open={open}
        onClose={() => {
          generation.current++;
          order?.retire();
          setOrder(null);
          setBusy(false);
          setOpen(false);
        }}
        width="detail"
        header={
          <DialogHeader
            tile={<DialogTile>↺</DialogTile>}
            tint={NEUTRAL_TINT}
            labelId={labelId}
            title="Collection recovery and saved items"
            onClose={() => {
              generation.current++;
              order?.retire();
              setOrder(null);
              setBusy(false);
              setOpen(false);
            }}
          />
        }
      >
        <p>
          Supported: saved catalog references, snapshots, manual items, item editing, status, ordering, Trash and
          Restore. Sharing, labels, ratings, list metadata, imports and Trip transfers are not connected yet.
        </p>
        <DialogButton
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await useCollectionStore.getState().loadAll();
              await useCollectionStore.getState().refreshActive();
            })
          }
        >
          Reload Collection contents
        </DialogButton>
        {message && <p role="status">{message}</p>}
        <label>
          Recovery Collection
          <select
            className="w-full rounded-lg border border-edge bg-surface-card px-3 py-2"
            aria-label="Recovery Collection"
            value={target ?? ''}
            onChange={(e) => {
              const id = e.target.value;
              void run(async (cohort) => {
                order?.retire();
                setOrder(null);
                setTarget(id);
                setSession(cohort.commands(id));
              });
            }}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {typeof active === 'number' && (
          <div>
            <DialogButton
              disabled={busy || !currentRoot?.canonical.can_admin}
              onClick={() =>
                void run(async (cohort, check) => {
                  await cohort.trashRoot(active, check);
                  await cohort.library();
                })
              }
            >
              Move Collection to Trash
            </DialogButton>
            <DialogButton
              disabled={busy || !currentRoot?.canonical.can_edit_items}
              onClick={() =>
                void run(async (cohort, check) => {
                  const next = await cohort.openOrder(active, check);
                  setOrder(next);
                  setOrdered(next.initial.map((row) => row.native.id));
                })
              }
            >
              Edit saved item order
            </DialogButton>
          </div>
        )}
        {selected !== null && (
          <DialogButton
            disabled={busy || !materializable}
            onClick={() =>
              void run(async (cohort, check) => {
                const editor = await cohort.editor(selected, check);
                try {
                  await editor.materialize();
                } finally {
                  editor.retire();
                }
              })
            }
          >
            Keep selected catalog item as snapshot
          </DialogButton>
        )}
        {order && (
          <section aria-label="Saved item order">
            {ordered.map((id, index) => (
              <div key={id}>
                {order.initial.find((row) => row.native.id === id)?.native.name}
                <button
                  type="button"
                  disabled={busy || index === 0}
                  aria-label={
                    'Move ' + (order.initial.find((row) => row.native.id === id)?.native.name ?? 'item') + ' up'
                  }
                  onClick={() =>
                    setOrdered((rows) => {
                      const next = [...rows];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      return next;
                    })
                  }
                >
                  ↑
                </button>
              </div>
            ))}
            <DialogButton
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await order.save(ordered);
                  order.retire();
                  setOrder(null);
                })
              }
            >
              Save item order
            </DialogButton>
          </section>
        )}
        {session ? (
          <FamilyCollectionRecovery
            session={session}
            onSettled={async () => {
              ui.owner?.assertCurrent();
              await ui.owner?.library();
            }}
          />
        ) : (
          <p>No recoverable Collection is available in this account.</p>
        )}
      </DialogShell>
    </>
  );
}
