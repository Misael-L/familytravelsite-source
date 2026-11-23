import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Modal from '../../components/shared/Modal';
import { currentPlannerReadPort } from '../../repo/plannerReadPort';
import { currentPlannerStayWritePort } from '../../repo/plannerStayPort';
import { useTripStore } from '../../store/tripStore';
import type { Accommodation } from '../../types';
import type { nativeStayTrash } from './nativeStayContract';
import { nativeStayControlsAllowed } from './nativeStayControls';
import { useFamilyUiPermissions } from './uiPermissions';

type Page = ReturnType<typeof nativeStayTrash.parse>;
type Selection = { row: Accommodation; keep: boolean };
/** Confirmed content Trash is distinct from unresolved command recovery. Shared by desktop and phone. */
export function FamilyStayManagement() {
  const port = currentPlannerStayWritePort(),
    trip = useTripStore((s) => s.trip),
    controller = useFamilyUiPermissions((s) => s.controller);
  const [open, setOpen] = useState(false);
  const enabled = nativeStayControlsAllowed(),
    owner = useMemo(() => ({ port, trip, controller, enabled, open }), [port, trip, controller, enabled, open]);
  const current = useRef<typeof owner | null>(owner);
  const [state, setState] = useState<{
    owner: typeof owner;
    page?: Page;
    busy: boolean;
    error: string;
    selected?: Selection;
  } | null>(null);
  const view = state?.owner === owner ? state : { owner, busy: true, error: '', page: undefined, selected: undefined };
  useLayoutEffect(() => {
    current.current = owner;
    return () => {
      current.current = null;
    };
  }, [owner]);
  const trashPage = port?.trashPage,
    trash = port?.trash,
    restore = port?.restore;
  useEffect(() => {
    if (!open || !enabled || !trashPage || !trip) return;
    void trashPage(trip.id)
      .then((page) => {
        if (current.current === owner) setState({ owner, page, busy: false, error: '' });
      })
      .catch((e: unknown) => {
        if (current.current === owner) setState({ owner, busy: false, error: errorText(e) });
      });
  }, [open, enabled, trashPage, trip, owner]);
  if (!enabled || !trip || !trashPage || !trash || !restore) return null;
  const run = async (action: () => Promise<void>, more = false) => {
    if (current.current !== owner || view.busy) return;
    setState({ ...view, owner, busy: true, error: '' });
    try {
      await action();
      if (current.current !== owner) return;
      const page = await trashPage(trip.id, more ? view.page?.next_cursor : null);
      if (current.current === owner)
        setState({
          owner,
          busy: false,
          error: '',
          page: more && view.page ? { ...page, items: [...view.page.items, ...page.items] } : page,
        });
    } catch (e) {
      if (current.current === owner) setState({ ...view, owner, busy: false, error: errorText(e) });
    }
  };
  const selected = view.selected,
    active = currentPlannerReadPort()?.currentStays?.(trip.id)?.accommodations ?? [];
  return (
    <>
      <button
        type="button"
        className="fixed bottom-[calc(1rem+var(--bottom-nav-h,0px))] end-4 z-[var(--z-toast)] rounded-full border border-edge bg-surface-card px-3 py-2 text-content shadow-lg"
        onClick={() => setOpen(true)}
      >
        Lodgings · Trash
      </button>
      <Modal
        isOpen={open}
        onClose={() => {
          setOpen(false);
          setState(null);
        }}
        title="Lodgings"
      >
        <div className="space-y-4 p-4" aria-busy={view.busy}>
          <ManagementRows
            active={active}
            page={view.page}
            busy={view.busy}
            error={view.error}
            select={(choice) => setState({ ...view, owner, busy: false, error: '', selected: choice })}
            reload={() => {
              void run(async () => {});
            }}
            more={() => {
              void run(async () => {}, true);
            }}
            restore={(row) => {
              void run(() => restore(trip.id, row));
            }}
          />
          {selected && (
            <RemovalConfirmation
              selected={selected}
              busy={view.busy}
              confirm={() => {
                void run(() => trash(trip.id, selected.row.id, selected.keep, selected.row).then(() => {}));
              }}
              cancel={() => setState({ ...view, owner, busy: false, error: '', selected: undefined })}
            />
          )}
        </div>
      </Modal>
    </>
  );
}
function ManagementRows({
  active,
  page,
  busy,
  error,
  select,
  reload,
  more,
  restore,
}: {
  active: Accommodation[];
  page: Page | undefined;
  busy: boolean;
  error: string;
  select: (s: Selection) => void;
  reload: () => void;
  more: () => void;
  restore: (r: Page['items'][number]) => void;
}) {
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={reload}>
        Reload
      </button>
      <h3>Active lodgings</h3>
      <ul>
        {active.map((row) => (
          <li key={row.id} className="space-y-2 py-2">
            <span>{row.place_name}</span>
            <button type="button" disabled={busy} onClick={() => select({ row, keep: false })}>
              Move lodging to Trash
            </button>
            <button type="button" disabled={busy} onClick={() => select({ row, keep: true })}>
              Keep arrival and move lodging to Trash
            </button>
          </li>
        ))}
      </ul>
      <h3>Trash</h3>
      {page?.items.length === 0 && <p>No lodgings in Trash.</p>}
      <ul>
        {page?.items.map((row) => (
          <li key={row.id} className="space-y-2 py-2">
            <span>
              {row.name} · {row.arrival_date} – {row.departure_date}
            </span>
            {!row.restore_available && (
              <p>This lodging is unavailable. Restore its source before restoring the stay.</p>
            )}
            <button type="button" disabled={busy || !row.restore_available} onClick={() => restore(row)}>
              Restore lodging
            </button>
          </li>
        ))}
      </ul>
      {page?.has_more && (
        <button type="button" disabled={busy} onClick={more}>
          Show more
        </button>
      )}
    </>
  );
}
function RemovalConfirmation({
  selected,
  busy,
  confirm,
  cancel,
}: {
  selected: Selection;
  busy: boolean;
  confirm: () => void;
  cancel: () => void;
}) {
  return (
    <div role="group" aria-label="Confirm lodging removal" className="space-y-2">
      <p>
        {selected.row.place_name}:{' '}
        {selected.keep
          ? 'Keep the arrival in the plan and move this lodging to Trash?'
          : 'Move this lodging and its own arrival to Trash? Shared arrivals and bookings are kept.'}
      </p>
      <button type="button" disabled={busy} onClick={confirm}>
        Confirm move to Trash
      </button>
      <button type="button" disabled={busy} onClick={cancel}>
        Cancel
      </button>
    </div>
  );
}
function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Lodgings could not be loaded. Try again.';
}
