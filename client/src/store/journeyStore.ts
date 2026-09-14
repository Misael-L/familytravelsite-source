import { create } from 'zustand'
import { journeyApi } from '../api/client'
import { uploadFilesResilient, type ResilientResult, type UploadProgress } from '../utils/uploadQueue'
import { captureVideoPoster, isVideoFile } from '../utils/videoPoster'
import { isSupabaseDataPlane } from '../data/supabase/auth'
import { useAuthStore } from './authStore'
import {
  createFamilyJourney,
  deleteFamilyJourney,
  deleteFamilyJourneyEntry,
  deleteFamilyJourneyMedia,
  attachFamilyJourneyEntryMedia,
  detachFamilyJourneyEntryMedia,
  getFamilyJourney,
  listFamilyJourneys,
  reorderFamilyJourneyEntries,
  reorderFamilyJourneyEntryMedia,
  updateFamilyJourney,
  uploadJourneyImage,
  upsertFamilyJourneyEntry,
} from '../data/supabase/journeys'


export type JourneyEntityId = string | number
export type JourneyMemberRole = 'owner' | 'editor' | 'viewer'

export interface Journey {
  id: JourneyEntityId
  user_id: JourneyEntityId
  title: string
  subtitle?: string | null
  cover_gradient?: string | null
  cover_image?: string | null
  status: 'draft' | 'active' | 'completed' | 'archived'
  created_at: number
  updated_at: number
  my_role?: JourneyMemberRole | null
  trip_date_min?: string | null
  trip_date_max?: string | null
  /** List-card counts. Family maps these from nested `stats`; Nest already sends them. */
  entry_count?: number
  photo_count?: number
  place_count?: number
  /** Family list only: trip ids already on this journey, for suggestion exclusion. */
  linked_trip_ids?: JourneyEntityId[]
}

export interface JourneyEntry {
  id: JourneyEntityId
  journey_id: JourneyEntityId
  source_trip_id?: JourneyEntityId | null
  source_place_id?: JourneyEntityId | null
  source_trip_name?: string | null
  author_id: JourneyEntityId
  type: 'entry' | 'checkin' | 'skeleton'
  title?: string | null
  story?: string | null
  entry_date: string
  entry_time?: string | null
  location_name?: string | null
  location_lat?: number | null
  location_lng?: number | null
  mood?: string | null
  weather?: string | null
  tags?: string[]
  pros_cons?: { pros: string[]; cons: string[] } | null
  visibility: string
  sort_order: number
  photos: JourneyPhoto[]
  created_at: number
  updated_at: number
}

export interface JourneyPhoto {
  id: JourneyEntityId
  entry_id: JourneyEntityId
  photo_id: JourneyEntityId
  caption?: string | null
  sort_order: number
  shared: number
  created_at: number
  // Joined from trek_photos for display
  provider?: string
  asset_id?: string | null
  owner_id?: JourneyEntityId | null
  file_path?: string | null
  thumbnail_path?: string | null
  width?: number | null
  height?: number | null
  // 'image' (default) or 'video' (#823)
  media_type?: string | null
  duration_ms?: number | null
}

export interface GalleryPhoto {
  id: JourneyEntityId
  journey_id: JourneyEntityId
  photo_id: JourneyEntityId
  caption?: string | null
  shared: number
  sort_order: number
  created_at: number
  // Joined from trek_photos for display
  provider?: string
  asset_id?: string | null
  owner_id?: JourneyEntityId | null
  file_path?: string | null
  thumbnail_path?: string | null
  width?: number | null
  height?: number | null
  // 'image' (default) or 'video' (#823)
  media_type?: string | null
  duration_ms?: number | null
}

export interface JourneyTrip {
  trip_id: JourneyEntityId
  added_at: number
  title: string
  start_date?: string | null
  end_date?: string | null
  cover_image?: string | null
  currency?: string
  place_count: number
}

export interface JourneyContributor {
  journey_id: JourneyEntityId
  user_id: JourneyEntityId
  role: JourneyMemberRole
  added_at: number
  username: string
  avatar?: string | null
}

export interface JourneyDetail extends Journey {
  entries: JourneyEntry[]
  gallery: GalleryPhoto[]
  trips: JourneyTrip[]
  contributors: JourneyContributor[]
  stats: { entries: number; photos: number; places: number }
  hide_skeletons?: boolean
}

interface JourneyState {
  journeys: Journey[]
  current: JourneyDetail | null
  loading: boolean
  notFound: boolean
  loadError: boolean

