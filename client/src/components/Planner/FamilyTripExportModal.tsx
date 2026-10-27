// View copied from TREK TripExportModal.tsx d4da05b; Family export callbacks replace useTripExport.
import { useId } from 'react'
import { CalendarDays, CalendarPlus, ChevronRight, Download, FileText, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DialogHeader, DialogSection, DialogShell, DialogTile, NEUTRAL_TINT, fs } from '../shared/DialogShell'
import { useTranslation } from '../../i18n'
export function FamilyTripExportModal({ isOpen, onClose, onPdf, onIcs, onSubscribe, canSubscribe, fileBase }: {
 isOpen: boolean; onClose: () => void; onPdf: () => void; onIcs: () => void; onSubscribe: () => void; canSubscribe: boolean; fileBase: string
}) {
 const { t } = useTranslation()
 const titleId = useId()
  const header = (
    <DialogHeader
      tile={<DialogTile><Download size={20} strokeWidth={1.9} className="text-content-muted" /></DialogTile>}
      tint={NEUTRAL_TINT}
      labelId={titleId}
      onClose={onClose}
      title={t('dayplan.export')}
      sub={t('dayplan.exportIntro')}
      subWraps
    />
  )

  return (
    <>
      {/* While the subscription dialog sits on top, Escape and the backdrop are
          its own: one key press closes only the dialog in front. */}
      <DialogShell open={isOpen} onClose={onClose} labelledBy={titleId} width="narrow"  header={header}>
        <DialogSection label={t('dayplan.exportDocument')}>
          <div className="flex flex-col gap-1.5">
            <ExportRow
              icon={FileText}
              title={t('dayplan.pdf')}
              sub={t('dayplan.pdfTooltip')}
              busy={false}
              disabled={false}
              onClick={() => { onPdf(); onClose() }}
            />

          </div>
        </DialogSection>

        <DialogSection label={t('dayplan.exportCalendar')}>
          <div className="flex flex-col gap-1.5">
            <ExportRow
              icon={CalendarDays}
              title={t('mobileTrip.icsDownload')}
              sub={`${fileBase}.ics`}
              busy={false}
              disabled={false}
              onClick={() => { onIcs(); onClose() }}
            />
            {canSubscribe && (
              <ExportRow
                icon={CalendarPlus}
                title={t('mobileTrip.icsSubscribe')}
                sub={t('mobileTrip.icsSubscribeSub')}
                disabled={false}
                onClick={() => { onSubscribe(); onClose() }}
              />
            )}
          </div>
        </DialogSection>

      </DialogShell>
    </>
  )
}

function ExportRow({ icon: Icon, title, sub, busy = false, disabled = false, onClick }: {
  icon: LucideIcon
  title: string
  sub?: string
  busy?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center gap-3 rounded-[14px] border border-edge-faint bg-surface-card px-3 py-2.5 text-start transition-colors enabled:hover:bg-surface-hover disabled:cursor-default disabled:opacity-50"
    >
      <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-surface-tertiary text-content-secondary transition-colors group-enabled:group-hover:bg-surface-card group-enabled:group-hover:text-content">
        {busy ? <Loader2 size={16} strokeWidth={2} className="animate-spin" /> : <Icon size={16} strokeWidth={1.9} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-content" style={fs(13.5, 'body')}>{title}</span>
        {sub && <span className="block truncate text-content-muted" style={fs(11.5)}>{sub}</span>}
      </span>
      <ChevronRight size={15} strokeWidth={2} className="flex-none text-content-faint transition-transform group-enabled:group-hover:translate-x-0.5" />
    </button>
  )
}
