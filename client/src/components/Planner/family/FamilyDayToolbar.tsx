// Presentation copied from TREK DayPlanSidebarToolbar.tsx d4da05b.
import { ChevronsDownUp, ChevronsUpDown, Download, Undo2 } from 'lucide-react'
import Tooltip from '../../shared/Tooltip'
import { NEUTRAL_TINT, fs } from '../../shared/DialogShell'
import { BarButton, PANEL_BAR } from '../planParts'
import { useTranslation } from '../../../i18n'
export function FamilyDayToolbar({ allExpanded, onToggleAll, onExport, onUndo, canUndo, lastActionLabel }: {
 allExpanded: boolean; onToggleAll: () => void; onExport: () => void; onUndo?: () => void; canUndo: boolean; lastActionLabel?: string | null
}) {
 const { t } = useTranslation()
 const expandLabel = t(allExpanded ? 'dayplan.collapseAll' : 'dayplan.expandAll')
 const undoTip = canUndo && lastActionLabel ? t('undo.tooltip', {action: lastActionLabel}) : t('undo.button')
 return (
    <div className={PANEL_BAR} style={{ background: NEUTRAL_TINT }}>
      {/* One export button instead of three: PDF, ICS and GPX each carried
          their own hover menu, and on a narrower sidebar the row ran out of
          width and pushed them off the edge. The dialog holds every option. */}
      <Tooltip label={t('dayplan.exportIntro')} placement="bottom">
        <button
          type="button"
          onClick={onExport}
          aria-haspopup="dialog"
          aria-expanded={false}
          className="inline-flex h-8 flex-none items-center gap-1.5 rounded-[10px] bg-accent px-3 font-semibold text-accent-text hover:opacity-90"
          style={fs(12, 'body')}
        >
          <Download size={13} strokeWidth={2.2} />
          {t('dayplan.export')}
        </button>
      </Tooltip>
      <span className="flex-1" />
      {onUndo && (
        <Tooltip label={undoTip} placement="bottom">
          <button type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={t('undo.button')}
            className="grid h-8 w-8 flex-none place-items-center rounded-[10px] text-content-muted transition-colors enabled:hover:bg-surface-card enabled:hover:text-content disabled:cursor-default disabled:opacity-40"
          >
            <Undo2 size={15} strokeWidth={2} />
          </button>
        </Tooltip>
      )}
      <BarButton
        label={expandLabel}
        ariaPressed={allExpanded}
        onClick={() => {
          onToggleAll()

        }}
      >
        {allExpanded ? <ChevronsDownUp size={15} strokeWidth={2} /> : <ChevronsUpDown size={15} strokeWidth={2} />}
      </BarButton>
    </div>
 )
}
