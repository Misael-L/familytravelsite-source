import { MapPin, Camera, Smile, Laugh, Meh, Frown, Sun, CloudSun, Cloud, CloudRain, CloudLightning, Snowflake } from 'lucide-react'
import { formatLocationName } from '../../utils/formatters'
import type { JourneyEntry, JourneyPhoto } from '../../store/journeyStore'
import { photoUrl as signedOrNestPhotoUrl } from '../../pages/journeyDetail/JourneyDetailPage.helpers'
import { hasJourneyCoordinates } from './mobileJourneyModel'
import { useTranslation } from '../../i18n'

const MOOD_ICONS: Record<string, typeof Smile> = {
  amazing: Laugh,
  good: Smile,
  neutral: Meh,
  rough: Frown,
}

const MOOD_COLORS: Record<string, string> = {
  amazing: 'text-pink-500',
  good: 'text-amber-500',
  neutral: 'text-content-faint',
  rough: 'text-violet-500',
}

const WEATHER_ICONS: Record<string, typeof Sun> = {
  sunny: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  rainy: CloudRain,
  stormy: CloudLightning,
  cold: Snowflake,
}

function photoUrl(p: JourneyPhoto): string {
  return signedOrNestPhotoUrl(p, 'thumbnail')
}

function stripMarkdown(text: string): string {
  return text
    .replace(/[#*_~`>\[\]()!|-]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
}

interface Props {
  entry: JourneyEntry | { id: number; type: string; title?: string | null; location_name?: string | null; location_lat?: number | null; location_lng?: number | null; entry_date: string; entry_time?: string | null; mood?: string | null; weather?: string | null; photos?: { photo_id: number }[]; story?: string | null }
  dayLabel: number
  dayColor: string
  isActive: boolean
  onClick: () => void
  publicPhotoUrl?: (photoId: number) => string
}

export default function MobileEntryCard({ entry, dayLabel, dayColor, isActive, onClick, publicPhotoUrl }: Props) {
  const { t } = useTranslation()
  const hasLocation = hasJourneyCoordinates(entry.location_lat, entry.location_lng)
  const hasPhotos = entry.photos && entry.photos.length > 0
  const firstPhoto = hasPhotos ? entry.photos![0] : null
  const MoodIcon = entry.mood ? MOOD_ICONS[entry.mood] : null
  const moodColor = entry.mood ? MOOD_COLORS[entry.mood] : ''
  const WeatherIcon = entry.weather ? WEATHER_ICONS[entry.weather] : null

  const thumbSrc = firstPhoto
    ? publicPhotoUrl
      ? publicPhotoUrl((firstPhoto as any).photo_id ?? (firstPhoto as any).id)
      : photoUrl(firstPhoto as JourneyPhoto)
    : null

  const date = new Date(entry.entry_date + 'T00:00:00')
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const storyPreview = entry.story ? stripMarkdown(entry.story) : ''
  const fallbackTitle = entry.type === 'checkin'
    ? t('journey.mobile.checkin')
    : entry.type === 'skeleton'
      ? t('journey.mobile.skeletonTitle')
      : t('journey.mobile.untitled')

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 rounded-xl overflow-hidden text-left transition-all duration-100 touch-manipulation ${
        isActive
          ? 'w-[320px] sm:w-[340px] bg-surface-card shadow-lg ring-2 ring-content/70'
          : 'w-[240px] sm:w-[260px] bg-surface-card/90 shadow-md'
      } backdrop-blur-lg`}
    >
      <div className={`flex ${isActive ? 'h-[140px]' : 'h-[110px]'} transition-all duration-100`}>
        {thumbSrc ? (
          <div className={`${isActive ? 'w-[110px]' : 'w-[90px]'} flex-shrink-0 relative overflow-hidden transition-all duration-100`}>
            <img
              src={thumbSrc}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {hasPhotos && entry.photos!.length > 1 && (
              <div className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-inverse/60 text-inverse-text rounded px-1 py-0.5 text-[10px] font-medium">
                <Camera size={10} />
                {entry.photos!.length}
              </div>
            )}
          </div>
        ) : (
          <div className={`${isActive ? 'w-[110px]' : 'w-[90px]'} flex-shrink-0 bg-surface-secondary flex items-center justify-center transition-all duration-100`}>
            <MapPin size={20} className="text-content-faint" />
          </div>
        )}

        <div className="flex-1 p-3 flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-5 h-5 rounded text-inverse-text text-[10px] font-bold flex items-center justify-center flex-shrink-0" style={{ background: dayColor }}>
              {dayLabel}
            </span>
            <span className="text-[11px] text-content-faint font-medium">{dateStr}</span>
            {entry.entry_time && (
              <span className="text-[11px] text-content-faint">· {entry.entry_time.slice(0, 5)}</span>
            )}
            <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
              {MoodIcon && (
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${
                  entry.mood === 'amazing' ? 'bg-pink-100 dark:bg-pink-900/30' :
                  entry.mood === 'good' ? 'bg-amber-100 dark:bg-amber-900/30' :
                  entry.mood === 'rough' ? 'bg-violet-100 dark:bg-violet-900/30' :
                  'bg-surface-secondary'
                }`}>
                  <MoodIcon size={11} className={moodColor} />
                </span>
              )}
              {WeatherIcon && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-surface-secondary">
                  <WeatherIcon size={11} className="text-content-muted" />
                </span>
              )}
            </div>
          </div>

          <h4 className="text-[13px] font-semibold text-content leading-tight truncate">
            {entry.title || fallbackTitle}
          </h4>

          {isActive && storyPreview && (
            <p className="text-[11px] text-content-faint leading-snug mt-0.5 line-clamp-2">
              {storyPreview}
            </p>
          )}

          <div className="flex items-center gap-1 mt-auto">
            {hasLocation ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-secondary text-[10px] font-medium text-content-secondary max-w-full overflow-hidden">
                <MapPin size={10} className="flex-shrink-0" />
                <span className="truncate">{formatLocationName(entry.location_name) || t('journey.mobile.onTheMap')}</span>
              </span>
            ) : (
              <span className="text-[10px] text-content-faint italic">{t('journey.mobile.noLocation')}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
