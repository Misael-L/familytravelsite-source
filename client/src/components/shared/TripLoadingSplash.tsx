import { useEffect, useState } from 'react'
import { useTranslation } from '../../i18n'
import TrekMascot, { type TrekScene } from './TrekMascot'

/**
 * Trip-open splash — the mascot packs, hits the road, cruises in and drops the
 * destination pin while the trip loads. Under reduced motion the background
 * freezes and the mascot parks on "loading photos". Palette + glass tint swap
 * for light/dark via the .dark class on <html>. Exits when the caller unmounts
 * it on real readiness — never a fixed dwell.
 */
const STEPS: { scene: TrekScene; key: string }[] = [
  { scene: 'packing', key: 'trip.loadingSteps.pack' },
  { scene: 'transport', key: 'trip.loadingSteps.road' },
  { scene: 'dashboard', key: 'trip.loadingPhotos' },
  { scene: 'collections', key: 'trip.loadingSteps.arrive' },
]
const STEP_MS = 1400
const STILL_INDEX = 2

const SPLASH_CSS = `
.m-splash-root { background: var(--bg-primary); }
.dark .m-splash-root { background: var(--bg-primary); }

.m-splash-bg {
  position: absolute;
  inset: 0;
  background-color: var(--bg-primary);
  background-image:
    radial-gradient(60% 60% at 50% 50%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%),
    radial-gradient(56% 56% at 50% 50%, color-mix(in srgb, var(--info) 18%, transparent), transparent 72%),
    radial-gradient(60% 60% at 50% 50%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 72%),
    radial-gradient(52% 52% at 50% 50%, color-mix(in srgb, var(--info) 12%, transparent), transparent 72%);
  background-repeat: no-repeat;
  background-size: 122% 122%, 132% 132%, 126% 126%, 116% 116%;
  background-position: 12% 20%, 82% 18%, 74% 82%, 22% 78%;
  animation: m-splash-drift 30s ease-in-out infinite alternate;
  will-change: background-position;
}
@keyframes m-splash-drift {
  0%   { background-position: 12% 20%, 82% 18%, 74% 82%, 22% 78%; }
  100% { background-position: 26% 36%, 66% 30%, 58% 68%, 36% 62%; }
}

.m-splash-veil {
  position: absolute;
  inset: -25%;
  background: conic-gradient(from 210deg at 50% 50%,
    transparent, color-mix(in srgb, var(--accent) 14%, transparent),
    color-mix(in srgb, var(--info) 14%, transparent), transparent);
  filter: blur(46px) hue-rotate(0deg);
  mix-blend-mode: soft-light;
  animation: m-splash-hue 26s ease-in-out infinite alternate;
  will-change: filter;
}
.dark .m-splash-veil { opacity: 0.55; }
@keyframes m-splash-hue {
  from { filter: blur(46px) hue-rotate(0deg); }
  to   { filter: blur(46px) hue-rotate(24deg); }
}

.m-splash-grain {
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 160px 160px;
  opacity: 0.05;
  mix-blend-mode: overlay;
  pointer-events: none;
}
.dark .m-splash-grain { opacity: 0.09; mix-blend-mode: soft-light; }

.m-splash-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 100% at 50% 40%, transparent 55%, color-mix(in srgb, var(--bg-inverse) 10%, transparent) 100%);
  pointer-events: none;
}

.m-splash-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 44px 56px 40px;
  border-radius: 32px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-faint);
  box-shadow: var(--shadow-elevated);
  backdrop-filter: blur(30px) saturate(1.7);
  -webkit-backdrop-filter: blur(30px) saturate(1.7);
  animation: m-splash-rise 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes m-splash-rise {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}

.m-splash-content {
  --m-ink: var(--text-primary);
  --m-bg: var(--bg-elevated);
}

@keyframes m-trek-beat {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}

@media (prefers-reduced-motion: reduce) {
  .m-splash-bg,
  .m-splash-veil,
  .m-splash-card { animation: none !important; }
}
`

export default function TripLoadingSplash({ title }: { title?: string }) {
  const { t } = useTranslation()
  const reduceMotion =
    typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false)

  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (reduceMotion) return
    const id = setInterval(() => setIndex((n) => (n + 1) % STEPS.length), STEP_MS)
    return () => clearInterval(id)
  }, [reduceMotion])

  const activeIndex = reduceMotion ? STILL_INDEX : index
  const step = STEPS[activeIndex]
  const label = title || t('trip.loading')

  return (
    <div
      className="m-splash-root fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="m-splash-bg" aria-hidden="true" />
      <div className="m-splash-veil" aria-hidden="true" />
      <div className="m-splash-grain" aria-hidden="true" />
      <div className="m-splash-vignette" aria-hidden="true" />

      <div className="m-splash-card">
        <div className="m-splash-content flex flex-col items-center justify-center">
          <div className="mb-6 flex h-[150px] w-[160px] items-center justify-center overflow-hidden">
            <div key={step.scene} style={reduceMotion ? undefined : { animation: 'm-trek-beat 460ms cubic-bezier(.34,1.56,.64,1) both' }}>
              <TrekMascot scene={step.scene} mood="happy" size={128} />
            </div>
          </div>

          <div className="mb-2 text-title font-bold tracking-[-0.3px] text-content">{label}</div>

          <div className="mb-8 flex h-4 items-center justify-center">
            <span key={step.key} className="text-caption font-medium uppercase tracking-[2px] text-content-faint">
              {t(step.key)}
            </span>
          </div>

          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className="h-[6px] rounded-full"
                style={{
                  width: i === activeIndex ? 20 : 6,
                  background: i === activeIndex ? 'var(--text-primary)' : 'var(--border-primary)',
                  transition: reduceMotion ? undefined : 'width 400ms ease-out',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <style>{SPLASH_CSS}</style>
    </div>
  )
}
