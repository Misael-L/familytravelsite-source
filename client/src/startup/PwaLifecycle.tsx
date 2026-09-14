import React, { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useTranslation } from '../i18n'

/**
 * Isolated PWA registration seam (`vite-plugin-pwa` virtual:pwa-register/react).
 * Surfaces a waiting worker without auto-reloading over in-progress work.
 */
export default function PwaLifecycle(): React.ReactElement | null {
  const { t } = useTranslation()
  const [offlineDismissed, setOfflineDismissed] = useState(false)
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
  })

  if (needRefresh) {
    return (
      <div
        role="status"
        className="fixed bottom-[calc(var(--bottom-nav-h)+16px)] left-1/2 z-[10000] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-edge bg-surface-card p-4 shadow-card"
      >
        <p className="text-caption font-semibold text-content">{t('common.errorUpdateTitle')}</p>
        <p className="mt-1 text-caption text-content-secondary">{t('common.errorUpdateBody')}</p>
        <button
          type="button"
          className="mt-3 inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-caption font-medium text-accent-text"
          onClick={() => void updateServiceWorker(true)}
        >
          {t('common.errorReload')}
        </button>
      </div>
    )
  }

  if (offlineReady && !offlineDismissed) {
    return (
      <div
        role="status"
        className="fixed bottom-[calc(var(--bottom-nav-h)+16px)] left-1/2 z-[10000] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-edge bg-surface-card p-4 shadow-card"
      >
        <p className="text-caption font-semibold text-content">{t('common.pwaOfflineReady')}</p>
        <button
          type="button"
          className="mt-3 inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-caption font-medium text-accent-text"
          onClick={() => setOfflineDismissed(true)}
        >
          {t('common.ok')}
        </button>
      </div>
    )
  }

  return null
}
