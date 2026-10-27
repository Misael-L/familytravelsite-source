import { render, screen } from '../../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import FamilyDayTimelineRow from './FamilyDayTimelineRow'
import type { FamilyScheduleItem } from '../../../data/supabase/scheduleItems'

const item: FamilyScheduleItem = {
  id: 'item-1',
  tripId: 'trip-1',
  activity: 'Museum hour',
  placeId: null,
  startsAt: '2026-08-13T02:00:00.000Z',
  endsAt: null,
  address: null,
  timeZone: 'America/Mexico_City',
  sortOrder: 0,
  experienceId: null,
  foodId: null,
  linkUrl: null,
}

describe('FamilyDayTimelineRow', () => {
  it('shows the clock, opens a linked booking, and keeps move and delete separate', async () => {
    const user = userEvent.setup()
    const onMoveItem = vi.fn()
    const onRemoveItem = vi.fn()
    const onActivate = vi.fn()
    render(
      <FamilyDayTimelineRow
        dayId="day-1"
        item={item}
        place={undefined}
        isFirst={false}
        isLast={false}
        clockLabel="02:00 UTC · America/Mexico_City"
        moveUpEnabled={false}
        moveDownEnabled
        onActivate={onActivate}
        onMoveItem={onMoveItem}
        onRemoveItem={onRemoveItem}
      />,
    )
    expect(screen.getByText('02:00 UTC · America/Mexico_City')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Museum hour' }))
    expect(onActivate).toHaveBeenCalled()
    expect(onMoveItem).not.toHaveBeenCalled()
    expect(onRemoveItem).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Move up' }))
    expect(onMoveItem).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onRemoveItem).toHaveBeenCalledWith('item-1')
  })
})
