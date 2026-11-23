import { useCallback, useEffect, useRef, useState } from 'react';
import { usePackingSnapshot } from '../../components/Packing/usePackingSnapshot';
import Modal from '../../components/shared/Modal';
import { hasReadOnlySession } from '../../db/readOnlySession';
import { useTranslation } from '../../i18n';
import { currentPlannerPackingPort, type PlannerPackingPort } from '../../repo/plannerPackingPort';
import { useCanDo } from '../../store/permissionsStore';
import { useTripStore } from '../../store/tripStore';
import { FamilyPackingPending } from './FamilyPackingPending';
import type { PackingCategoryTrashPage } from './packingAggregateTrash';
import type { PackingBagTrashPage } from './packingBagContract';
import type { PackingTrashPage } from './packingContract';

type OwnedPages = {
  port: PlannerPackingPort;
  trip: number | string;
  pages: PackingTrashPage[];
  categoryPages: PackingCategoryTrashPage[];
  bagPages: PackingBagTrashPage[];
};
function matchingPages(owned: OwnedPages | null, port: PlannerPackingPort | null, trip?: number | string) {
  return owned && owned.port === port && owned.trip === trip ? owned.pages : [];
}
async function readPackingTrash(port: PlannerPackingPort | null) {
  if (!port) throw Error('Packing view ended');
  const [page, categories, bags] = await Promise.all([
    port.trashPage(),
    port.categoryAggregateMode?.() && port.categoryBatchPage ? port.categoryBatchPage() : null,
    port.bags ? port.bags.trashPage() : null,
  ]);
  return { pages: [page], categoryPages: categories ? [categories] : [], bagPages: bags ? [bags] : [] };
}
function ownedCategoryPages(
  owned: OwnedPages | null,
  port: PlannerPackingPort | null,
  trip: number | string | undefined
) {
  return owned && owned.port === port && owned.trip === trip ? owned.categoryPages : [];
}
function trashAllowed(port: PlannerPackingPort | null, view: unknown, trip: unknown, authorized: boolean) {
  return !hasReadOnlySession() && !!port && !!view && !!trip && authorized;
}
function ownedBagPages(owned: OwnedPages | null, port: PlannerPackingPort | null, tripId: number | string | undefined) {
  return owned && owned.port === port && owned.trip === tripId ? owned.bagPages : [];
}

function packingTrashIsEmpty(
  pages: PackingTrashPage[],
  categoryPages: PackingCategoryTrashPage[],
  bagPages: PackingBagTrashPage[]
) {
  return (
    pages.length > 0 &&
    !categoryPages.some((p) => p.observations.length) &&
    pages.every((page) => page.items.length === 0) &&
    bagPages.every((page) => page.bags.length === 0)
  );
}

function packingTrashBagCursor(bagPages: PackingBagTrashPage[]) {
  return bagPages[bagPages.length - 1]?.next_cursor;
}

