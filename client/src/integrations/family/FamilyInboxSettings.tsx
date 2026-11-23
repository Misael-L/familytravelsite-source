import { Link } from 'react-router';
import { useTranslation } from '../../i18n';

export default function FamilyInboxSettings() {
  const { t } = useTranslation();

  return (
    <div className="space-y-2 text-body">
      <p className="text-content-secondary">{t('settings.familyNotifications.inAppMandatory')}</p>
      <Link className="inline-flex text-accent underline" to="/notifications">
        {t('notifications.showAll')}
      </Link>
    </div>
  );
}
