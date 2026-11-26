import { RefreshCw } from 'lucide-react';
import { useFamilyController } from './controllerContext';
import { useTranslation } from './legacy/i18n';

/** Retry for a partial trip read. Callers place it; this component is not fixed. */
export function FamilyPartialLoadBanner() {
  const controller = useFamilyController();
  const { t } = useTranslation();
  if (!controller?.partialLoad.failed) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-xl border border-edge bg-surface-card px-3 py-2 text-content"
    >
      <span className="min-w-0 flex-1 text-caption">{t('trip.load.partialBanner')}</span>
      <button
        type="button"
        onClick={controller.partialLoad.retry}
        className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-caption text-accent-text"
      >
        <RefreshCw size={13} />
        {t('trip.load.retry')}
      </button>
    </div>
  );
}
