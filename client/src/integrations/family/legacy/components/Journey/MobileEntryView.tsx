import {
  Camera,
  Clock,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Frown,
  Laugh,
  MapPin,
  Meh,
  Pencil,
  Smile,
  Snowflake,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { photoUrl as signedOrNestPhotoUrl } from '../../pages/journeyDetail/JourneyDetailPage.helpers';
import type { JourneyEntry, JourneyPhoto } from '../../store/journeyStore';
import { formatLocationName } from '../../utils/formatters';
import JournalBody from './JournalBody';

const MOOD_KEYS: Record<string, { icon: typeof Smile; labelKey: string; bg: string; text: string }> = {
  amazing: {
    icon: Laugh,
    labelKey: 'journey.mood.amazing',
    bg: 'bg-pink-50 dark:bg-pink-900/20',
    text: 'text-pink-600 dark:text-pink-400',
  },
  good: {
    icon: Smile,
    labelKey: 'journey.mood.good',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-600 dark:text-amber-400',
  },
  neutral: { icon: Meh, labelKey: 'journey.mood.neutral', bg: 'bg-surface-secondary', text: 'text-content-muted' },
  rough: {
    icon: Frown,
    labelKey: 'journey.mood.rough',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    text: 'text-violet-600 dark:text-violet-400',
  },
};

const WEATHER_KEYS: Record<string, { icon: typeof Sun; labelKey: string }> = {
  sunny: { icon: Sun, labelKey: 'journey.weather.sunny' },
  partly: { icon: CloudSun, labelKey: 'journey.weather.partly' },
  cloudy: { icon: Cloud, labelKey: 'journey.weather.cloudy' },
  rainy: { icon: CloudRain, labelKey: 'journey.weather.rainy' },
  stormy: { icon: CloudLightning, labelKey: 'journey.weather.stormy' },
  cold: { icon: Snowflake, labelKey: 'journey.weather.cold' },
};

function photoUrl(
  p: JourneyPhoto,
  size: 'thumbnail' | 'original' = 'original',
  builder?: (id: number) => string
): string {
  if (builder && typeof p.photo_id === 'number') return builder(p.photo_id);
  return signedOrNestPhotoUrl(p, size);
}

interface Props {
  entry: JourneyEntry;
  readOnly?: boolean;
  publicPhotoUrl?: (photoId: number) => string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPhotoClick: (photos: JourneyPhoto[], index: number) => void;
}

export default function MobileEntryView({
  entry,
  readOnly,
  publicPhotoUrl,
  onClose,
  onEdit,
  onDelete,
  onPhotoClick,
}: Props) {
  const { t } = useTranslation();
  const photos = entry.photos || [];
  const mood = entry.mood ? MOOD_KEYS[entry.mood] : null;
  const weather = entry.weather ? WEATHER_KEYS[entry.weather] : null;
  const prosArr = entry.pros_cons?.pros ?? [];
  const consArr = entry.pros_cons?.cons ?? [];
  const hasProscons = prosArr.length > 0 || consArr.length > 0;
  const title = entry.title || t('journey.mobile.untitled');

  const date = new Date(entry.entry_date + 'T00:00:00');
  const dateStr = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="journey-mobile-entry-title"
      className="fixed inset-0 z-[9999] flex flex-col overflow-hidden bg-surface"
      style={{ height: '100dvh' }}
    >
      <div className="flex flex-shrink-0 items-center justify-between border-b border-edge px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('journey.mobile.closeEntry')}
          className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-surface-secondary"
        >
          <X size={20} />
        </button>
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit();
              }}
              aria-label={t('journey.entry.edit')}
              className="flex h-8 touch-manipulation items-center gap-1.5 rounded-lg bg-surface-secondary px-3 text-[12px] font-medium text-content-secondary transition-colors hover:bg-surface-tertiary"
            >
              <Pencil size={13} />
              {t('journey.entry.edit')}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onDelete();
              }}
              aria-label={t('common.delete')}
              className="flex h-8 w-8 touch-manipulation items-center justify-center rounded-lg text-content-faint transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {photos.length > 0 && (
          <div className="relative">
            <button
              type="button"
              className="block w-full cursor-pointer border-0 bg-transparent p-0"
              onClick={() => onPhotoClick(photos, 0)}
              aria-label={photos[0].caption || t('journey.detail.photos')}
            >
              <img
                src={photoUrl(photos[0], 'original', publicPhotoUrl)}
                alt={photos[0].caption || ''}
                className="max-h-[50vh] w-full object-cover"
              />
            </button>
            {photos.length > 1 && (
              <div className="bg-inverse/60 pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-inverse-text backdrop-blur-sm">
                <Camera size={12} />
                {photos.length} {t('journey.detail.photos')}
              </div>
            )}
            {photos.length > 1 && (
              <div className="flex gap-1 overflow-x-auto bg-surface-secondary px-4 py-2">
                {photos.map((p, i) => (
                  <button
                    key={p.id || i}
                    type="button"
                    onClick={() => onPhotoClick(photos, i)}
                    aria-label={p.caption || t('journey.detail.photos')}
                    className="flex-shrink-0 rounded-lg border-0 bg-transparent p-0"
                  >
                    <img
                      src={photoUrl(p, 'thumbnail', publicPhotoUrl)}
                      alt=""
                      className="ring-content/30 h-16 w-16 rounded-lg object-cover transition-all hover:ring-2"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-5 py-5 pb-32">
          <div className="mb-3 flex flex-wrap items-center gap-2">
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
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-secondary px-2.5 py-1 text-[12px] font-medium text-content-secondary">
                <MapPin size={12} className="flex-shrink-0 text-content-muted" />
                {formatLocationName(entry.location_name)}
              </span>
            </div>
          )}

          <h1
            id="journey-mobile-entry-title"
            className="mb-4 text-[22px] font-bold leading-tight tracking-tight text-content"
          >
            {title}
          </h1>

          {(mood || weather) && (
            <div className="mb-4 flex items-center gap-2">
              {mood && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${mood.bg} ${mood.text}`}
                >
                  <mood.icon size={13} />
                  {t(mood.labelKey)}
                </span>
              )}
              {weather && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold text-content-muted">
                  <weather.icon size={13} />
                  {t(weather.labelKey)}
                </span>
              )}
            </div>
          )}

          {entry.story && (
            <div className="mb-5 text-[14px] leading-relaxed text-content-secondary">
              <JournalBody text={entry.story} />
            </div>
          )}

          {entry.tags && entry.tags.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-1.5">
              {entry.tags.map((tag, i) => (
                <span
                  key={i}
                  className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {hasProscons && (
            <div className="mb-5 overflow-hidden rounded-xl border border-edge">
              {prosArr.length > 0 && (
                <div className="px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    <ThumbsUp size={12} /> {t('journey.editor.pros')}
                  </div>
                  <ul className="space-y-1">
                    {prosArr.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-content-secondary">
                        <span className="mt-0.5 text-emerald-500">+</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {prosArr.length > 0 && consArr.length > 0 && <div className="border-t border-edge" />}
              {consArr.length > 0 && (
                <div className="px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-danger">
                    <ThumbsDown size={12} /> {t('journey.editor.cons')}
                  </div>
                  <ul className="space-y-1">
                    {consArr.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-content-secondary">
                        <span className="mt-0.5 text-danger">−</span> {c}
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
  );
}
