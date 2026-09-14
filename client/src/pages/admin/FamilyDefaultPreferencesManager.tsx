import React from 'react'
import { Settings2 } from 'lucide-react'
import CustomSelect from '../../components/shared/CustomSelect'
import { SYMBOLS, currenciesWith } from '../../components/Budget/BudgetPanel.constants'
import { useTranslation } from '../../i18n'
import { useFamilyDefaultPreferences } from './useFamilyDefaultPreferences'
import type { PreferenceFields } from '../../data/supabase/familyPreferences'

function OptionRow({
  label,
  hint,
  children,
}: {
  label: React.ReactNode
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2 text-content-secondary">
        {label}
      </label>
      {hint && <p className="text-xs mb-2 text-content-faint">{hint}</p>}
      <div className="flex gap-3 flex-wrap">{children}</div>
    </div>
  )
}

function OptionButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-sm font-medium border-2 transition-colors disabled:opacity-40 ${
        active
          ? 'border-accent bg-surface-hover text-content'
          : 'border-edge bg-surface-card text-content'
      }`}
    >
      {children}
    </button>
  )
}

function ResetButton({
  isSet,
  disabled,
  onClick,
  label,
}: {
  isSet: boolean
  disabled?: boolean
  onClick: () => void
  label: string
}) {
  if (!isSet) return null
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-xs ml-2 text-content-faint underline bg-transparent border-none cursor-pointer disabled:opacity-40"
    >
      {label}
    </button>
  )
}

export default function FamilyDefaultPreferencesManager(): React.ReactElement {
  const { t } = useTranslation()
  const {
    defaults, canManage, loading, error, saving, reload, save, resetField,
  } = useFamilyDefaultPreferences()

  const isSet = (key: keyof PreferenceFields) => defaults[key] != null
  const readOnly = !canManage || saving

  if (loading) {
    return (
      <p className="text-content-faint italic p-4 text-sm">{t('common.loading')}</p>
    )
  }

  if (error) {
    return (
      <div className="bg-surface-card rounded-xl border border-edge p-5">
        <p className="text-sm text-danger">{error}</p>
        <button type="button" className="mt-3 text-sm underline text-content" onClick={() => void reload()}>
          {t('dashboard.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-surface-card rounded-xl border border-edge overflow-hidden">
      <div className="p-5 border-b border-edge flex items-start gap-3">
        <Settings2 size={18} className="text-content-muted mt-0.5" />
        <div>
          <h2 className="font-semibold text-content">{t('admin.familyDefaults.title')}</h2>
          <p className="text-xs text-content-muted mt-0.5">{t('admin.familyDefaults.subtitle')}</p>
          {!canManage && (
            <p className="text-xs text-content-faint mt-2">{t('admin.familyDefaults.readOnly')}</p>
          )}
        </div>
      </div>

      <div className="p-5 space-y-6">
        <OptionRow
          label={(
            <>
              {t('settings.temperature')}
              {canManage && (
                <ResetButton
                  isSet={isSet('temperatureUnit')}
                  disabled={saving}
                  onClick={() => void resetField('temperatureUnit')}
                  label={t('admin.familyDefaults.resetToBuiltIn')}
                />
              )}
            </>
          )}
        >
          {([
            { value: 'celsius', label: '°C Celsius' },
            { value: 'fahrenheit', label: '°F Fahrenheit' },
          ] as const).map(opt => (
            <OptionButton
              key={opt.value}
              active={defaults.temperatureUnit === opt.value}
              disabled={readOnly}
              onClick={() => void save({ temperatureUnit: opt.value })}
            >
              {opt.label}
            </OptionButton>
          ))}
        </OptionRow>

        <OptionRow
          label={(
            <>
              {t('settings.distance')}
              {canManage && (
                <ResetButton
                  isSet={isSet('distanceUnit')}
                  disabled={saving}
                  onClick={() => void resetField('distanceUnit')}
                  label={t('admin.familyDefaults.resetToBuiltIn')}
                />
              )}
            </>
          )}
        >
          {([
            { value: 'metric', label: 'km Metric' },
            { value: 'imperial', label: 'mi Imperial' },
          ] as const).map(opt => (
            <OptionButton
              key={opt.value}
              active={defaults.distanceUnit === opt.value}
              disabled={readOnly}
              onClick={() => void save({ distanceUnit: opt.value })}
            >
              {opt.label}
            </OptionButton>
          ))}
        </OptionRow>

        <OptionRow
          label={(
            <>
              {t('settings.timeFormat')}
              {canManage && (
                <ResetButton
                  isSet={isSet('timeFormat')}
                  disabled={saving}
                  onClick={() => void resetField('timeFormat')}
                  label={t('admin.familyDefaults.resetToBuiltIn')}
                />
              )}
            </>
          )}
        >
          {([
            { value: '24h', label: '24h (14:30)' },
            { value: '12h', label: '12h (2:30 PM)' },
          ] as const).map(opt => (
            <OptionButton
              key={opt.value}
              active={defaults.timeFormat === opt.value}
              disabled={readOnly}
              onClick={() => void save({ timeFormat: opt.value })}
            >
              {opt.label}
            </OptionButton>
          ))}
        </OptionRow>

        <div>
          <label className="block text-sm font-medium mb-1.5 text-content-secondary">
            {t('settings.currency')}
            {canManage && (
              <ResetButton
                isSet={isSet('displayCurrency')}
                disabled={saving}
                onClick={() => void resetField('displayCurrency')}
                label={t('admin.familyDefaults.resetToBuiltIn')}
              />
            )}
          </label>
          <CustomSelect
            value={defaults.displayCurrency || ''}
            onChange={(value: string) => {
              if (!canManage) return
              void save({ displayCurrency: value || null })
            }}
            placeholder={t('settings.currencyTrip')}
            searchable
            disabled={readOnly}
            options={[
              { value: '', label: t('settings.currencyTrip') },
              ...currenciesWith(defaults.displayCurrency || '').map(c => ({
                value: c,
                label: SYMBOLS[c] ? `${c}  ${SYMBOLS[c]}` : c,
              })),
            ]}
            size="sm"
            style={{ maxWidth: 240 }}
          />
          <p className="text-xs mt-1 text-content-faint">{t('admin.familyDefaults.currencyHint')}</p>
        </div>
      </div>
    </div>
  )
}
