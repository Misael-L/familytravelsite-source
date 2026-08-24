import { Hotel, MapPin, Ticket, Utensils } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { CatalogSaveHint } from '../../data/supabase/catalogSaves'
import type { ExploreCatalogKind } from '../../data/supabase/catalogExploreLists'

const CAP = 8

const KIND_ICON: Record<ExploreCatalogKind, typeof MapPin> = {
  place: MapPin,
  experience: Ticket,
  food: Utensils,
  hotel: Hotel,
}

const KIND_LABEL_KEY: Record<ExploreCatalogKind, string> = {
  place: 'trip.explore.kind.places',
  experience: 'trip.explore.kind.experiences',
  food: 'trip.explore.kind.foods',
  hotel: 'trip.explore.kind.hotels',
}

function chipCls(on: boolean, interactive: boolean): string {
  return `inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
    on
      ? 'bg-slate-900 text-white border-slate-900'
      : `bg-white text-slate-600 border-slate-200${interactive ? ' hover:border-slate-300' : ''}`
  }`
}

type FamilyProposalHintChipsProps = {
  hints: CatalogSaveHint[]
  selectedPlaceIds?: string[]
  onPlaceTap?: (hint: CatalogSaveHint) => void
}

export default function FamilyProposalHintChips({
  hints,
  selectedPlaceIds = [],
  onPlaceTap,
}: FamilyProposalHintChipsProps) {
  const { t } = useTranslation()
  const visible = hints.slice(0, CAP)
  const overflow = hints.length - visible.length
  if (visible.length === 0) return null

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-slate-800">{t('dashboard.propose.hintsHeading')}</p>
        <p className="text-xs text-slate-500">{t('dashboard.propose.hintsCaption')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {visible.map(hint => {
          const selected = hint.kind === 'place' && selectedPlaceIds.includes(hint.entityId)
          const canToggle = hint.kind === 'place' && Boolean(onPlaceTap)
          const Icon = KIND_ICON[hint.kind]
          const label = `${t(KIND_LABEL_KEY[hint.kind])}, ${hint.name}`
          const inner = (
            <>
              <Icon size={12} aria-hidden />
              <span className="truncate">{hint.name}</span>
            </>
          )
          if (canToggle && onPlaceTap) {
            return (
              <button
                key={`${hint.kind}:${hint.entityId}`}
                type="button"
                onClick={() => onPlaceTap(hint)}
                className={chipCls(selected, true)}
                aria-pressed={selected}
                aria-label={label}
              >
                {inner}
              </button>
            )
          }
          return (
            <span
              key={`${hint.kind}:${hint.entityId}`}
              className={chipCls(false, false)}
              aria-label={label}
            >
              {inner}
            </span>
          )
        })}
      </div>
      {overflow > 0 && (
        <p className="text-xs font-medium text-slate-400">
          {t('dashboard.propose.hintsOverflow', { n: overflow })}
        </p>
      )}
    </div>
  )
}
