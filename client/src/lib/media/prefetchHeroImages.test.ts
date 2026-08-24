import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  HERO_OPEN_PREFETCH_COUNT,
  heroPrefetchUrls,
  prefetchHeroAround,
  resetHeroPrefetchForTests,
} from './prefetchHeroImages'

const URLS = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg']

describe('heroPrefetchUrls', () => {
  it('FE-LIB-HEROPREFETCH-001: warms current plus next two from the start', () => {
    expect(heroPrefetchUrls(URLS, 0)).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
    expect(HERO_OPEN_PREFETCH_COUNT).toBe(3)
  })

  it('FE-LIB-HEROPREFETCH-002: wraps so the last slide warms the first', () => {
    expect(heroPrefetchUrls(URLS, 4)).toEqual(['e.jpg', 'a.jpg', 'b.jpg'])
  })

  it('FE-LIB-HEROPREFETCH-003: does not exceed the gallery or request empties', () => {
    expect(heroPrefetchUrls(['only.jpg'], 0)).toEqual(['only.jpg'])
    expect(heroPrefetchUrls([], 0)).toEqual([])
    expect(heroPrefetchUrls(URLS, 0, 0)).toEqual([])
  })
})

describe('prefetchHeroAround', () => {
  const srcs: string[] = []

  beforeEach(() => {
    srcs.length = 0
    resetHeroPrefetchForTests()
    vi.stubGlobal('Image', class {
      decoding = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(value: string) {
        srcs.push(value)
        queueMicrotask(() => this.onload?.())
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetHeroPrefetchForTests()
  })

  it('FE-LIB-HEROPREFETCH-004: assigns Image.src for the window and skips duplicates', async () => {
    prefetchHeroAround(URLS, 0)
    prefetchHeroAround(URLS, 0)
    await Promise.resolve()
    expect(srcs).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
  })
})
