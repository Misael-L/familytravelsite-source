import {
  Camera,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Frown,
  Laugh,
  MapPin,
  Meh,
  Smile,
  Snowflake,
  Sun,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import { photoUrl as signedOrNestPhotoUrl } from '../../pages/journeyDetail/JourneyDetailPage.helpers';
import type { JourneyEntry, JourneyPhoto } from '../../store/journeyStore';
import { formatLocationName } from '../../utils/formatters';
import { hasJourneyCoordinates } from './mobileJourneyModel';

const MOOD_ICONS: Record<string, typeof Smile> = {
  amazing: Laugh,
  good: Smile,
  neutral: Meh,
  rough: Frown,
};

const MOOD_COLORS: Record<string, string> = {
  amazing: 'text-pink-500',
  good: 'text-amber-500',
  neutral: 'text-content-faint',
  rough: 'text-violet-500',
};

const WEATHER_ICONS: Record<string, typeof Sun> = {
  sunny: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  rainy: CloudRain,
  stormy: CloudLightning,
  cold: Snowflake,
};

function photoUrl(p: JourneyPhoto): string {
  return signedOrNestPhotoUrl(p, 'thumbnail');
}

function stripMarkdown(text: string): string {
  return text
    .replace(/[#*_~`>\[\]()!|-]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}

interface Props {
  entry:
    | JourneyEntry
    | {
        id: number;
        type: string;
        title?: string | null;
        location_name?: string | null;
        location_lat?: number | null;
        location_lng?: number | null;
        entry_date: string;
        entry_time?: string | null;
        mood?: string | null;
        weather?: string | null;
        photos?: { photo_id: number }[];
        story?: string | null;
      };
  dayLabel: number;
  dayColor: string;
  isActive: boolean;
  onClick: () => void;
  publicPhotoUrl?: (photoId: number) => string;
}

export default function MobileEntryCard({ entry, dayLabel, dayColor, isActive, onClick, publicPhotoUrl }: Props) {
  const { t } = useTranslation();
  const hasLocation = hasJourneyCoordinates(entry.location_lat, entry.location_lng);
  const hasPhotos = entry.photos && entry.photos.length > 0;
  const firstPhoto = hasPhotos ? entry.photos![0] : null;
  const MoodIcon = entry.mood ? MOOD_ICONS[entry.mood] : null;
  const moodColor = entry.mood ? MOOD_COLORS[entry.mood] : '';
  const WeatherIcon = entry.weather ? WEATHER_ICONS[entry.weather] : null;

  const thumbSrc = firstPhoto
    ? publicPhotoUrl
      ? publicPhotoUrl((firstPhoto as any).photo_id ?? (firstPhoto as any).id)
      : photoUrl(firstPhoto as JourneyPhoto)
    : null;

  const date = new Date(entry.entry_date + 'T00:00:00');
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const storyPreview = entry.story ? stripMarkdown(entry.story) : '';
  const fallbackTitle =
    entry.type === 'checkin'
      ? t('journey.mobile.checkin')
      : entry.type === 'skeleton'
        ? t('journey.mobile.skeletonTitle')
        : t('journey.mobile.untitled');

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 touch-manipulation overflow-hidden rounded-xl text-left transition-all duration-100 ${
        isActive
          ? 'ring-content/70 w-[320px] bg-surface-card shadow-lg ring-2 sm:w-[340px]'
          : 'bg-surface-card/90 w-[240px] shadow-md sm:w-[260px]'
      } backdrop-blur-lg`}
    >
      <div className={`flex ${isActive ? 'h-[140px]' : 'h-[110px]'} transition-all duration-100`}>
        {thumbSrc ? (
          <div
            className={`${isActive ? 'w-[110px]' : 'w-[90px]'} relative flex-shrink-0 overflow-hidden transition-all duration-100`}
          >
            <img src={thumbSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
            {hasPhotos && entry.photos!.length > 1 && (
              <div className="bg-inverse/60 absolute bottom-1 right-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-inverse-text">
                <Camera size={10} />
                {entry.photos!.length}
              </div>
            )}
          </div>
        ) : (
          <div
            className={`${isActive ? 'w-[110px]' : 'w-[90px]'} flex flex-shrink-0 items-center justify-center bg-surface-secondary transition-all duration-100`}
          >
            <MapPin size={20} className="text-content-faint" />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold text-inverse-text"
              style={{ background: dayColor }}
            >
              {dayLabel}
            </span>
            <span className="text-[11px] font-medium text-content-faint">{dateStr}</span>
            {entry.entry_time && (
              <span className="text-[11px] text-content-faint">· {entry.entry_time.slice(0, 5)}</span>
            )}
            <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
              {MoodIcon && (
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                    entry.mood === 'amazing'
                      ? 'bg-pink-100 dark:bg-pink-900/30'
                      : entry.mood === 'good'
                        ? 'bg-amber-100 dark:bg-amber-900/30'
                        : entry.mood === 'rough'
                          ? 'bg-violet-100 dark:bg-violet-900/30'
                          : 'bg-surface-secondary'
                  }`}
                >
                  <MoodIcon size={11} className={moodColor} />
                </span>
              )}
              {WeatherIcon && (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface-secondary">
                  <WeatherIcon size={11} className="text-content-muted" />
                </span>
              )}
            </div>
          </div>

          <h4 className="truncate text-[13px] font-semibold leading-tight text-content">
            {entry.title || fallbackTitle}
          </h4>

          {isActive && storyPreview && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-content-faint">{storyPreview}</p>
          )}

          <div className="mt-auto flex items-center gap-1">
            {hasLocation ? (
              <span className="inline-flex max-w-full items-center gap-1 overflow-hidden rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium text-content-secondary">
                <MapPin size={10} className="flex-shrink-0" />
                <span className="truncate">
                  {formatLocationName(entry.location_name) || t('journey.mobile.onTheMap')}
                </span>
              </span>
            ) : (
              <span className="text-[10px] italic text-content-faint">{t('journey.mobile.noLocation')}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
