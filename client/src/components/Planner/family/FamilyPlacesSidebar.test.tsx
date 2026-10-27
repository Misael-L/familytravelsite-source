import { render, screen } from '../../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import FamilyPlacesSidebar from './FamilyPlacesSidebar'
import type { FamilyTripPlace } from '../../../data/supabase/tripPlaces'
import type { FamilyTripTrack } from '../../../data/supabase/tripTracks'

const place: FamilyTripPlace = {
  id: 'p1',
  name: 'Cernobbio',
  lat: 45.84,
  lng: 9.08,
  notes: null,
  timeZone: null,
  countryId: null,
  placeTypeId: null,
  isPrimary: true,
  imageUrl: null,
  familyPlaceCategoryId: null,
  familyPlaceCategoryName: null,
  familyPlaceCategoryColor: null,
  familyPlaceCategoryIcon: null,
}

const track: FamilyTripTrack = {
  id: 'tr1',
  tripId: 't1',
  name: 'Ridge hike',
  kind: 'track',
  source: 'gpx',
  sourceFilename: 'ridge.gpx',
  geometry: { type: 'LineString', coordinates: [[9.08, 45.84], [9.09, 45.85]] },
  startLat: 45.84,
  startLng: 9.08,
  color: null,
  createdByPersonId: 'me',
  createdAt: '2026-08-14T00:00:00Z',
  updatedAt: '2026-08-14T00:00:00Z',
  waypoints: [],
}

function setup(opts?: { canMutate?: boolean; tracks?: FamilyTripTrack[]; places?: FamilyTripPlace[] }) {
  const onToastWrite = vi.fn()
  const onImportFile = vi.fn()
  const onDeleteTrack = vi.fn()
  const onSelectPlace = vi.fn()
  const onAssignToDay = vi.fn()
  render(
    <FamilyPlacesSidebar
      places={opts?.places ?? [place]}
      tracks={opts?.tracks ?? []}
      plannedPlaceIds={new Set()}
      selectedPlaceId={null}
      canMutate={opts?.canMutate ?? true}
      onSelectPlace={onSelectPlace}
      onAddPlace={() => {}}
      onDeletePlace={() => {}}
      onAssignToDay={onAssignToDay}
      onImportFile={onImportFile}
      onDeleteTrack={onDeleteTrack}
      onEditPlace={() => {}}
      onToastWrite={onToastWrite}
    />,
  )
  return { onToastWrite, onImportFile, onDeleteTrack, onSelectPlace, onAssignToDay }
}

describe('FamilyPlacesSidebar import', () => {
  it('preserves UUID selection and keeps the assign action separate from row activation', async () => {
    const user = userEvent.setup()
    const { onSelectPlace, onAssignToDay } = setup()
    const row = screen.getByRole('option', {name: 'Cernobbio'})
    row.focus()
    await user.keyboard('{Enter}')
    expect(onSelectPlace).toHaveBeenCalledWith('p1')
    onSelectPlace.mockClear()
    await user.click(screen.getByRole('button', {name: '+ Day'}))
    expect(onAssignToDay).toHaveBeenCalledWith('p1')
    expect(onSelectPlace).not.toHaveBeenCalled()
  })

  it('sorts and searches the existing Family records through the copied header controls', async () => {
    const user = userEvent.setup()
    const { onToastWrite } = setup({places: [{...place, name: 'Zed'}, {...place, id: 'p2', name: 'Alpha'}]})
    const order = () => screen.getAllByRole('option').map(row => row.getAttribute('data-place-id'))
    expect(order()).toEqual(['p1', 'p2'])
    await user.click(screen.getByRole('button', {name: 'Sort by'}))
    expect(order()).toEqual(['p2', 'p1'])
    await user.type(screen.getByRole('textbox', {name: 'Search'}), 'Alpha')
    expect(order()).toEqual(['p2'])
    expect(onToastWrite).not.toHaveBeenCalled()
  })

  it('HOF Import file does not toast importLater', async () => {
    const user = userEvent.setup()
    const { onToastWrite, onImportFile } = setup({ canMutate: true })
    await user.click(screen.getByRole('button', { name: /import file/i }))
    expect(onImportFile).toHaveBeenCalledTimes(1)
    expect(onToastWrite).not.toHaveBeenCalledWith('import')
  })

  it('omits the unconnected List Import action instead of presenting a placeholder', () => {
    const { onToastWrite } = setup()
    expect(screen.queryByRole('button', {name: /list import/i})).not.toBeInTheDocument()
    expect(onToastWrite).not.toHaveBeenCalled()
  })

  it('shows recorded tracks through the upstream Show dropdown', async () => {
    const user = userEvent.setup()
    setup({ tracks: [track] })
    await user.click(screen.getByRole('button', {name: 'Show'}))
    await user.click(screen.getByRole('option', {name: /tracks/i}))
    expect(screen.getByText('Ridge hike')).toBeInTheDocument()
    expect(screen.queryByText('Cernobbio')).not.toBeInTheDocument()
  })

  it('filters destinations by Family category without bulk assignment', async () => {
    const user = userEvent.setup()
    const food = { ...place, id: 'p2', name: 'Villa dEste', isPrimary: false, familyPlaceCategoryId: 'cat-1', familyPlaceCategoryName: 'Food', familyPlaceCategoryColor: '#10b981', familyPlaceCategoryIcon: 'Utensils' }
    const onToastWrite = vi.fn()
    render(
      <FamilyPlacesSidebar
        places={[place, food]}
        tracks={[]}
        plannedPlaceIds={new Set()}
        selectedPlaceId={null}
        canMutate
        onSelectPlace={() => {}}
        onAddPlace={() => {}}
        onDeletePlace={() => {}}
        onAssignToDay={() => {}}
        onImportFile={() => {}}
        onDeleteTrack={() => {}}
        onEditPlace={() => {}}
        onToastWrite={onToastWrite}
        categories={[{ id: 'cat-1', familyId: 'fam-1', name: 'Food', colorHex: '#10b981', iconKey: 'Utensils', sortOrder: 0 }]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /all categories/i }))
    await user.click(screen.getByRole('button', { name: /food/i }))
    expect(screen.getByText('Villa dEste')).toBeInTheDocument()
    expect(screen.queryByText('Cernobbio')).not.toBeInTheDocument()
  })

  it('hides category filter and labels when the feature is off', () => {
    const food = { ...place, id: 'p2', name: 'Villa dEste', isPrimary: false, familyPlaceCategoryId: 'cat-1', familyPlaceCategoryName: 'Food', familyPlaceCategoryColor: '#10b981', familyPlaceCategoryIcon: 'Utensils' }
    render(
      <FamilyPlacesSidebar
        places={[place, food]}
        tracks={[]}
        plannedPlaceIds={new Set()}
        selectedPlaceId={null}
        canMutate
        onSelectPlace={() => {}}
        onAddPlace={() => {}}
        onDeletePlace={() => {}}
        onAssignToDay={() => {}}
        onImportFile={() => {}}
        onDeleteTrack={() => {}}
        onEditPlace={() => {}}
        onToastWrite={() => {}}
        categories={[{ id: 'cat-1', familyId: 'fam-1', name: 'Food', colorHex: '#10b981', iconKey: 'Utensils', sortOrder: 0 }]}
        categoriesEnabled={false}
      />,
    )
    expect(screen.queryByRole('button', { name: /all categories/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
    expect(screen.getByText('Villa dEste')).toBeInTheDocument()
  })
})
