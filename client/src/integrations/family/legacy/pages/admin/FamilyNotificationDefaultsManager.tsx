import { Bell } from 'lucide-react';
import React from 'react';
import ToggleSwitch from '../../components/Settings/ToggleSwitch';
import { useTranslation } from '../../i18n';
import { eventLabelKey } from './familyNotificationsModel';
import { useFamilyNotificationDefaults } from './useFamilyNotificationDefaults';

export default function FamilyNotificationDefaultsManager(): React.ReactElement {
  const { t } = useTranslation();
  const { snapshot, canManage, loading, error, saving, save } = useFamilyNotificationDefaults();

  if (loading) {
    return <p className="text-body text-content-muted">{t('common.loading')}</p>;
  }
  if (error) {
    return <p className="text-body text-danger">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-subtitle font-semibold text-content">
          <Bell className="h-5 w-5" />
          {t('admin.familyNotifications.title')}
        </h2>
        <p className="mt-1 text-body text-content-muted">{t('admin.familyNotifications.subtitle')}</p>
        {!canManage && (
          <p className="mt-2 text-caption text-content-faint">{t('admin.familyNotifications.readOnly')}</p>
        )}
      </div>

      <p className="text-body text-content-secondary">{t('admin.familyNotifications.inAppMandatory')}</p>
      <p className="text-body text-content-muted">
        {t('admin.familyNotifications.deviceHealth', {
          count: String(snapshot?.health.activeIosDevices ?? 0),
        })}
      </p>

      <div className="divide-y divide-edge rounded-xl border border-edge bg-surface-card">
        {(snapshot?.defaults ?? []).map((row) => {
          const eventLabel = t(eventLabelKey(row.eventKey));
          return (
            <div key={row.eventKey} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-body font-medium text-content">{eventLabel}</p>
                <p className="text-caption text-content-faint">
                  {row.source === 'family'
                    ? t('admin.familyNotifications.source.family')
                    : t('admin.familyNotifications.source.catalog')}
                </p>
              </div>
              {canManage ? (
                <ToggleSwitch
                  label={eventLabel}
                  on={row.pushEnabled}
                  onToggle={() => {
                    if (!canManage || saving) return;
                    void save({ [row.eventKey]: !row.pushEnabled });
                  }}
                />
              ) : (
                <span className="shrink-0 text-body text-content-secondary">
                  {row.pushEnabled ? t('settings.on') : t('settings.off')}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
