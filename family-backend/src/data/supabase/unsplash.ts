import { getSupabaseBrowserClient } from './client'

export type UnsplashPhoto = {
  id: string
  url: string
  thumb: string
  description: string | null
  photographer: string | null
  link: string | null
}

type UnsplashSearchResponse = {
  photos?: Array<{
    id?: string
    url?: string
    thumb?: string
    description?: string | null
    photographer?: string | null
    link?: string | null
  }>
  error?: string
}

/** Family Edge `search-unsplash` — JWT required. Nest `tripsApi.searchCoverImages` is nest-only. */
export async function searchUnsplash(query: string): Promise<UnsplashPhoto[]> {
  const q = query.trim()
  if (!q) return []

  const { data, error } = await getSupabaseBrowserClient().functions.invoke<UnsplashSearchResponse>(
    'search-unsplash',
    { body: { query: q } },
  )
  if (error) throw error
  if (data?.error) throw new Error(data.error)

  return (data?.photos ?? [])
    .filter((p): p is UnsplashPhoto => Boolean(p.id && p.url && p.thumb))
    .map(p => ({
      id: p.id,
      url: p.url,
      thumb: p.thumb,
      description: p.description ?? null,
      photographer: p.photographer ?? null,
      link: p.link ?? null,
    }))
}
