import { describe, expect, it } from 'vitest'
import { toDisplayImageUrl, toThumbImageUrl } from './catalogExploreMedia'

const OBJECT =
  'https://gdqy.supabase.co/storage/v1/object/public/catalog/places/gubbio.jpg'

describe('toDisplayImageUrl', () => {
  it('rewrites catalog object URLs to hero transforms', () => {
    expect(toDisplayImageUrl(OBJECT)).toBe(
      'https://gdqy.supabase.co/storage/v1/render/image/public/catalog/places/gubbio.jpg?width=1200&resize=contain&quality=75',
    )
  })

  it('uses thumb width for boarding-pass chips', () => {
    expect(toThumbImageUrl(OBJECT)).toBe(
      'https://gdqy.supabase.co/storage/v1/render/image/public/catalog/places/gubbio.jpg?width=96&resize=contain&quality=75',
    )
  })

  it('leaves non-catalog URLs unchanged', () => {
    expect(toDisplayImageUrl('https://images.example/x.jpg')).toBe('https://images.example/x.jpg')
  })
})
