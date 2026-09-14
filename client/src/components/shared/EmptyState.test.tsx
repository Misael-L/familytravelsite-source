import { render, screen } from '../../../tests/helpers/render'
import { describe, expect, it, vi } from 'vitest'
import EmptyState from './EmptyState'

vi.mock('./TrekMascot', () => ({
  default: ({ scene }: { scene: string }) => <div data-testid="mascot" data-scene={scene} />,
}))

describe('EmptyState', () => {
  it('renders the title and mascot scene', () => {
    render(<EmptyState scene="journey" title="No entries yet" />)
    expect(screen.getByText('No entries yet')).toBeInTheDocument()
    expect(screen.getByTestId('mascot')).toHaveAttribute('data-scene', 'journey')
  })

  it('renders an optional description without treating it as an error', () => {
    render(
      <EmptyState
        scene="journey"
        title="No entries yet"
        description="Add a trip to get started with skeleton entries"
      />,
    )
    expect(screen.getByText('Add a trip to get started with skeleton entries')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
