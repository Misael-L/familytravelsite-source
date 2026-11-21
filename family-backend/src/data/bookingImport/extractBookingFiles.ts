import { extractFromPlainText } from './heuristics'
import { htmlToVisibleText, extractJsonLdBlocks } from './htmlText'
import { parseEml } from './eml'
import { itemsFromJsonLd } from './jsonLd'
import type { FamilyImportItem, FamilyImportResult } from './types'

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i).toLowerCase()
}

function fromHtml(html: string, fileName: string): FamilyImportItem[] {
  const ld = itemsFromJsonLd(extractJsonLdBlocks(html), fileName)
  if (ld.length > 0) return ld
  return extractFromPlainText(htmlToVisibleText(html) || html, fileName)
}

function fromTextish(text: string, fileName: string): FamilyImportItem[] {
  const maybeHtml = /<[a-z][\s\S]*>/i.test(text)
  if (maybeHtml) return fromHtml(text, fileName)
  const ld = itemsFromJsonLd(extractJsonLdBlocks(text), fileName)
  if (ld.length > 0) return ld
  return extractFromPlainText(text, fileName)
}

async function extractOne(file: File): Promise<FamilyImportResult> {
  const name = file.name
  const ext = extOf(name)
  const warnings: string[] = []

  if (ext === '.pkpass') {
    const { extractPkpass } = await import('./pkpass')
    const item = await extractPkpass(await file.arrayBuffer(), name)
    if (!item) return { items: [], warnings: [`${name}: no pass.json`] }
    return { items: [item], warnings }
  }

  if (ext === '.pdf') {
    try {
      const { extractPdfText } = await import('./pdfText')
      const text = await extractPdfText(await file.arrayBuffer())
      const items = fromTextish(text, name)
      if (items.length === 0) warnings.push(`${name}: no reservations found`)
      return { items, warnings }
    } catch (err) {
      return { items: [], warnings: [`${name}: ${err instanceof Error ? err.message : 'PDF extraction failed'}`] }
    }
  }

  const raw = await file.text()

  if (ext === '.eml') {
    const parts = parseEml(raw)
    const htmlItems = parts.html ? fromHtml(parts.html, name) : []
    if (htmlItems.length > 0) return { items: htmlItems, warnings }
    const textItems = parts.text ? extractFromPlainText(parts.text, name) : []
    if (textItems.length === 0) warnings.push(`${name}: no reservations found`)
    return { items: textItems, warnings }
  }

  if (ext === '.html' || ext === '.htm') {
    const items = fromHtml(raw, name)
    if (items.length === 0) warnings.push(`${name}: no reservations found`)
    return { items, warnings }
  }

  const items = fromTextish(raw, name)
  if (items.length === 0) warnings.push(`${name}: no reservations found`)
  return { items, warnings }
}

export async function extractBookingFiles(files: File[]): Promise<FamilyImportResult> {
  const items: FamilyImportItem[] = []
  const warnings: string[] = []
  for (const file of files) {
    try {
      const part = await extractOne(file)
      items.push(...part.items)
      warnings.push(...part.warnings)
    } catch (err) {
      warnings.push(`${file.name}: ${err instanceof Error ? err.message : 'extraction failed'}`)
    }
  }
  return { items, warnings }
}
