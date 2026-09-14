import { render, screen } from '../../../tests/helpers/render'
import { describe, expect, it, vi } from 'vitest'
import MobileEntryCard from './MobileEntryCard'
import type { JourneyEntry } from '../../store/journeyStore'

const base = {
  id: 'e1',
  type: 'entry',
  title: null,
  location_name: null,
  location_lat: null,
  location_lng: null,
  entry_date: '2026-08-29',
  photos: [],
  story: null,
} as unknown as JourneyEntry

describe('MobileEntryCard', () => {
  it('keeps 0,0 on the map instead of treating it as missing', () => {
    render(
      <MobileEntryCard
        entry={{ ...base, location_lat: 0, location_lng: 0, location_name: null }}
        dayLabel={1}
        dayColor="#111"
        isActive
        onClick={vi.fn()}
      />,
    )
    expect(screen.getByText('On the map')).toBeInTheDocument()
    expect(screen.queryByText('No location')).not.toBeInTheDocument()
  })

  it('uses localized untitled fallback', () => {
    render(
      <MobileEntryCard
        entry={base}
        dayLabel={1}
        dayColor="#111"
        isActive={false}
        onClick={vi.fn()}
      />,
    )
    expect(screen.getByText('Untitled')).toBeInTheDocument()
    expect(screen.getByText('No location')).toBeInTheDocument()
  })
})
