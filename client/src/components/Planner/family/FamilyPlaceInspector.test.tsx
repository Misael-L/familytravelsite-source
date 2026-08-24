import { render, screen } from '../../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import FamilyPlaceInspector from './FamilyPlaceInspector'
import type { FamilyTripPlace } from '../../../data/supabase/tripPlaces'

vi.mock('../../Files/FamilyFileAttach', () => ({
  default: () => null,
}))

const place: FamilyTripPlace = {
  id: 'p1',
  name: 'Cernobbio',
  lat: 45.84,
  lng: 9.08,
  notes: null,
  timeZone: null,
  countryId: null,
  placeTypeId: 'city',
  isPrimary: true,
  imageUrl: null,
  familyPlaceCategoryId: 'cat-1',
  familyPlaceCategoryName: 'Food',
  familyPlaceCategoryColor: '#10b981',
  familyPlaceCategoryIcon: 'Utensils',
}

describe('FamilyPlaceInspector category', () => {
  it('shows the Family category and opens edit without the later toast', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onToastWrite = vi.fn()
    render(
      <FamilyPlaceInspector
        place={place}
        tripId="t1"
        familyId="fam-1"
        canMutate
        mePersonId="me"
        onClose={() => {}}
        onDelete={() => {}}
        onAssignToDay={() => {}}
        onEdit={onEdit}
        onToastWrite={onToastWrite}
      />,
    )
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('Primary')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /edit/i }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onToastWrite).not.toHaveBeenCalled()
  })

  it('hides category chrome and the picker action when the feature is off', () => {
    render(
      <FamilyPlaceInspector
        place={place}
        tripId="t1"
        familyId="fam-1"
        canMutate
        mePersonId="me"
        onClose={() => {}}
        onDelete={() => {}}
        onAssignToDay={() => {}}
        onEdit={() => {}}
        categoriesEnabled={false}
        onToastWrite={() => {}}
      />,
    )
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.getByText('Primary')).toBeInTheDocument()
  })
})
