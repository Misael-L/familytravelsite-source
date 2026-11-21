import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  HERO_OPEN_PREFETCH_COUNT,
  heroPrefetchUrls,
  prefetchHeroAround,
  resetHeroPrefetchForTests,
} from './prefetchHeroImages'

const URLS = [
  'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/aa/hero-a.webp',
  'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/bb/hero-b.webp',
  'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/cc/hero-c.webp',
  'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/dd/hero-d.webp',
  'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/ee/hero-e.webp',
]

describe('heroPrefetchUrls', () => {
  it('FE-LIB-HEROPREFETCH-001: warms current plus next two from the start', () => {
    expect(heroPrefetchUrls(URLS, 0)).toEqual([URLS[0], URLS[1], URLS[2]])
    expect(HERO_OPEN_PREFETCH_COUNT).toBe(3)
  })

  it('FE-LIB-HEROPREFETCH-002: wraps so the last slide warms the first', () => {
    expect(heroPrefetchUrls(URLS, 4)).toEqual([URLS[4], URLS[0], URLS[1]])
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
    expect(srcs).toEqual([URLS[0], URLS[1], URLS[2]])
  })

  it('does not prefetch canonical catalog originals', async () => {
    prefetchHeroAround(['https://catalog.example.invalid/storage/v1/object/public/catalog/places/gubbio.jpg'], 0)
    await Promise.resolve()
    expect(srcs).toEqual([])
  })

  it('prefetches ready heroes and skips a canonical neighbor', async () => {
    const original = 'https://catalog.example.invalid/storage/v1/object/public/catalog/places/gubbio.jpg'
    prefetchHeroAround([URLS[0], original, URLS[1]], 0)
    await Promise.resolve()
    expect(srcs).toEqual([URLS[0], URLS[1]])
    expect(srcs.join(' ')).not.toContain('/render/image/')
  })
})