  loadJourneys: () => Promise<void>
  loadJourney: (id: JourneyEntityId) => Promise<void>
  createJourney: (data: { title: string; subtitle?: string; trip_ids?: JourneyEntityId[] }) => Promise<Journey>
  updateJourney: (id: JourneyEntityId, data: Record<string, unknown>) => Promise<void>
  deleteJourney: (id: JourneyEntityId) => Promise<void>

  createEntry: (journeyId: JourneyEntityId, data: Record<string, unknown>) => Promise<JourneyEntry>
  updateEntry: (entryId: JourneyEntityId, data: Record<string, unknown>) => Promise<void>
  deleteEntry: (entryId: JourneyEntityId) => Promise<void>
  reorderEntries: (journeyId: JourneyEntityId, orderedIds: JourneyEntityId[]) => Promise<void>

  uploadPhotos: (entryId: JourneyEntityId, files: File[], cbs?: { onProgress?: (p: UploadProgress) => void }) => Promise<ResilientResult<JourneyPhoto>>
  uploadGalleryPhotos: (journeyId: JourneyEntityId, files: File[], cbs?: { onProgress?: (p: UploadProgress) => void }) => Promise<ResilientResult<GalleryPhoto>>
  linkPhoto: (entryId: JourneyEntityId, journeyPhotoId: JourneyEntityId) => Promise<void>
  unlinkPhoto: (entryId: JourneyEntityId, journeyPhotoId: JourneyEntityId) => Promise<void>
  reorderEntryPhotos: (entryId: JourneyEntityId, orderedIds: JourneyEntityId[]) => Promise<void>
  deleteGalleryPhoto: (journeyId: JourneyEntityId, journeyPhotoId: JourneyEntityId) => Promise<void>
  deletePhoto: (photoId: JourneyEntityId) => Promise<void>

  clear: () => void
}

function requireFamilyId(): string {
  const familyId = useAuthStore.getState().familyId
  if (!familyId) throw new Error('family required')
  return familyId
}

function toId(value: JourneyEntityId): string {
  return String(value)
}

