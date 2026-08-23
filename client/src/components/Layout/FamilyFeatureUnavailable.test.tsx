import { render, screen } from '../../../tests/helpers/render'
import FamilyFeatureUnavailable from './FamilyFeatureUnavailable'

describe('FamilyFeatureUnavailable', () => {
  it('routes back to the dashboard instead of a blank page', () => {
    render(<FamilyFeatureUnavailable />)
    expect(screen.getByRole('heading', { name: /isn’t available for your family/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to my trips/i })).toHaveAttribute('href', '/dashboard')
  })
})
