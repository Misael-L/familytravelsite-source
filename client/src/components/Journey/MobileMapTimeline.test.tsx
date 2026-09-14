import React from 'react'
import { render, screen } from '../../../tests/helpers/render'
import { describe, expect, it, vi } from 'vitest'
import MobileMapTimeline from './MobileMapTimeline'

let lastAutoProps: { publicMap?: boolean } = {}

vi.mock('./JourneyMapAuto', () => ({
  default: React.forwardRef((props: { publicMap?: boolean }, ref: React.Ref<unknown>) => {
    lastAutoProps = props
    React.useImperativeHandle(ref, () => ({
      highlightMarker: vi.fn(),
      focusMarker: vi.fn(),
      invalidateSize: vi.fn(),
    }))
    return <div data-testid="journey-map-auto" />
  }),
}))

describe('MobileMapTimeline', () => {
  it('uses JourneyMapAuto and the shared empty state when there are no entries', () => {
    render(
      <MobileMapTimeline
        entries={[]}
        mapEntries={[]}
        onEntryClick={vi.fn()}
        onAddEntry={vi.fn()}
      />,
    )
    expect(screen.getByTestId('journey-map-auto')).toBeInTheDocument()
    expect(screen.getByText('No entries yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add entry' })).toBeInTheDocument()
  })

  it('hides the add-entry control when read-only', () => {
    render(
      <MobileMapTimeline
        entries={[]}
        mapEntries={[]}
        readOnly
        onEntryClick={vi.fn()}
        onAddEntry={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Add entry' })).not.toBeInTheDocument()
  })

  it('passes publicMap through so share pages cannot use Family credentials', () => {
    lastAutoProps = {}
    render(
      <MobileMapTimeline
        entries={[]}
        mapEntries={[]}
        readOnly
        publicMap
        onEntryClick={vi.fn()}
      />,
    )
    expect(lastAutoProps.publicMap).toBe(true)
  })
})
