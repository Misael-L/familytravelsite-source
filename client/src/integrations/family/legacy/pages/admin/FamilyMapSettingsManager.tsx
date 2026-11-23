import { Eye, EyeOff, Map } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { FAMILY_MAP_OPTIONS, optionIsUsable, type FamilyMapOptionId } from '../../components/Map/mapRegistry';
import { renderFromOption } from '../../components/Map/resolveMapRender';
import FamilyMapPreview from '../../components/Settings/FamilyMapPreview';
import { useTranslation } from '../../i18n';
import { useFamilyMapSettings } from './useFamilyMapSettings';

function CredentialField({
  label,
  hint,
  configured,
  canManage,
  disabled,
  onReplace,
  onClear,
}: {
  label: string;
  hint: React.ReactNode;
  configured: boolean;
  canManage: boolean;
  disabled: boolean;
  onReplace: (value: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onReplace(trimmed);
    setDraft('');
    setEditing(false);
    setReveal(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-body font-medium text-content-secondary">{label}</label>
        <span className="text-caption text-content-faint">
          {configured ? t('admin.familyMaps.configured') : t('admin.familyMaps.notConfigured')}
        </span>
      </div>
      <p className="text-caption text-content-faint">{hint}</p>
      {canManage && !editing && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setEditing(true)}
            className="rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-body text-content disabled:opacity-40"
          >
            {configured ? t('admin.familyMaps.replace') : t('admin.familyMaps.add')}
          </button>
          {configured && (
            <button
              type="button"
              disabled={disabled}
              onClick={onClear}
              className="rounded-lg border border-edge px-3 py-1.5 text-body text-danger disabled:opacity-40"
            >
              {t('admin.familyMaps.clear')}
            </button>
          )}
        </div>
      )}
      {canManage && editing && (
        <div className="flex items-center gap-2">
          <input
            type={reveal ? 'text' : 'password'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-lg border border-edge bg-surface-card px-3 py-2 font-mono text-body text-content"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="rounded-lg border border-edge p-2 text-content-muted"
            aria-label={reveal ? t('admin.familyMaps.hideCredential') : t('admin.familyMaps.revealCredential')}
          >
            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            type="button"
            disabled={disabled || !draft.trim()}
            onClick={commit}
            className="rounded-lg bg-inverse px-3 py-1.5 text-body text-inverse-text disabled:opacity-40"
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft('');
              setReveal(false);
            }}
            className="rounded-lg border border-edge px-3 py-1.5 text-body"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function FamilyMapSettingsManager(): React.ReactElement {
  const { t } = useTranslation();
  const { scope, snapshot, canManage, loading, error, saving, reload, save } = useFamilyMapSettings();
  const readOnly = !canManage || saving;

  const credentials = useMemo(
    () => ({
      mapbox: snapshot.mapboxPublicToken,
      carto: snapshot.cartoApiKey,
    }),
    [snapshot.mapboxPublicToken, snapshot.cartoApiKey]
  );

  const preview = useMemo(() => {
    const option = FAMILY_MAP_OPTIONS.find((o) => o.id === snapshot.defaultOptionId);
    if (!option) return null;
    return renderFromOption(option, credentials, 'family', snapshot.credentialRevision);
  }, [snapshot.defaultOptionId, credentials, snapshot.credentialRevision]);

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

  const enabled = new Set(snapshot.enabledOptionIds);

  const clearCredential = (kind: 'mapbox' | 'carto') => {
    if (readOnly) return;
    const drop = new Set(FAMILY_MAP_OPTIONS.filter((option) => option.credential === kind).map((option) => option.id));
    const remaining = snapshot.enabledOptionIds.filter((id) => !drop.has(id));
    const enabledOptionIds = remaining.length > 0 ? remaining : (['osm'] as FamilyMapOptionId[]);
    const defaultOptionId = enabledOptionIds.includes(snapshot.defaultOptionId)
      ? snapshot.defaultOptionId
      : enabledOptionIds[0];
    if (!window.confirm(t('admin.familyMaps.clearCredentialConfirm'))) return;
    if (kind === 'mapbox') {
      void save({ mapboxPublicToken: null, enabledOptionIds, defaultOptionId });
      return;
    }
    void save({ cartoApiKey: null, enabledOptionIds, defaultOptionId });
  };

  const toggleOption = (id: FamilyMapOptionId, next: boolean) => {
    if (readOnly) return;
    const ids = next
      ? Array.from(new Set([...snapshot.enabledOptionIds, id]))
      : snapshot.enabledOptionIds.filter((item) => item !== id);
    if (ids.length < 1) return;
    const defaultOptionId = ids.includes(snapshot.defaultOptionId) ? snapshot.defaultOptionId : ids[0];
    void save({ enabledOptionIds: ids, defaultOptionId });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface-card">
      <div className="flex items-start gap-3 border-b border-edge p-5">
        <Map size={18} className="mt-0.5 text-content-muted" />
        <div>
          <h2 className="font-semibold text-content">{t('admin.familyMaps.title')}</h2>
          <p className="mt-0.5 text-caption text-content-muted">{t('admin.familyMaps.subtitle')}</p>
          {!canManage && <p className="mt-2 text-caption text-content-faint">{t('admin.familyMaps.readOnly')}</p>}
        </div>
      </div>

      <div className="space-y-6 p-5">
        <p className="text-caption text-content-faint">{t('admin.familyMaps.browserPublicWarning')}</p>
        <p className="text-caption text-content-faint">{t('admin.familyMaps.domainHint')}</p>

        <CredentialField
          key={'mapbox-' + scope}
          label={t('admin.familyMaps.mapboxToken')}
          hint={
            <>
              {t('admin.familyMaps.mapboxHint')}{' '}
              <a
                href="https://account.mapbox.com/access-tokens/"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {t('settings.mapMapboxTokenLink')}
              </a>
            </>
          }
          configured={snapshot.mapboxConfigured}
          canManage={canManage}
          disabled={readOnly}
          onReplace={(value) => void save({ mapboxPublicToken: value })}
          onClear={() => clearCredential('mapbox')}
        />

        <CredentialField
          key={'carto-' + scope}
          label={t('admin.familyMaps.cartoKey')}
          hint={
            <>
              {t('admin.familyMaps.cartoHint')}{' '}
              <a href="https://carto.com/" target="_blank" rel="noreferrer" className="underline">
                CARTO
              </a>
            </>
          }
          configured={snapshot.cartoConfigured}
          canManage={canManage}
          disabled={readOnly}
          onReplace={(value) => void save({ cartoApiKey: value })}
          onClear={() => clearCredential('carto')}
        />

        <div>
          <p className="mb-2 text-body font-medium text-content-secondary">{t('admin.familyMaps.enabledOptions')}</p>
          <div className="grid gap-2">
            {FAMILY_MAP_OPTIONS.map((option) => {
              const usable = optionIsUsable(option.id, {
                mapbox: snapshot.mapboxConfigured ? 'configured' : null,
                carto: snapshot.cartoConfigured ? 'configured' : null,
              });
              const checked = enabled.has(option.id);
              return (
                <label
                  key={option.id}
                  className={`flex items-start gap-3 rounded-lg border border-edge p-3 ${!usable ? 'opacity-60' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={readOnly || (!usable && !checked)}
                    onChange={(e) => toggleOption(option.id, e.target.checked)}
                    className="mt-1"
                    aria-label={t(option.labelKey)}
                  />
                  <span>
                    <span className="block text-body font-medium text-content">{t(option.labelKey)}</span>
                    <span className="block text-caption text-content-faint">
                      {option.familyKey}
                      {!usable ? ` · ${t('admin.familyMaps.needsCredential')}` : ''}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-body font-medium text-content-secondary">
            {t('admin.familyMaps.familyDefault')}
          </label>
          <select
            value={snapshot.defaultOptionId}
            disabled={readOnly}
            onChange={(e) => void save({ defaultOptionId: e.target.value as FamilyMapOptionId })}
            className="w-full max-w-sm rounded-lg border border-edge bg-surface-card px-3 py-2 text-body text-content"
          >
            {snapshot.enabledOptionIds.map((id) => (
              <option key={id} value={id}>
                {t(FAMILY_MAP_OPTIONS.find((o) => o.id === id)?.labelKey || id)}
              </option>
            ))}
          </select>
        </div>

        {preview && (
          <div style={{ position: 'relative', height: 200, width: '100%' }}>
            <FamilyMapPreview map={preview} enable3d />
          </div>
        )}
      </div>
    </div>
  );
}
