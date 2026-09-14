import { useEffect } from 'react'

/**
 * iOS `CatalogExploreMediaStore.openPrefetchCount`: warm the current hero
 * plus the next two into the browser HTTP cache. Slideshows wrap, so the
 * last slide also warms the first.
 */
export const HERO_OPEN_PREFETCH_COUNT = 3

/** Match iOS `maxConcurrentFetches` — do not open the whole gallery at once. */
const MAX_IN_FLIGHT = 5

const warmed = new Set<string>()
const inFlight = new Set<string>()
const queue: string[] = []

/** Ordered unique hero URLs to warm for this center (wrapping). */
export function heroPrefetchUrls(
  urls: readonly string[],
  centerIndex: number,
  count = HERO_OPEN_PREFETCH_COUNT,
): string[] {
  const n = urls.length
  if (n === 0 || count <= 0 || !Number.isFinite(centerIndex)) return []
  const start = ((Math.trunc(centerIndex) % n) + n) % n
  const take = Math.min(count, n)
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < take; i++) {
    const url = urls[(start + i) % n]
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

function pump(): void {
  while (inFlight.size < MAX_IN_FLIGHT && queue.length > 0) {
    const url = queue.shift()
    if (!url || warmed.has(url) || inFlight.has(url)) continue
    inFlight.add(url)
    const img = new Image()
    img.decoding = 'async'
    const done = () => {
      inFlight.delete(url)
      warmed.add(url)
      pump()
    }
    img.onload = done
    img.onerror = done
    img.src = url
  }
}

function enqueueWarm(url: string): void {
  if (warmed.has(url) || inFlight.has(url) || queue.includes(url)) return
  queue.push(url)
}

/**
 * Decode current + upcoming hero Image Transform URLs so Next is an HTTP-cache
 * hit. Not a byte store — the browser cache is the cache.
 */
export function prefetchHeroAround(
  urls: readonly string[],
  centerIndex: number,
  count = HERO_OPEN_PREFETCH_COUNT,
): void {
  if (typeof Image === 'undefined') return
  for (const url of heroPrefetchUrls(urls, centerIndex, count)) {
    enqueueWarm(url)
  }
  pump()
}

export function resetHeroPrefetchForTests(): void {
  warmed.clear()
  inFlight.clear()
  queue.length = 0
}

export function usePrefetchHeroAround(
  urls: readonly string[],
  centerIndex: number,
): void {
  useEffect(() => {
    prefetchHeroAround(urls, centerIndex)
  }, [urls, centerIndex])
}
