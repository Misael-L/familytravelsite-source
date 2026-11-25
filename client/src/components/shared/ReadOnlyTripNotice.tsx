import { useTranslation } from '../../i18n';
/** A recent saved Trip grants reading only; it is not a current session or a complete download. */
export default function ReadOnlyTripNotice() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-3 z-[var(--z-toast)] flex justify-center px-3"
    >
      <span className="rounded-lg bg-surface-card px-3 py-1 text-caption text-content shadow">
        {t('settings.tabs.offline')} · {t('vacay.viewOnly')}
      </span>
    </div>
  );
}