/** Keep each original page with its rows; a merged display object is not a Restore observation. */
export function FamilyPackingTrash() {
  const trip = useTripStore((s) => s.trip),
    can = useCanDo(),
    { t } = useTranslation();
  const { port, view } = usePackingSnapshot(trip?.id ?? '');
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [owned, setOwned] = useState<OwnedPages | null>(null);
  const tripId = trip?.id;
  const generation = useRef(0),
    flight = useRef(false);
  const enabled = trashAllowed(port, view, trip, can('packing_edit', trip));
  const pages = matchingPages(owned, port, tripId);
  const categoryPages = ownedCategoryPages(owned, port, tripId);
  const bagPages = ownedBagPages(owned, port, tripId);
  const grouped = new Set(categoryPages.flatMap((p) => p.observations.flatMap((o) => o.items.map((r) => r.id))));
  const categoriesIncomplete = !!categoryPages[categoryPages.length - 1]?.listing.next_cursor;
  const load = useCallback(() => readPackingTrash(port), [port]);
  useEffect(() => {
    const token = ++generation.current;
    if (open && enabled && port && tripId !== undefined) {
      flight.current = true;
      void load()
        .then((result) => {
          if (token === generation.current && currentPlannerPackingPort() === port)
            setOwned({ port, trip: tripId, ...result });
        })
        .catch((e) => {
          if (token === generation.current) setError(e instanceof Error ? e.message : 'Packing Trash could not load.');
        })
        .finally(() => {
          if (token === generation.current) {
            flight.current = false;
            setBusy(false);
          }
        });
    }
    return () => {
      generation.current = token + 1;
      flight.current = false;
    };
  }, [port, tripId, open, enabled, load]);
  if (!enabled || !port || !trip) return null;
  const run = async (work: (current: () => boolean) => Promise<void>) => {
    if (flight.current) return;
    const token = generation.current;
    const current = () =>
      token === generation.current && currentPlannerPackingPort() === port && port.snapshot() !== null;
    if (!current()) return;
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      await work(current);
    } catch (e) {
      if (current()) {
        setError(e instanceof Error ? e.message : t('common.error'));
      }
    } finally {
      if (current()) {
        flight.current = false;
        setBusy(false);
      }
    }
  };
  const refresh = async (current: () => boolean, more = false) => {
    const previous = more ? pages[pages.length - 1] : null;
    if (more) {
      const result = await port.trashPage(previous);
      if (current()) setOwned({ port, trip: trip.id, pages: [...pages, result], categoryPages, bagPages });
    } else {
      const result = await load();
      if (current()) setOwned({ port, trip: trip.id, ...result });
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setBusy(true);
          setError('');
          setMessage('');
          setOwned(null);
          setOpen(true);
        }}
        className="rounded-full px-3 py-2 text-content-muted"
      >
        {t('todo.subtab.packing')} · {t('files.trash')}
      </button>
      <Modal
        isOpen={open}
        onClose={() => {
          generation.current++;
          flight.current = false;
          setOpen(false);
        }}
        title={`${t('todo.subtab.packing')} · ${t('files.trash')}`}
      >
        <div className="space-y-4 p-4" aria-busy={busy}>
          {(error || port.terminalRecoveryMode?.()) && (
            <>
              {error && <p role="alert">{error}</p>}
              <FamilyPackingPending
                key={error}
                port={port}
                trip={trip.id}
                updated={async () => {
                  const result = await load();
                  setOwned({ port, trip: trip.id, ...result });
                  setError('');
                }}
              />
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void run(async (current) => {
                const result = await port.reconcile();
                if (!current()) return;
                setMessage(
                  result === 'committed'
                    ? 'The original packing save is confirmed.'
                    : result === 'unknown'
                      ? 'The original save is still unresolved. It has been retained unchanged.'
                      : 'No retained packing save was found.'
                );
                if (result !== 'unknown') await refresh(current);
              });
            }}
          >
            Check retained packing save
          </button>
          {message && <p role="status">{message}</p>}
          {error && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void run((current) => refresh(current));
              }}
            >
              {t('common.errorRetry')}
            </button>
          )}
          {packingTrashIsEmpty(pages, categoryPages, bagPages) && <p>{t('files.trashEmpty')}</p>}
          <ul>
            {bagPages.flatMap((page) =>
              page.bags.map((o, index) => (
                <li key={'bag:' + o.bag.id} className="flex items-center justify-between gap-4">
                  <span>Bag · {o.bag.name}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async (current) => {
                        if (!port.bags) throw Error('Bag recovery unavailable');
                        await port.bags.restore(page, index);
                        if (current()) await refresh(current);
                      })
                    }
                  >
                    {t('files.restore')}
                  </button>
                </li>
              ))
            )}

            {categoryPages.flatMap((page) =>
              page.observations.map((row, index) => (
                <li key={row.category.id} className="flex items-center justify-between gap-4">
                  <span>
                    {row.category.name || t('packing.defaultCategory')} · {row.items.length}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void run(async (current) => {
                        if (!port.restoreCategoryBatch) throw Error('Category recovery unavailable');
                        await port.restoreCategoryBatch(page, index);
                        if (current()) await refresh(current);
                      });
                    }}
                  >
                    {t('files.restore')}
                  </button>
                </li>
              ))
            )}
            {!categoriesIncomplete &&
              pages.flatMap((page) =>
                page.items
                  .filter((row) => !grouped.has(row.id))
                  .map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-4">
                      <span>{row.name}</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          void run(async (current) => {
                            await port.restore(page, row);
                            if (current()) await refresh(current);
                          });
                        }}
                      >
                        {t('files.restore')}
                      </button>
                    </li>
                  ))
              )}
          </ul>
          {categoriesIncomplete && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void run(async (current) => {
                  const prior = categoryPages[categoryPages.length - 1];
                  if (!prior || !port.categoryBatchPage) return;
                  const page = await port.categoryBatchPage(prior);
                  if (current())
                    setOwned({ port, trip: trip.id, pages, categoryPages: [...categoryPages, page], bagPages });
                });
              }}
            >
              {t('common.showMore')} · {t('packing.title')}
            </button>
          )}
          {packingTrashBagCursor(bagPages) && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async (current) => {
                  const last = bagPages[bagPages.length - 1];
                  if (!last || !port.bags) return;
                  const p = await port.bags.trashPage(last);
                  if (current()) setOwned({ port, trip: trip.id, pages, categoryPages, bagPages: [...bagPages, p] });
                })
              }
            >
              More bags
            </button>
          )}
          {pages[pages.length - 1]?.next_cursor && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void run((current) => refresh(current, true));
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
