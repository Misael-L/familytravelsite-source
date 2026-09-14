import { render, screen } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import MobileEntryView from './MobileEntryView'
import type { JourneyEntry } from '../../store/journeyStore'

const entry = {
  id: 'e1',
  journey_id: 'j1',
  author_id: 'a1',
  type: 'entry',
  title: 'Como pier',
  story: 'A quiet morning.',
  entry_date: '2026-08-29',
  visibility: 'private',
  sort_order: 0,
  photos: [],
  created_at: 0,
  updated_at: 0,
  mood: 'good',
  weather: 'sunny',
} as unknown as JourneyEntry

describe('MobileEntryView', () => {
  it('exposes a labelled dialog and localized mood/weather', () => {
    render(
      <MobileEntryView
        entry={entry}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onPhotoClick={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Como pier' })).toBeInTheDocument()
    expect(screen.getByText('Good')).toBeInTheDocument()
    expect(screen.getByText('Sunny')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit entry' })).toBeInTheDocument()
  })

  it('hides edit/delete when read-only and closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MobileEntryView
        entry={entry}
        readOnly
        onClose={onClose}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onPhotoClick={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Edit entry' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
