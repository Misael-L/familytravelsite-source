import { render, screen } from '../../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { FamilyCalendarSubscribeModal } from './FamilyCalendarSubscribeModal'
import {
  disableCalendarFeed,
  enableCalendarFeed,
  fetchCalendarFeedUrl,
  regenerateCalendarFeed,
} from '../../../data/supabase/calendarFeed'

vi.mock('../../../data/supabase/calendarFeed', async () => {
  const actual = await vi.importActual<typeof import('../../../data/supabase/calendarFeed')>(
    '../../../data/supabase/calendarFeed',
  )
  return {
    ...actual,
    fetchCalendarFeedUrl: vi.fn(),
    enableCalendarFeed: vi.fn(),
    regenerateCalendarFeed: vi.fn(),
    disableCalendarFeed: vi.fn(),
  }
})

const FEED = 'https://example.supabase.co/functions/v1/calendar-feed?token=abc&apikey=anon-key'

describe('FamilyCalendarSubscribeModal', () => {
  beforeEach(() => {
    vi.mocked(fetchCalendarFeedUrl).mockReset()
    vi.mocked(enableCalendarFeed).mockReset()
    vi.mocked(regenerateCalendarFeed).mockReset()
    vi.mocked(disableCalendarFeed).mockReset()
  })

  it('GETs on open and enables with POST, without minting on load', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchCalendarFeedUrl).mockResolvedValue(null)
    vi.mocked(enableCalendarFeed).mockResolvedValue(FEED)

    render(
      <FamilyCalendarSubscribeModal familyId="fam-1" personId="per-1" onClose={() => {}} />,
    )

    expect(await screen.findByText('Enable calendar subscription')).toBeInTheDocument()
    expect(fetchCalendarFeedUrl).toHaveBeenCalledWith('fam-1', 'per-1')
    expect(enableCalendarFeed).not.toHaveBeenCalled()

    await user.click(screen.getByText('Enable calendar subscription'))
    expect(enableCalendarFeed).toHaveBeenCalledWith('fam-1', 'per-1')
    expect(await screen.findByText('Add to Google Calendar')).toBeInTheDocument()
  })

  it('shows adapter errors instead of swallowing them', async () => {
    vi.mocked(fetchCalendarFeedUrl).mockRejectedValue(new Error('You can only manage your own calendar feed'))
    render(
      <FamilyCalendarSubscribeModal familyId="fam-1" personId="per-1" onClose={() => {}} />,
    )
    expect(await screen.findByText('You can only manage your own calendar feed')).toBeInTheDocument()
  })
})