export const useJourneyStore = create<JourneyState>((set, get) => ({
  journeys: [],
  current: null,
  loading: false,
  notFound: false,
  loadError: false,

  loadJourneys: async () => {
    set({ loading: true, loadError: false })
    try {
      if (isSupabaseDataPlane()) {
        const journeys = await listFamilyJourneys(requireFamilyId())
        set({ journeys })
        return
      }
      const data = await journeyApi.list()
      set({ journeys: data.journeys || [] })
    } catch {
      set({ loadError: true })
    } finally {
      set({ loading: false })
    }
  },

  loadJourney: async (id) => {
    const cold = get().current?.id !== id
    if (cold) set({ loading: true, notFound: false, loadError: false })
    try {
      if (isSupabaseDataPlane()) {
        const data = await getFamilyJourney(toId(id))
        set({ current: data, notFound: false, loadError: false })
        return
      }
      const data = await journeyApi.get(id as number)
      set({ current: data, loadError: false })
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.code === '42501' || /not authorized/i.test(String(err?.message))) {
        set({ current: null, notFound: true, loadError: false })
      } else {
        set({ loadError: true })
      }
      throw err
    } finally {
      if (cold) set({ loading: false })
    }
  },

  createJourney: async (data) => {
    if (isSupabaseDataPlane()) {
      const detail = await createFamilyJourney({
        familyId: requireFamilyId(),
        title: data.title,
        subtitle: data.subtitle,
        tripIds: (data.trip_ids || []).map(toId),
      })
      const journey: Journey = detail
      set(s => ({ journeys: [journey, ...s.journeys], current: detail }))
      return journey
    }
    const journey = await journeyApi.create(data)
    set(s => ({ journeys: [journey, ...s.journeys] }))
    return journey
  },

  updateJourney: async (id, data) => {
    if (isSupabaseDataPlane()) {
      const detail = await updateFamilyJourney(toId(id), {
        title: typeof data.title === 'string' ? data.title : undefined,
        subtitle: (data.subtitle as string | null | undefined),
        status: typeof data.status === 'string' ? data.status as Journey['status'] : undefined,
      })
      set(s => ({
        journeys: s.journeys.map(j => j.id === id ? { ...j, ...detail } : j),
        current: s.current?.id === id ? detail : s.current,
      }))
      return
    }
    const updated = await journeyApi.update(id as number, data)
    set(s => ({
      journeys: s.journeys.map(j => j.id === id ? { ...j, ...updated } : j),
      current: s.current?.id === id ? { ...s.current, ...updated } : s.current,
    }))
  },

  deleteJourney: async (id) => {
    if (isSupabaseDataPlane()) {
      await deleteFamilyJourney(toId(id))
      set(s => ({
        journeys: s.journeys.filter(j => j.id !== id),
        current: s.current?.id === id ? null : s.current,
      }))
      return
    }
    await journeyApi.delete(id as number)
    set(s => ({
      journeys: s.journeys.filter(j => j.id !== id),
      current: s.current?.id === id ? null : s.current,
    }))
  },

  createEntry: async (journeyId, data) => {
    if (isSupabaseDataPlane()) {
      const before = new Set((get().current?.entries || []).map(e => String(e.id)))
      const detail = await upsertFamilyJourneyEntry(toId(journeyId), {
        ...data,
        kind: data.type ?? data.kind ?? 'entry',
      }, null)
      set({ current: detail })
      const created = detail.entries.find(e => !before.has(String(e.id))) || detail.entries[detail.entries.length - 1]
      if (!created) throw new Error('entry not created')
      return created
    }
    const entry = await journeyApi.createEntry(journeyId as number, data)
    entry.photos = entry.photos || []
    set(s => {
      if (s.current?.id !== journeyId) return s
      return { current: { ...s.current, entries: [...s.current.entries, entry] } }
    })
    return entry
  },

  updateEntry: async (entryId, data) => {
    if (isSupabaseDataPlane()) {
      const journeyId = get().current?.id
      if (!journeyId) return
      const detail = await upsertFamilyJourneyEntry(toId(journeyId), {
        ...data,
        kind: data.type ?? data.kind,
      }, toId(entryId))
      set({ current: detail })
      return
    }
    const updated = await journeyApi.updateEntry(entryId as number, data)
    set(s => {
      if (!s.current) return s
      return { current: { ...s.current, entries: s.current.entries.map(e => e.id === entryId ? { ...e, ...updated } : e) } }
    })
  },

  deleteEntry: async (entryId) => {
    if (isSupabaseDataPlane()) {
      const detail = await deleteFamilyJourneyEntry(toId(entryId))
      set({ current: detail })
      return
    }
    await journeyApi.deleteEntry(entryId as number)
    set(s => {
      if (!s.current) return s
      return { current: { ...s.current, entries: s.current.entries.filter(e => e.id !== entryId) } }
    })
  },

  reorderEntries: async (journeyId, orderedIds) => {
    // Optimistic: push the new sort_order and re-sort locally so the UI
    // updates immediately. Server mirrors the same ordering. On failure we
    // reload the journey to recover the authoritative state.
    const prev = get().current
    set(s => {
      if (!s.current || s.current.id !== journeyId) return s
      const sortMap = new Map(orderedIds.map((id, idx) => [id, idx]))
      const entries = s.current.entries.map(e =>
        sortMap.has(e.id) ? { ...e, sort_order: sortMap.get(e.id)! } : e
      )
      entries.sort((a, b) => {
        if (a.entry_date !== b.entry_date) return a.entry_date.localeCompare(b.entry_date)
        if (a.sort_order !== b.sort_order) return (a.sort_order || 0) - (b.sort_order || 0)
        return String(a.id).localeCompare(String(b.id))
      })
      return { current: { ...s.current, entries } }
    })
    try {
      if (isSupabaseDataPlane()) {
        await reorderFamilyJourneyEntries(toId(journeyId), orderedIds.map(toId))
        return
      }
      await journeyApi.reorderEntries(journeyId as number, orderedIds as number[])
    } catch (err) {
      // Roll back to last-known-good state.
      if (prev && prev.id === journeyId) set({ current: prev })
      throw err
    }
  },

  uploadPhotos: async (entryId, files, cbs) => {
    return uploadFilesResilient<JourneyPhoto>(
      files,
      async (file, opts) => {
        if (isSupabaseDataPlane()) {
          const current = get().current
          if (!current) throw new Error('journey required')
          await uploadJourneyImage({
            familyId: requireFamilyId(),
            journeyId: toId(current.id),
            file,
            entryId: toId(entryId),
          })
          const detail = await getFamilyJourney(toId(current.id))
          set({ current: detail })
          const photos = detail.entries.find(e => String(e.id) === String(entryId))?.photos || []
          return photos.slice(-1)
        }
        const fd = new FormData()
        fd.append('photos', file)
        const data = await journeyApi.uploadPhotos(entryId as number, fd, opts)
        const photos: JourneyPhoto[] = data.photos || []
        const gallery: GalleryPhoto[] = data.gallery || []
        set(s => {
          if (!s.current) return s
          return {
            current: {
              ...s.current,
              entries: s.current.entries.map(e =>
                e.id === entryId ? { ...e, photos: [...(e.photos || []), ...photos] } : e
              ),
              gallery: [...(s.current.gallery || []), ...gallery],
            },
          }
        })
        return photos
      },
      { onProgress: cbs?.onProgress },
    )
  },

  uploadGalleryPhotos: async (journeyId, files, cbs) => {
    return uploadFilesResilient<GalleryPhoto>(
      files,
      async (file, opts) => {
        if (isSupabaseDataPlane()) {
          if (isVideoFile(file)) throw new Error('video_deferred')
          await uploadJourneyImage({
            familyId: requireFamilyId(),
            journeyId: toId(journeyId),
            file,
          })
          const detail = await getFamilyJourney(toId(journeyId))
          set({ current: detail })
          return (detail.gallery || []).slice(-1)
        }
        const fd = new FormData()
        let data: { photos?: GalleryPhoto[] }
        if (isVideoFile(file)) {
          // Video: grab a poster frame + duration in the browser, then upload the
          // raw video + poster (#823). No server-side transcoding.
          const { poster, durationMs } = await captureVideoPoster(file)
          fd.append('video', file)
          if (poster) fd.append('poster', poster, 'poster.jpg')
          if (durationMs != null) fd.append('duration_ms', String(durationMs))
          data = await journeyApi.uploadGalleryVideo(journeyId as number, fd, opts)
        } else {
          fd.append('photos', file)
          data = await journeyApi.uploadGalleryPhotos(journeyId as number, fd, opts)
        }
        const photos: GalleryPhoto[] = data.photos || []
        set(s => {
          if (!s.current || s.current.id !== journeyId) return s
          return { current: { ...s.current, gallery: [...(s.current.gallery || []), ...photos] } }
        })
        return photos
      },
      { onProgress: cbs?.onProgress },
    )
  },

  unlinkPhoto: async (entryId, journeyPhotoId) => {
    if (isSupabaseDataPlane()) {
      const detail = await detachFamilyJourneyEntryMedia(toId(entryId), toId(journeyPhotoId))
      set({ current: detail })
      return
    }
    await journeyApi.unlinkPhoto(entryId as number, journeyPhotoId as number)
    set(s => {
      if (!s.current) return s
      return {
        current: {
          ...s.current,
          entries: s.current.entries.map(e =>
            e.id === entryId ? { ...e, photos: (e.photos || []).filter(p => p.id !== journeyPhotoId) } : e
          ),
        },
      }
    })
  },

  linkPhoto: async (entryId, journeyPhotoId) => {
    if (isSupabaseDataPlane()) {
      const detail = await attachFamilyJourneyEntryMedia(toId(entryId), toId(journeyPhotoId))
      set({ current: detail })
      return
    }
    await journeyApi.linkPhoto(entryId as number, journeyPhotoId as number)
  },

  reorderEntryPhotos: async (entryId, orderedIds) => {
    if (isSupabaseDataPlane()) {
      const detail = await reorderFamilyJourneyEntryMedia(toId(entryId), orderedIds.map(toId))
      set({ current: detail })
      return
    }
    orderedIds.forEach((id, i) => {
      journeyApi.updatePhoto(id as number, { sort_order: i }).catch(() => {})
    })
  },

  deleteGalleryPhoto: async (journeyId, journeyPhotoId) => {
    if (isSupabaseDataPlane()) {
      const detail = await deleteFamilyJourneyMedia(toId(journeyPhotoId))
      set({ current: detail })
      return
    }
    await journeyApi.deleteGalleryPhoto(journeyId as number, journeyPhotoId as number)
    set(s => {
      if (!s.current) return s
      return {
        current: {
          ...s.current,
          gallery: (s.current.gallery || []).filter(p => p.id !== journeyPhotoId),
          entries: s.current.entries.map(e => ({
            ...e,
            photos: (e.photos || []).filter(p => p.id !== journeyPhotoId),
          })),
        },
      }
    })
  },

  deletePhoto: async (photoId) => {
    if (isSupabaseDataPlane()) {
      const current = get().current
      if (!current) return
      const detail = await deleteFamilyJourneyMedia(toId(photoId))
      set({ current: detail })
      return
    }
    await journeyApi.deletePhoto(photoId as number)
    set(s => {
      if (!s.current) return s
      return {
        current: {
          ...s.current,
          entries: s.current.entries.map(e => ({
            ...e,
            photos: (e.photos || []).filter(p => p.id !== photoId),
          })),
        },
      }
    })
  },

  clear: () => set({ journeys: [], current: null, loading: false, notFound: false, loadError: false }),
}))
