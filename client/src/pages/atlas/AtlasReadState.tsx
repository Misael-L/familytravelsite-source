import { DialogButton } from '../../components/shared/DialogShell';
import EmptyState from '../../components/shared/EmptyState';
import { useTranslation } from '../../i18n';
import type { AtlasReadState } from './atlasModel';

/** Reuses the native content slot and controls; unavailable is not an empty result. */
export function AtlasReadNotice({ state, onRetry }: { state: AtlasReadState; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role={state.status === 'error' ? 'alert' : 'status'}>
      <EmptyState
        scene="atlas"
        layout="row"
        size={52}
        title={t(
          state.status === 'loading'
            ? 'common.loading'
            : state.status === 'unavailable'
              ? 'atlas.unavailable'
              : 'common.errorPanelTitle'
        )}
        action={
          state.status === 'error' && onRetry ? (
            <DialogButton onClick={onRetry}>{t('common.errorRetry')}</DialogButton>
          ) : undefined
        }
      />
    </div>
  );
}

export function AtlasMetric({ value }: { value: number | undefined }) {
  const { t } = useTranslation();
  return value === undefined ? (
    <span role="img" aria-label={t('atlas.unavailable')} title={t('atlas.unavailable')}>
      —
    </span>
  ) : (
    value
  );
}
