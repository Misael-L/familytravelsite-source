import { describe, expect, it, vi } from 'vitest'
import {
  familyEntryPayload,
  familyJourneyUpdateArgs,
  JOURNEY_MEDIA_BUCKET,
  JOURNEY_SIGNED_EXPIRES_SEC,
  mapFamilyJourneyDetail,
  mapFamilyJourneySummary,
} from './journeys'
import { journeyCoverSrc, photoUrl } from '../../pages/journeyDetail/JourneyDetailPage.helpers'

describe('family Journey mapper', () => {
  const journeyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const path = 'fam-1/journeys/' + journeyId + '/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'
  const signed = { [path]: 'https://signed.example/jm.jpg' }

  it('maps UUID ids, storage paths to runtime signed URLs, and fail-closed my_role', () => {
    const detail = mapFamilyJourneyDetail({
      id: journeyId,
      owner_person_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      title: 'Como',
      cover_storage_path: path,
      cover_bucket: JOURNEY_MEDIA_BUCKET,
      status: 'active',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-02T00:00:00.000Z',
      stats: { entries: 1, photos: 1, places: 1 },
      trips: [{ trip_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', title: 'Milan', name: 'ignored' }],
      contributors: [{ person_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', display_name: 'Ada', role: 'editor' }],
      gallery: [{ id: 'media-row', journey_id: journeyId, media_id: 'media-1', storage_path: path }],
      entries: [{
        id: 'entry-1',
        journey_id: journeyId,
        kind: 'entry',
        entry_date: '2026-08-02',
        location_lat: 0,
        location_lng: 0,
        photos: [{ id: 'ep-1', media_id: 'media-1', storage_path: path }],
      }],
    }, signed)

    expect(detail.id).toBe(journeyId)
    expect(detail.my_role).toBeNull()
    expect(detail.cover_image).toBe(signed[path])
    expect(detail.cover_image).not.toContain(path)
    expect(detail.trips[0].title).toBe('Milan')
    expect(detail.contributors[0].user_id).toBe('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
    expect(detail.contributors[0].username).toBe('Ada')
    expect(detail.gallery[0].file_path).toBe(signed[path])
    expect(detail.entries[0].location_lat).toBe(0)
    expect(detail.entries[0].location_lng).toBe(0)
    expect(detail.entries[0].photos[0].file_path).toBe(signed[path])
  })

  it('does not default a missing role to owner on summaries', () => {
    const summary = mapFamilyJourneySummary({
      id: journeyId,
      title: 'Como',
      status: 'draft',
      created_at: 0,
      updated_at: 0,
    })
    expect(summary.my_role).toBeNull()
    expect(summary.cover_image).toBeNull()
    expect(summary.entry_count).toBe(0)
    expect(summary.photo_count).toBe(0)
    expect(summary.place_count).toBe(0)
    expect(summary.linked_trip_ids).toEqual([])
  })

  it('maps nested list stats and linked trip ids without persisting storage paths', () => {
    const path = 'fam-1/journeys/' + journeyId + '/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'
    const summary = mapFamilyJourneySummary({
      id: journeyId,
      title: 'Como',
      status: 'active',
      created_at: 0,
      updated_at: 0,
      cover_storage_path: path,
      stats: { entries: 4, photos: 12, places: 3 },
      trips: [{ trip_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }],
    }, { [path]: 'https://signed.example/jm.jpg' })
    expect(summary.entry_count).toBe(4)
    expect(summary.photo_count).toBe(12)
    expect(summary.place_count).toBe(3)
    expect(summary.linked_trip_ids).toEqual(['dddddddd-dddd-4ddd-8ddd-dddddddddddd'])
    expect(summary.cover_image).toBe('https://signed.example/jm.jpg')
    expect(summary.cover_image).not.toContain(path)
  })

  it('maps editor/viewer roles when present and never stores Nest numeric ids', () => {
    const detail = mapFamilyJourneyDetail({
      id: journeyId,
      title: 'Como',
      my_role: 'viewer',
      status: 'draft',
      created_at: 0,
      updated_at: 0,
      stats: {},
    })
    expect(detail.my_role).toBe('viewer')
    expect(typeof detail.id).toBe('string')
  })
})

describe('family Journey payload + deferred controls', () => {
  it('flattens TREK pros_cons and type into RPC kind/verdicts', () => {
    expect(familyEntryPayload({
      title: 'Duomo',
      type: 'entry',
      pros_cons: { pros: ['shade'], cons: ['crowds'] },
    })).toEqual({
      title: 'Duomo',
      kind: 'entry',
      pros: ['shade'],
      cons: ['crowds'],
    })
  })

  it('keeps signed URLs runtime-only in cover/photo helpers', () => {
    expect(JOURNEY_SIGNED_EXPIRES_SEC).toBe(3600)
    expect(journeyCoverSrc('https://signed.example/cover.jpg')).toBe('https://signed.example/cover.jpg')
    expect(journeyCoverSrc('nest-file.jpg')).toBe('/uploads/nest-file.jpg')
    expect(photoUrl({ photo_id: 100 })).toBe('/api/photos/100/thumbnail')
    expect(photoUrl({
      photo_id: 'media-1',
      file_path: 'https://signed.example/jm.jpg',
    })).toBe('https://signed.example/jm.jpg')
  })

  it('sends empty subtitle to clear and omits with null', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    expect(familyJourneyUpdateArgs(id, { status: 'archived' })).toMatchObject({
      p_title: null,
      p_subtitle: null,
      p_status: 'archived',
    })
    expect(familyJourneyUpdateArgs(id, { subtitle: null }).p_subtitle).toBe('')
    expect(familyJourneyUpdateArgs(id, { subtitle: '' }).p_subtitle).toBe('')
    expect(familyJourneyUpdateArgs(id, { subtitle: 'Northern Italy' }).p_subtitle).toBe('Northern Italy')
  })
})

describe('journey image finalize contract', () => {
  it('documents the Family kind without calling Nest', async () => {
    const { finalizePrivateUpload } = await import('./privateUploads')
    expect(finalizePrivateUpload).toBeTypeOf('function')
    vi.stubEnv('VITE_DATA_PLANE', 'supabase')
    expect(JOURNEY_MEDIA_BUCKET).toBe('journey-media')
  })
})
