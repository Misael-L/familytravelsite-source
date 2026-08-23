import type { HelpNavSection, HelpPageData } from '../../api/client'

/** Nest wiki payloads. Anything else (SPA HTML fallback, empty object) is invalid. */
export function asHelpSections(value: unknown): HelpNavSection[] {
  if (!Array.isArray(value)) return []
  return value.filter((section): section is HelpNavSection => {
    if (!section || typeof section !== 'object') return false
    const pages = (section as HelpNavSection).pages
    return Array.isArray(pages)
  })
}

export function asHelpPage(value: unknown): HelpPageData | null {
  if (!value || typeof value !== 'object') return null
  const page = value as HelpPageData
  if (typeof page.slug !== 'string' || typeof page.title !== 'string' || typeof page.markdown !== 'string') {
    return null
  }
  return { slug: page.slug, title: page.title, markdown: page.markdown }
}
