import React, { useCallback, useEffect, useState } from 'react'
import ToggleSwitch from './ToggleSwitch'
import { useTranslation } from '../../i18n'
import { useToast } from '../shared/Toast'
import { useAuthStore } from '../../store/authStore'
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
  type MemberNotificationPreferences,
} from '../../data/supabase/familyNotifications'
import { eventLabelKey } from '../../pages/admin/familyNotificationsModel'

export default function FamilyNotificationPreferencesPanel(): React.ReactElement {
  const { t } = useTranslation()
  const toast = useToast()
  const familyId = useAuthStore(s => s.familyId)
  const authGate = useAuthStore(s => s.authGate)
  const [snapshot, setSnapshot] = useState<MemberNotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!familyId || authGate !== 'ok') {
      setSnapshot(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setSnapshot(await getMyNotificationPreferences(familyId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.familyNotifications.loadError'))
    } finally {
      setLoading(false)
    }
  }, [familyId, authGate, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const patch = async (eventKey: string, value: boolean | null) => {
    if (!familyId || saving) return
    setSaving(true)
    try {
      setSnapshot(await updateMyNotificationPreferences(familyId, { [eventKey]: value }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.familyNotifications.saveError'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-content-muted">{t('common.loading')}</p>
  if (error) return <p className="text-sm text-red-500">{error}</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-content-secondary">{t('settings.familyNotifications.inAppMandatory')}</p>
      <p className="text-xs text-content-faint">{t('settings.familyNotifications.pushHint')}</p>
      <div className="rounded-xl border border-edge divide-y divide-edge">
        {(snapshot?.events ?? []).map(row => (
          <div key={row.eventKey} className="px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-content">{t(eventLabelKey(row.eventKey))}</p>
                <p className="text-xs text-content-faint">
                  {row.source === 'member'
                    ? t('settings.preference.source.member')
                    : row.source === 'family'
                      ? t('settings.preference.source.family')
                      : t('settings.preference.source.catalog')}
                </p>
              </div>
              <ToggleSwitch
                on={row.pushEnabled}
                onToggle={() => { void patch(row.eventKey, !row.pushEnabled) }}
              />
            </div>
            {row.source === 'member' && (
              <button
                type="button"
                className="mt-2 text-xs text-content-faint underline bg-transparent border-none cursor-pointer"
                onClick={() => { void patch(row.eventKey, null) }}
              >
                {t('settings.preference.useFamilyDefault')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
