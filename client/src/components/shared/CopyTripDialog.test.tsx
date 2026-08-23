import { render, screen } from '../../../tests/helpers/render'
import CopyTripDialog, { FAMILY_COPY_WILL_KEYS, FAMILY_COPY_WONT_KEYS } from './CopyTripDialog'

describe('CopyTripDialog', () => {
  it('defaults to TREK Nest magazine copy lists', () => {
    render(
      <CopyTripDialog isOpen tripTitle="Paris Adventure" onClose={() => {}} onConfirm={() => {}} />,
    )
    expect(screen.getByText('Budget items & category order')).toBeInTheDocument()
    expect(screen.getByText('Packing lists (unchecked)')).toBeInTheDocument()
    expect(screen.queryByText('Dates, cover image & notes')).not.toBeInTheDocument()
  })

  it('renders honest Family lists when Family keys are passed', () => {
    render(
      <CopyTripDialog
        isOpen
        tripTitle="Paris Adventure"
        onClose={() => {}}
        onConfirm={() => {}}
        willCopyKeys={FAMILY_COPY_WILL_KEYS}
        wontCopyKeys={FAMILY_COPY_WONT_KEYS}
      />,
    )
    expect(screen.getByText('Dates, cover image & notes')).toBeInTheDocument()
    expect(screen.getByText('Countries & places')).toBeInTheDocument()
    expect(screen.getByText('Travelers')).toBeInTheDocument()
    expect(screen.getByText('Occasion & reminder preference')).toBeInTheDocument()
    expect(screen.getByText('Plan, bookings, costs, notes, and tracks')).toBeInTheDocument()
    expect(screen.getByText('Files and photos')).toBeInTheDocument()
    expect(screen.getByText('Votes on the original proposal (this copy is a new submission)')).toBeInTheDocument()
    expect(screen.queryByText('Budget items & category order')).not.toBeInTheDocument()
  })
})
