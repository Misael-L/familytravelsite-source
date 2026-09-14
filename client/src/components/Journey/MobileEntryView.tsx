import { useEffect } from 'react'
import {
  X, Pencil, Trash2, MapPin, Clock, Camera,
  Laugh, Smile, Meh, Frown,
  Sun, CloudSun, Cloud, CloudRain, CloudLightning, Snowflake,
  ThumbsUp, ThumbsDown,
} from 'lucide-react'
import JournalBody from './JournalBody'
import { formatLocationName } from '../../utils/formatters'
import type { JourneyEntry, JourneyPhoto } from '../../store/journeyStore'
import { photoUrl as signedOrNestPhotoUrl } from '../../pages/journeyDetail/JourneyDetailPage.helpers'
import { useTranslation } from '../../i18n'

const MOOD_KEYS: Record<string, { icon: typeof Smile; labelKey: string; bg: string; text: string }> = {
  amazing: { icon: Laugh, labelKey: 'journey.mood.amazing', bg: 'bg-pink-50 dark:bg-pink-900/20', text: 'text-pink-600 dark:text-pink-400' },
  good:    { icon: Smile, labelKey: 'journey.mood.good',    bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400' },
  neutral: { icon: Meh,   labelKey: 'journey.mood.neutral', bg: 'bg-surface-secondary', text: 'text-content-muted' },
  rough:   { icon: Frown, labelKey: 'journey.mood.rough',   bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-600 dark:text-violet-400' },
}

const WEATHER_KEYS: Record<string, { icon: typeof Sun; labelKey: string }> = {
  sunny:  { icon: Sun,            labelKey: 'journey.weather.sunny' },
  partly: { icon: CloudSun,      labelKey: 'journey.weather.partly' },
  cloudy: { icon: Cloud,          labelKey: 'journey.weather.cloudy' },
  rainy:  { icon: CloudRain,     labelKey: 'journey.weather.rainy' },
  stormy: { icon: CloudLightning, labelKey: 'journey.weather.stormy' },
  cold:   { icon: Snowflake,     labelKey: 'journey.weather.cold' },
}

function photoUrl(p: JourneyPhoto, size: 'thumbnail' | 'original' = 'original', builder?: (id: number) => string): string {
  if (builder && typeof p.photo_id === 'number') return builder(p.photo_id)
  return signedOrNestPhotoUrl(p, size)
}

interface Props {
  entry: JourneyEntry
  readOnly?: boolean
  publicPhotoUrl?: (photoId: number) => string
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onPhotoClick: (photos: JourneyPhoto[], index: number) => void
}

export default function MobileEntryView({ entry, readOnly, publicPhotoUrl, onClose, onEdit, onDelete, onPhotoClick }: Props) {
  const { t } = useTranslation()
  const photos = entry.photos || []
  const mood = entry.mood ? MOOD_KEYS[entry.mood] : null
  const weather = entry.weather ? WEATHER_KEYS[entry.weather] : null
  const prosArr = entry.pros_cons?.pros ?? []
  const consArr = entry.pros_cons?.cons ?? []
  const hasProscons = prosArr.length > 0 || consArr.length > 0
  const title = entry.title || t('journey.mobile.untitled')

  const date = new Date(entry.entry_date + 'T00:00:00')
  const dateStr = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="journey-mobile-entry-title"
      className="fixed inset-0 z-[9999] bg-surface flex flex-col overflow-hidden"
      style={{ height: '100dvh' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge flex-shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('journey.mobile.closeEntry')}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-content-muted hover:bg-surface-secondary transition-colors touch-manipulation"
        >
          <X size={20} />
        </button>
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { onClose(); onEdit(); }}
              aria-label={t('journey.entry.edit')}
              className="h-8 px-3 rounded-lg bg-surface-secondary text-content-secondary text-[12px] font-medium flex items-center gap-1.5 hover:bg-surface-tertiary transition-colors touch-manipulation"
            >
              <Pencil size={13} />
              {t('journey.entry.edit')}
            </button>
            <button
              type="button"
              onClick={() => { onClose(); onDelete(); }}
              aria-label={t('common.delete')}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-content-faint hover:bg-danger-soft hover:text-danger transition-colors touch-manipulation"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {photos.length > 0 && (
          <div className="relative">
            <button
              type="button"
              className="block w-full p-0 border-0 bg-transparent cursor-pointer"
              onClick={() => onPhotoClick(photos, 0)}
              aria-label={photos[0].caption || t('journey.detail.photos')}
            >
              <img
                src={photoUrl(photos[0], 'original', publicPhotoUrl)}
                alt={photos[0].caption || ''}
                className="w-full max-h-[50vh] object-cover"
              />
            </button>
            {photos.length > 1 && (
              <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-inverse/60 backdrop-blur-sm text-inverse-text rounded-full px-2.5 py-1 text-[11px] font-medium pointer-events-none">
                <Camera size={12} />
                {photos.length} {t('journey.detail.photos')}
              </div>
            )}
            {photos.length > 1 && (
              <div className="flex gap-1 px-4 py-2 overflow-x-auto bg-surface-secondary">
                {photos.map((p, i) => (
                  <button
                    key={p.id || i}
                    type="button"
                    onClick={() => onPhotoClick(photos, i)}
                    aria-label={p.caption || t('journey.detail.photos')}
                    className="p-0 border-0 bg-transparent rounded-lg flex-shrink-0"
                  >
                    <img
                      src={photoUrl(p, 'thumbnail', publicPhotoUrl)}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover hover:ring-2 ring-content/30 transition-all"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-5 py-5 pb-32">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-[12px] font-medium text-content-muted">{dateStr}</span>
            {entry.entry_time && (
              <span className="flex items-center gap-1 text-[12px] text-content-faint">
                <Clock size={11} />
                {entry.entry_time.slice(0, 5)}
              </span>
            )}
          </div>

          {entry.location_name && (
            <div className="mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-secondary text-[12px] font-medium text-content-secondary">
                <MapPin size={12} className="text-content-muted flex-shrink-0" />
                {formatLocationName(entry.location_name)}
              </span>
            </div>
          )}

          <h1 id="journey-mobile-entry-title" className="text-[22px] font-bold text-content tracking-tight leading-tight mb-4">
            {title}
          </h1>

          {(mood || weather) && (
            <div className="flex items-center gap-2 mb-4">
              {mood && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${mood.bg} ${mood.text}`}>
                  <mood.icon size={13} />
                  {t(mood.labelKey)}
                </span>
              )}
              {weather && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-surface-secondary text-content-muted">
                  <weather.icon size={13} />
                  {t(weather.labelKey)}
                </span>
              )}
            </div>
          )}

          {entry.story && (
            <div className="text-[14px] leading-relaxed text-content-secondary mb-5">
              <JournalBody text={entry.story} />
            </div>
          )}

          {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {entry.tags.map((tag, i) => (
                <span key={i} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {hasProscons && (
            <div className="border border-edge rounded-xl overflow-hidden mb-5">
              {prosArr.length > 0 && (
                <div className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2">
                    <ThumbsUp size={12} /> {t('journey.editor.pros')}
                  </div>
                  <ul className="space-y-1">
                    {prosArr.map((p, i) => (
                      <li key={i} className="text-[13px] text-content-secondary flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">+</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {prosArr.length > 0 && consArr.length > 0 && (
                <div className="border-t border-edge" />
              )}
              {consArr.length > 0 && (
                <div className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-danger uppercase tracking-wide mb-2">
                    <ThumbsDown size={12} /> {t('journey.editor.cons')}
                  </div>
                  <ul className="space-y-1">
                    {consArr.map((c, i) => (
                      <li key={i} className="text-[13px] text-content-secondary flex items-start gap-2">
                        <span className="text-danger mt-0.5">−</span> {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
