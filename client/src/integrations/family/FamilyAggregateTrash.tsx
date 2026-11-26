import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api/client';
import { fs } from '../../components/shared/DialogShell';
import Modal from '../../components/shared/Modal';
import { useTranslation } from '../../i18n';
import { coreHttpsPlannerPackingProfileEnabled } from './coreHttpsPlannerPackingProfile';
import { primaryCoreMode } from './corePrimaryProfile';
import { isFamilyFrontendActive } from './runtime';

function failed(e: unknown) {
  const failure = e as { response?: { data?: { error?: string } }; message?: string };
  return failure.response?.data?.error ?? failure.message ?? 'files.toast.restoreError';
}

/** Shared desktop/phone Family action; the native index remains unchanged. */
type Page = {
  available?: boolean;
  has_more: boolean;
  next_cursor: { id: number; deleted_at: string } | null;
  journeys?: Item[];
  trips?: Item[];
};
type Item = { id: number; title: string; revision: number };
export function FamilyTripTrash({ onRestored, className, showLabel = false }: {
  onRestored: () => Promise<void>;
  className: string;
  showLabel?: boolean;
}) {
  if (!isFamilyFrontendActive()) return null;
  const mode = primaryCoreMode();
  if (mode === 'blocked' || (!mode && coreHttpsPlannerPackingProfileEnabled())) return null;
  return <FamilyAggregateTrash domain="trips" onRestored={onRestored} triggerClassName={className}
    showLabel={showLabel} readOnly={mode === 'read'} />;
}

export function FamilyAggregateTrash({
  domain,
  onRestored,
  triggerClassName,
  showLabel = false,
  readOnly = false,
}: {
  domain: 'journeys' | 'trips';
  onRestored: () => Promise<void>;
  triggerClassName?: string;
  showLabel?: boolean;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState<Page | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const title = `${domain === 'journeys' ? t('journey.title') : t('dashboard.title')} · ${t('files.trash')}`;

  const refresh = useCallback(
    async (before?: Page['next_cursor']) => {
      const request = generation.current;
      const result = await api.get<Page>(`/${domain}/recovery`, {
        params: before ? { before_id: before.id, before_deleted_at: before.deleted_at } : {},
      });
      if (request === generation.current) {
        setPage((previous) => ({
          ...result.data,
          [domain]: before ? [...(previous?.[domain] ?? []), ...(result.data[domain] ?? [])] : result.data[domain],
        }));
      }
    },
    [domain]
  );

  useEffect(() => {
    const request = ++generation.current;
    void refresh().catch((e: unknown) => {
      if (request === generation.current) setError(failed(e));
    });
    return () => {
      generation.current += 1;
    };
  }, [refresh]);

  async function run(action: () => Promise<void>) {
    const request = generation.current;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      if (request === generation.current) setError(failed(e));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }

  if (page?.available === false || (!page && !error)) return null;
  return (
    <>
      <button
        type="button"
        className={triggerClassName ?? 'fixed bottom-20 end-4 z-40 rounded-full bg-surface-card px-4 py-2 text-content shadow-lg ring-1 ring-edge-faint'}
        style={triggerClassName ? undefined : fs(13, 'body')}
        aria-label={title}
        title={triggerClassName ? t('files.trash') : undefined}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          void run(() => refresh());
        }}
      >
        <Trash2 className={triggerClassName ? undefined : 'me-2 inline'} size={16} aria-hidden />
        {triggerClassName ? showLabel && t('files.trash') : title}
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={title} size="xl">
        <div className="space-y-4 p-4" aria-busy={busy}>
          {error && <p role="alert">{error === 'files.toast.restoreError' ? t(error) : error}</p>}
          {page?.[domain]?.length === 0 && !busy && !error && <p>{t('files.trashEmpty')}</p>}
          <ul className="space-y-3">
            {page?.[domain]?.map((journey) => (
              <li key={journey.id} className="flex items-center justify-between gap-4">
                <span>{journey.title}</span>
                {!readOnly && <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void run(async () => {
                      const request = generation.current;
                      await api.post(`/${domain}/${journey.id}/restore`, { expected_revision: journey.revision });
                      if (request !== generation.current) return;
                      await onRestored();
                      if (request === generation.current) await refresh();
                    });
                  }}
                >
                  {t('files.restore')}
                </button>}
              </li>
            ))}
          </ul>
          {page?.has_more && page.next_cursor && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void run(() => refresh(page.next_cursor));
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
