import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { packingApi } from '../../api/client'
import { useTranslation } from '../../i18n'
import { packingViewItems, type PackingView } from './packingListModel'
import { usePackingExportOwner } from '../../integrations/family/packingExportOwner'
import { useAddonStore } from '../../store/addonStore'
import { useTripStore } from '../../store/tripStore'
import { isEffectivelyOffline } from '../../sync/networkMode'
import { downloadBlob } from '../../utils/fileDownload'
import { packingCsv, packingFileName, packingMarkdown, type PackingBagLookup } from './packingExport'
import { packingPrintHtml } from './packingPrintDocument'

export type { PackingView }

const noBag: PackingBagLookup = () => undefined

/** The trip's dates as one range in the reader's language, or null for a trip without them. */
export function tripDateRange(start: string | null | undefined, end: string | null | undefined, locale: string): string | null {
  if (!start) return null
  // Pinned to UTC: a trip date is a calendar day, and the reader's offset must not move it.
  const format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const from = new Date(`${start}T00:00:00Z`)
  if (!end || end === start) return format.format(from)
  const to = new Date(`${end}T00:00:00Z`)
  const ranged = format as Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string }
  return ranged.formatRange ? ranged.formatRange(from, to) : `${format.format(from)} · ${format.format(to)}`
}

/**
 * The @font-face rules the app loaded for `family`, with every url made absolute.
 *
 * The printable page is a srcdoc frame that knows no fonts of its own. Handing it the
 * app's rules lets it print in Poppins from the same origin, where the trip PDF still
 * asks Google for it.
 */
export function appFontFaces(family: string, doc: Document = document): string {
  const rules: string[] = []
  for (const sheet of Array.from(doc.styleSheets)) {
    let sheetRules: CSSRuleList
    try {
      sheetRules = sheet.cssRules
    } catch {
      continue // a cross-origin sheet does not let its rules be read, and has no font of ours
    }
    const base = sheet.href || doc.baseURI
    for (const rule of Array.from(sheetRules)) {
      if (rule.type !== CSSRule.FONT_FACE_RULE || !rule.cssText.includes(family)) continue
      rules.push(rule.cssText.replace(/url\((["']?)([^"')]+)\1\)/g, (_, quote: string, url: string) =>
        `url(${quote}${new URL(url, base).href}${quote})`))
    }
  }
  return rules.join('\n')
}

/**
 * Export, CSV and print for the view of the packing list on screen (#875, #1420), for
 * the desktop header and the phone's action menu alike.
 *
 * Exactly what the view shows goes out: the Personal list never takes the group's
 * items along, and the Common one never takes anybody's private ones. The placeholder
 * rows that keep an empty category on screen are not items and stay behind.
 *
 * Family reads items and bag labels from one admitted publication. Ordinary TREK
 * retains its optional bag lookup and offline fallback. Every output keeps its read owner.
 */
export function usePackingExport(tripId: number | string, view: PackingView) {
  const { t, language, locale } = useTranslation()
  const trip = useTripStore(s => s.trip)
  const bagTracking = useAddonStore(s => s.bagTracking)
  const { owner, current } = usePackingExportOwner(tripId, view)
  const items = useMemo(() => packingViewItems(owner.items, view), [owner, view])
  const [print, setPrint] = useState<{ owner: typeof owner; html: string; title: string } | null>(null)
  const printGeneration = useRef(0)
  const printHtml = print?.owner === owner && current && owner.current() ? print.html : null
  useEffect(() => { if (print && printHtml === null) setPrint(null) }, [print, printHtml])

  const tripTitle = trip?.title
  const listName = view === 'personal' ? t('packing.viewPersonal') : t('packing.viewCommon')
  const title = tripTitle ? `${t('packing.title')}: ${tripTitle}` : t('packing.title')
  const uncategorized = t('packing.defaultCategory')

  const bagLookup = useCallback(async (): Promise<PackingBagLookup> => {
    if (!owner.current()) return noBag
    if (owner.family) return owner.bag
    if (!bagTracking || isEffectivelyOffline()) return noBag
    try {
      const { bags } = await packingApi.listBags(tripId) as { bags?: { id: number; name: string; color?: string | null }[] }
      const byId = new Map((bags ?? []).map(bag => [bag.id, { name: bag.name, color: bag.color }]))
      return bagId => byId.get(bagId)
    } catch {
      return noBag
    }
  }, [owner, bagTracking, tripId])

  const download = useCallback((content: string, type: string, extension: string) => {
    if (!owner.current()) return
    downloadBlob(new Blob([content], { type: `${type};charset=utf-8` }), packingFileName(tripTitle, extension))
  }, [owner, tripTitle])

  const exportMarkdown = useCallback(() => {
    if (!owner.current()) return
    download(packingMarkdown(items, `${title} (${listName})`, uncategorized), 'text/markdown', '.md')
  }, [owner, download, items, title, listName, uncategorized])

  const exportCsv = useCallback(async () => {
    if (!owner.current()) return
    const bags = await bagLookup()
    if (!owner.current()) return
    download(packingCsv(items, bags), 'text/csv', '.csv')
  }, [owner, download, items, bagLookup])

  const openPrint = useCallback(async () => {
    if (!owner.current()) return
    const generation = ++printGeneration.current
    const bags = await bagLookup()
    if (!owner.current() || generation !== printGeneration.current) return
    const html = packingPrintHtml(items, {
      eyebrow: `${t('packing.title')} · ${listName}`,
      title: tripTitle || t('packing.title'),
      dates: tripDateRange(trip?.start_date, trip?.end_date, locale),
      itemsLabel: t('packing.printItems'),
      packedLabel: t('packing.printPacked'),
      weightLabel: t('packing.totalWeight'),
      bagsLabel: t('packing.bags'),
      uncategorized,
      lang: language,
      origin: window.location.origin,
      fontCss: appFontFaces('Poppins'),
    }, bags)
    if (owner.current() && generation === printGeneration.current) setPrint({ owner, html, title })
  }, [owner, title, items, t, listName, tripTitle, trip?.start_date, trip?.end_date, locale, uncategorized, language, bagLookup])

  const closePrint = useCallback(() => { printGeneration.current++; setPrint(null) }, [])

  return { hasItems: current && items.length > 0, exportMarkdown, exportCsv, openPrint, printHtml, printTitle: printHtml !== null ? print?.title ?? title : title, closePrint }
}

export type PackingExport = ReturnType<typeof usePackingExport>
