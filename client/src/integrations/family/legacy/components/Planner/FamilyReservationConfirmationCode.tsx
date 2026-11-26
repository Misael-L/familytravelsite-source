import { useTranslation } from '../../i18n';
import { useToast } from '../shared/Toast';
import { BOX } from './bookings/bookingPresentation';

export function FamilyReservationConfirmationCode({ code }: { code: string | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  if (!code) return null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('common.unknownError'));
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-caption font-semibold uppercase tracking-[0.03em] text-content-faint">
          {t('reservations.confirmationCode')}
        </div>
        <div className={`${BOX} px-3 py-2 font-semibold text-content`}>{code}</div>
      </div>
      <button
        type="button"
        onClick={() => {
          void copyCode();
        }}
        className="rounded-[10px] border border-edge bg-surface-card px-3 py-2 text-content"
      >
        {t('common.copy')}
      </button>
    </div>
  );
}
