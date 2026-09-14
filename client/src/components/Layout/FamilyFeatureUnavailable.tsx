import React from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '../../i18n'

export default function FamilyFeatureUnavailable(): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold text-content">{t('features.unavailable.title')}</h1>
      <p className="mt-2 max-w-md text-sm text-content-muted">{t('features.unavailable.body')}</p>
      <Link
        to="/dashboard"
        className="mt-6 text-sm font-medium text-accent underline-offset-2 hover:underline"
      >
        {t('features.unavailable.back')}
      </Link>
    </div>
  )
}
