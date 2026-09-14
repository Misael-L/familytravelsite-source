import type { FamilyDayNote } from '../../data/supabase/dayNotes'
import type { FamilyScheduleItem } from '../../data/supabase/scheduleItems'
import type { FamilyTripDay } from '../../data/supabase/tripDays'
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces'
import { formatDate } from '../../utils/formatters'
import type { FamilyPlanExportInput } from './familyPlanIcs'

export function escHtml(str: string | null | undefined): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type FamilyPlanPdfCopy = {
  travelPlan: string
  saveAsPdf: string
  emptyDay: string
  dayN: (n: number) => string
}

function itemLabel(item: FamilyScheduleItem, placesById: Map<string, FamilyTripPlace>): string {
  if (item.placeId) {
    const place = placesById.get(item.placeId)
    if (place?.name?.trim()) return place.name.trim()
  }
  return item.activity
}

function itemAddress(item: FamilyScheduleItem): string | null {
  const addr = item.address?.trim()
  return addr || null
}

/** Printable itinerary HTML (iOS TripPlanPDFExporter content; TREK overlay chrome). */
export function buildFamilyPlanPdfHtml(
  input: FamilyPlanExportInput,
  copy: FamilyPlanPdfCopy,
  locale: string,
): string {
  const title = input.tripTitle.trim() || copy.travelPlan
  const sortedDays = [...input.days].sort((a, b) => a.dayIndex - b.dayIndex)
  const notes = input.notesByCivilDay ?? new Map<string, FamilyDayNote>()

  const daysHtml = sortedDays.map((day, index) => {
    const heading = day.title?.trim() || copy.dayN(index + 1)
    const when = formatDate(day.civilDay, locale) || day.civilDay
    const items = input.itemsByDayId.get(day.id) ?? []
    const note = notes.get(day.civilDay)?.body?.trim() || ''
    const itemsHtml = items.length === 0
      ? `<p class="empty">${escHtml(copy.emptyDay)}</p>`
      : `<ul>${items.map(item => {
          const addr = itemAddress(item)
          return `<li><div class="item">${escHtml(itemLabel(item, input.placesById))}</div>${
            addr ? `<div class="addr">${escHtml(addr)}</div>` : ''
          }</li>`
        }).join('')}</ul>`
    const noteHtml = note ? `<p class="note">${escHtml(note)}</p>` : ''
    return `<section>
      <h2>${escHtml(heading)} <span class="when">${escHtml(when)}</span></h2>
      ${noteHtml}
      ${itemsHtml}
    </section>`
  }).join('')

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<title>${escHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; padding: 48px 40px; margin: 0; }
  h1 { font-size: 20px; font-weight: 700; margin: 0 0 28px; }
  h2 { font-size: 14px; font-weight: 700; margin: 22px 0 8px; }
  h2 .when { font-weight: 400; color: #6b7280; font-size: 12px; margin-left: 8px; }
  ul { margin: 0; padding-left: 18px; }
  li { font-size: 12px; margin: 6px 0; }
  .item { font-weight: 500; }
  .addr { color: #6b7280; font-size: 10px; margin-top: 2px; }
  .note { color: #6b7280; font-size: 11px; margin: 0 0 8px; }
  .empty { color: #9ca3af; font-size: 12px; margin: 0; }
  @media print { body { padding: 24px; } }
</style>
</head><body>
<h1>${escHtml(title)}</h1>
${daysHtml}
</body></html>`
}

const OVERLAY_ID = 'family-pdf-preview-overlay'

export function openFamilyPlanPdfOverlay(
  input: FamilyPlanExportInput,
  copy: FamilyPlanPdfCopy,
  locale: string,
): void {
  document.getElementById(OVERLAY_ID)?.remove()
  const title = input.tripTitle.trim() || copy.travelPlan
  const html = buildFamilyPlanPdfHtml(input, copy, locale)

  const overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:8px;'
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove() }

  const card = document.createElement('div')
  card.style.cssText = 'width:100%;max-width:1000px;height:95vh;background:var(--bg-card,#fff);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);'

  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border-primary,#e5e7eb);flex-shrink:0;'
  header.innerHTML = `
    <span style="font-size:13px;font-weight:600;color:var(--text-primary,#111827)">${escHtml(title)}</span>
    <div style="display:flex;align-items:center;gap:8px">
      <button type="button" id="family-pdf-print-btn" style="display:flex;align-items:center;gap:5px;font-size:12px;font-weight:500;color:var(--text-muted,#6b7280);background:none;border:none;cursor:pointer;padding:4px 8px;border-radius:6px;font-family:inherit">${escHtml(copy.saveAsPdf)}</button>
      <button type="button" id="family-pdf-close-btn" aria-label="Close" style="background:none;border:none;cursor:pointer;color:var(--text-faint,#9ca3af);display:flex;padding:4px;border-radius:6px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'flex:1;width:100%;border:none;'
  iframe.sandbox = 'allow-same-origin allow-modals'
  iframe.srcdoc = html
  iframe.title = title

  card.appendChild(header)
  card.appendChild(iframe)
  overlay.appendChild(card)
  document.body.appendChild(overlay)

  const closeBtn = header.querySelector<HTMLElement>('#family-pdf-close-btn')
  if (closeBtn) closeBtn.onclick = () => overlay.remove()
  const printBtn = header.querySelector<HTMLElement>('#family-pdf-print-btn')
  if (printBtn) printBtn.onclick = () => { iframe.contentWindow?.print() }
}
