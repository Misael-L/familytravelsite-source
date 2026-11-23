/** Visible text only — never eval scripts. */
export function htmlToVisibleText(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, noscript').forEach(el => el.remove())
  return (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = []
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
      const raw = el.textContent?.trim()
      if (!raw) continue
      try {
        out.push(JSON.parse(raw) as unknown)
      } catch {
        /* skip malformed block */
      }
    }
  }
  if (out.length > 0) return out
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) != null) {
    try {
      out.push(JSON.parse(m[1].trim()) as unknown)
    } catch {
      /* skip */
    }
  }
  return out
}
