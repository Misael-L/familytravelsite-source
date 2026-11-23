import { Settings2 } from 'lucide-react';
import React from 'react';
import { SYMBOLS, currenciesWith } from '../../components/Budget/BudgetPanel.constants';
import CustomSelect from '../../components/shared/CustomSelect';
import type { PreferenceFields } from '../../data/supabase/familyPreferences';
import { useTranslation } from '../../i18n';
import { useFamilyDefaultPreferences } from './useFamilyDefaultPreferences';

function OptionRow({ label, hint, children }: { label: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-body font-medium text-content-secondary">{label}</label>
      {hint && <p className="mb-2 text-caption text-content-faint">{hint}</p>}
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}

function OptionButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-[10px] border-2 px-5 py-2.5 text-body font-medium transition-colors disabled:opacity-40 ${
        active ? 'border-accent bg-surface-hover text-content' : 'border-edge bg-surface-card text-content'
      }`}
    >
      {children}
    </button>
  );
}

function ResetButton({
  isSet,
  disabled,
  onClick,
  label,
}: {
  isSet: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  if (!isSet) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ms-2 cursor-pointer border-none bg-transparent text-caption text-content-faint underline disabled:opacity-40"
    >
      {label}
    </button>
  );
}

export default function FamilyDefaultPreferencesManager(): React.ReactElement {
  const { t } = useTranslation();
  const { defaults, canManage, loading, error, saving, reload, save, resetField } = useFamilyDefaultPreferences();

  const isSet = (key: keyof PreferenceFields) => defaults[key] != null;
  const readOnly = !canManage || saving;

  if (loading) {
    return <p className="p-4 text-body italic text-content-faint">{t('common.loading')}</p>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-edge bg-surface-card p-5">
        <p className="text-body text-danger">{error}</p>
        <button type="button" className="mt-3 text-body text-content underline" onClick={() => void reload()}>
          {t('dashboard.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface-card">
      <div className="flex items-start gap-3 border-b border-edge p-5">
        <Settings2 size={18} className="mt-0.5 text-content-muted" />
        <div>
          <h2 className="font-semibold text-content">{t('admin.familyDefaults.title')}</h2>
          <p className="mt-0.5 text-caption text-content-muted">{t('admin.familyDefaults.subtitle')}</p>
          {!canManage && <p className="mt-2 text-caption text-content-faint">{t('admin.familyDefaults.readOnly')}</p>}
        </div>
      </div>

      <div className="space-y-6 p-5">
        <OptionRow
          label={
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
          }
        >
          {(
            [
              { value: 'celsius', label: '°C Celsius' },
              { value: 'fahrenheit', label: '°F Fahrenheit' },
            ] as const
          ).map((opt) => (
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
          label={
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
          }
        >
          {(
            [
              { value: 'metric', label: 'km Metric' },
              { value: 'imperial', label: 'mi Imperial' },
            ] as const
          ).map((opt) => (
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
          label={
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
          }
        >
          {(
            [
              { value: '24h', label: '24h (14:30)' },
              { value: '12h', label: '12h (2:30 PM)' },
            ] as const
          ).map((opt) => (
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
          <label className="mb-1.5 block text-body font-medium text-content-secondary">
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
              if (!canManage) return;
              void save({ displayCurrency: value || null });
            }}
            placeholder={t('settings.currencyTrip')}
            searchable
            disabled={readOnly}
            options={[
              { value: '', label: t('settings.currencyTrip') },
              ...currenciesWith(defaults.displayCurrency || '').map((c) => ({
                value: c,
                label: SYMBOLS[c] ? `${c}  ${SYMBOLS[c]}` : c,
              })),
            ]}
            size="sm"
            style={{ maxWidth: 240 }}
          />
          <p className="mt-1 text-caption text-content-faint">{t('admin.familyDefaults.currencyHint')}</p>
        </div>
      </div>
    </div>
  );
}
