import { AlertTriangle, KeyRound } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  enrollTotpFactor,
  listTotpFactors,
  reauthenticateWithPassword,
  signOutOtherSessions,
  unenrollTotpFactor,
  verifyTotpFactor,
} from '../../data/supabase/auth';
import { useTranslation } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../shared/Toast';

function TotpQr({ value }: { value: string }): React.ReactElement {
  const svg = value.includes('<svg');
  if (svg) {
    return (
      <div
        className="mx-auto block overflow-hidden rounded-lg border border-edge"
        style={{ width: 'fit-content' }}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }
  return (
    <img
      src={value}
      alt=""
      className="mx-auto block overflow-hidden rounded-lg border border-edge"
      style={{ width: 180, height: 180 }}
    />
  );
}

export default function FamilySecurityPanel(props: {
  mfaRequiredByPolicy: boolean;
  demoMode: boolean;
}): React.ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const loadUser = useAuthStore((s) => s.loadUser);
  const user = useAuthStore((s) => s.user);

  const [factors, setFactors] = useState<Array<{ id: string; status: string }>>([]);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [disablePwd, setDisablePwd] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [loading, setLoading] = useState(false);

  const enabled = !!user?.mfa_enabled || factors.some((f) => f.status === 'verified');

  const reload = async () => {
    const next = await listTotpFactors();
    setFactors(next);
  };

  useEffect(() => {
    void reload().catch(() => {});
  }, []);

  return (
    <div className="mt-4 border-t border-edge-secondary pt-4">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-content-secondary" />
        <h3 className="m-0 text-base font-semibold text-content">{t('settings.mfa.title')}</h3>
      </div>
      <div className="space-y-3">
        {props.mfaRequiredByPolicy && (
          <div className="flex gap-3 rounded-lg border border-edge bg-surface-secondary p-3 text-sm text-content">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <p className="m-0 leading-relaxed">{t('settings.mfa.requiredByPolicy')}</p>
          </div>
        )}
        <p className="m-0 text-sm text-content-muted" style={{ lineHeight: 1.5 }}>
          {t('settings.mfa.description')}
        </p>
        <p className="m-0 text-xs text-content-faint">{t('settings.mfa.noBackupCodes')}</p>
        {props.demoMode ? (
          <p className="m-0 text-sm text-amber-700">{t('settings.mfa.demoBlocked')}</p>
        ) : (
          <>
            <p className="m-0 text-sm font-medium text-content-secondary">
              {enabled ? t('settings.mfa.enabled') : t('settings.mfa.disabled')}
            </p>

            {!enabled && !qr && (
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const enrolled = await enrollTotpFactor();
                    setFactorId(enrolled.factorId);
                    setQr(enrolled.qrCode);
                    setSecret(enrolled.secret);
                    setSetupCode('');
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : t('common.error'));
                  } finally {
                    setLoading(false);
                  }
                }}
                className="flex items-center gap-2 rounded-lg border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content transition-colors"
              >
                {loading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                ) : (
                  <KeyRound size={14} />
                )}
                {t('settings.mfa.setup')}
              </button>
            )}

            {!enabled && qr && (
              <div className="space-y-3">
                <p className="text-sm text-content-muted">{t('settings.mfa.scanQr')}</p>
                <TotpQr value={qr} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-content-secondary">
                    {t('settings.mfa.secretLabel')}
                  </label>
                  <code className="block break-all rounded bg-surface-hover p-2 text-xs text-content">{secret}</code>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder={t('settings.mfa.codePlaceholder')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={loading || setupCode.length < 6 || !factorId}
                    onClick={async () => {
                      if (!factorId) return;
                      setLoading(true);
                      try {
                        await verifyTotpFactor(factorId, setupCode);
                        toast.success(t('settings.mfa.toastEnabled'));
                        setQr(null);
                        setSecret(null);
                        setSetupCode('');
                        setFactorId(null);
                        await reload();
                        await loadUser({ silent: true });
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : t('common.error'));
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {t('settings.mfa.enable')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQr(null);
                      setSecret(null);
                      setSetupCode('');
                      setFactorId(null);
                    }}
                    className="rounded-lg border border-edge px-4 py-2 text-sm text-content-secondary"
                  >
                    {t('settings.mfa.cancelSetup')}
                  </button>
                </div>
              </div>
            )}

            {enabled && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-content-secondary">{t('settings.mfa.disableTitle')}</p>
                <p className="text-xs text-content-muted">{t('settings.mfa.disableHint')}</p>
                <input
                  type="password"
                  value={disablePwd}
                  onChange={(e) => setDisablePwd(e.target.value)}
                  placeholder={t('settings.currentPassword')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder={t('settings.mfa.codePlaceholder')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={loading || !disablePwd || disableCode.length < 6}
                  onClick={async () => {
                    const verified = factors.find((f) => f.status === 'verified') ?? factors[0];
                    if (!verified) return;
                    setLoading(true);
                    try {
                      await reauthenticateWithPassword(disablePwd);
                      await verifyTotpFactor(verified.id, disableCode);
                      await unenrollTotpFactor(verified.id);
                      toast.success(t('settings.mfa.toastDisabled'));
                      setDisablePwd('');
                      setDisableCode('');
                      await reload();
                      await loadUser({ silent: true });
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : t('common.error'));
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {t('settings.mfa.disable')}
                </button>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    await signOutOtherSessions();
                    toast.success(t('settings.sessions.signedOutOthers'));
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : t('common.error'));
                  } finally {
                    setLoading(false);
                  }
                }}
                className="rounded-lg border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary"
              >
                {t('settings.sessions.signOutOthers')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
