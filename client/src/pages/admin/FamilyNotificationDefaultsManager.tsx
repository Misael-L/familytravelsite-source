import React from 'react'
import { Bell } from 'lucide-react'
import ToggleSwitch from '../../components/Settings/ToggleSwitch'
import { useTranslation } from '../../i18n'
import { useFamilyNotificationDefaults } from './useFamilyNotificationDefaults'
import { eventLabelKey } from './familyNotificationsModel'

export default function FamilyNotificationDefaultsManager(): React.ReactElement {
  const { t } = useTranslation()
  const { snapshot, canManage, loading, error, saving, save } = useFamilyNotificationDefaults()

  if (loading) {
    return <p className="text-sm text-content-muted">{t('common.loading')}</p>
  }
  if (error) {
    return <p className="text-sm text-red-500">{error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-content flex items-center gap-2">
          <Bell className="w-5 h-5" />
          {t('admin.familyNotifications.title')}
        </h2>
        <p className="text-sm mt-1 text-content-muted">{t('admin.familyNotifications.subtitle')}</p>
        {!canManage && (
          <p className="text-xs mt-2 text-content-faint">{t('admin.familyNotifications.readOnly')}</p>
        )}
      </div>

      <p className="text-sm text-content-secondary">{t('admin.familyNotifications.inAppMandatory')}</p>
      <p className="text-sm text-content-muted">
        {t('admin.familyNotifications.deviceHealth', {
          count: String(snapshot?.health.activeIosDevices ?? 0),
        })}
      </p>

      <div className="rounded-xl border border-edge divide-y divide-edge bg-surface-card">
        {(snapshot?.defaults ?? []).map(row => (
          <div key={row.eventKey} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-content">{t(eventLabelKey(row.eventKey))}</p>
              <p className="text-xs text-content-faint">
                {row.source === 'family'
                  ? t('admin.familyNotifications.source.family')
                  : t('admin.familyNotifications.source.catalog')}
              </p>
            </div>
            <ToggleSwitch
              on={row.pushEnabled}
              onToggle={() => {
                if (!canManage || saving) return
                void save({ [row.eventKey]: !row.pushEnabled })
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
