import { render, screen } from '../../../tests/helpers/render'
import { describe, expect, it, vi } from 'vitest'
import { GalleryView } from './JourneyDetailPageGalleryView'
import type { GalleryPhoto } from '../../store/journeyStore'

vi.mock('../../data/supabase/auth', () => ({
  isSupabaseDataPlane: () => true,
}))

vi.mock('../../pages/journeyDetail/JourneyDetailPage.helpers', () => ({
  photoUrl: () => '/thumb.jpg',
}))

const photo = {
  id: 'p1',
  journey_id: 'j1',
  photo_id: 'ph1',
  caption: 'Lake',
  shared: 0,
  sort_order: 0,
  created_at: 0,
  thumbnail_path: '/thumb.jpg',
} as GalleryPhoto

describe('GalleryView permissions', () => {
  it('shows upload and delete for editors', () => {
    render(
      <GalleryView
        entries={[]}
        gallery={[photo]}
        journeyId="j1"
        userId="u1"
        trips={[]}
        canEdit
        onPhotoClick={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete photo' })).toBeInTheDocument()
  })

  it('hides upload and delete for viewers', () => {
    render(
      <GalleryView
        entries={[]}
        gallery={[photo]}
        journeyId="j1"
        userId="u1"
        trips={[]}
        canEdit={false}
        onPhotoClick={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete photo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lake' })).toBeInTheDocument()
  })
})
