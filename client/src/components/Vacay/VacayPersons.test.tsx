import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../../tests/helpers/render'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { useVacayStore } from '../../store/vacayStore'
import { useAuthStore } from '../../store/authStore'
import { server } from '../../../tests/helpers/msw/server'
import { http, HttpResponse } from 'msw'
import VacayPersons from './VacayPersons'
import { FamilyVacayProvider, type VacayChromeSession } from '../../pages/vacay/vacaySession'

// ── MSW handler helpers ───────────────────────────────────────────────────────

function withAvailableUsers() {
  server.use(
    http.get('/api/addons/vacay/available-users', () =>
      HttpResponse.json({ users: [{ id: 2, username: 'Bob', email: 'bob@example.com' }] })
    )
  )
}

function withNoAvailableUsers() {
  server.use(
    http.get('/api/addons/vacay/available-users', () =>
      HttpResponse.json({ users: [] })
    )
  )
}

// ── Store seed helpers ────────────────────────────────────────────────────────

function seedVacay(overrides: Record<string, unknown> = {}) {
  seedStore(useVacayStore, {
    users: [],
    pendingInvites: [],
    selectedUserId: 1,
    isFused: false,
    ...overrides,
  })
}

function seedCurrentUser(id = 99) {
  seedStore(useAuthStore, { user: { id, username: `user${id}` } })
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetAllStores()
})

describe('VacayPersons', () => {
  it('FE-COMP-VACAYPERSONS-001: Renders list of users', () => {
    seedVacay({ users: [{ id: 1, username: 'Alice', color: '#6366f1' }] })
    seedCurrentUser(99) // different id so no "(you)" label

    render(<VacayPersons />)

    expect(document.body).toHaveTextContent('Alice')
  })

  it('FE-COMP-VACAYPERSONS-002: Current user shows "(you)" label', () => {
    seedVacay({
      users: [{ id: 1, username: 'Alice', color: '#6366f1' }],
      selectedUserId: 1,
    })
    seedCurrentUser(1) // Alice is the current user

    render(<VacayPersons />)

    expect(document.body).toHaveTextContent('(you)')
  })

  it('FE-COMP-VACAYPERSONS-003: Pending invite rendered with "(pending)" text', () => {
    seedVacay({
      pendingInvites: [{ id: 10, user_id: 2, username: 'Bob' }],
    })
    seedCurrentUser(1)

    render(<VacayPersons />)

    expect(document.body).toHaveTextContent('Bob')
    expect(document.body).toHaveTextContent('(pending)')
  })

  it('FE-COMP-VACAYPERSONS-004: Opens invite modal on UserPlus click', async () => {
    withNoAvailableUsers()
    const user = userEvent.setup()

    seedVacay()
    seedCurrentUser()

    render(<VacayPersons />)

    // With no users seeded the first (and only) button is the UserPlus
    const [userPlusBtn] = screen.getAllByRole('button')
    await user.click(userPlusBtn)

    expect(screen.getByRole('heading', { name: 'Invite User' })).toBeInTheDocument()
  })

  it('FE-COMP-VACAYPERSONS-005: Invite modal fetches and displays available users', async () => {
    withAvailableUsers()
    const user = userEvent.setup()

    seedVacay()
    seedCurrentUser()

    render(<VacayPersons />)

    const [userPlusBtn] = screen.getAllByRole('button')
    await user.click(userPlusBtn)

    // Wait for MSW to respond and the CustomSelect trigger to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /select user/i })).toBeInTheDocument()
    })

    // Open the CustomSelect dropdown
    await user.click(screen.getByRole('button', { name: /select user/i }))

    // Bob should appear as an option in the portal-rendered dropdown
    await waitFor(() => {
      expect(screen.getByText('Bob (bob@example.com)')).toBeInTheDocument()
    })
  })

  it('FE-COMP-VACAYPERSONS-006: Send invite button calls vacayStore.invite', async () => {
    withAvailableUsers()
    const inviteMock = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    seedVacay({ invite: inviteMock })
    seedCurrentUser()

    render(<VacayPersons />)

    // Open invite modal
    const [userPlusBtn] = screen.getAllByRole('button')
    await user.click(userPlusBtn)

    // Wait for CustomSelect to appear after MSW responds
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /select user/i })).toBeInTheDocument()
    )

    // Open dropdown and select Bob
    await user.click(screen.getByRole('button', { name: /select user/i }))
    await waitFor(() => expect(screen.getByText('Bob (bob@example.com)')).toBeInTheDocument())
    await user.click(screen.getByText('Bob (bob@example.com)'))

    // Send the invite
    await user.click(screen.getByRole('button', { name: /send invite/i }))

    expect(inviteMock).toHaveBeenCalledWith(2)
  })

  it('FE-COMP-VACAYPERSONS-007: Invite modal closes on cancel', async () => {
    withNoAvailableUsers()
    const user = userEvent.setup()

    seedVacay()
    seedCurrentUser()

    render(<VacayPersons />)

    const [userPlusBtn] = screen.getAllByRole('button')
    await user.click(userPlusBtn)

    expect(screen.getByRole('heading', { name: 'Invite User' })).toBeInTheDocument()

    // The Cancel button in the modal footer (no pending invites are seeded so it is unique)
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.queryByRole('heading', { name: 'Invite User' })).not.toBeInTheDocument()
  })

  it('FE-COMP-VACAYPERSONS-008: Color picker opens on color dot click', async () => {
    const user = userEvent.setup()

    seedVacay({ users: [{ id: 1, username: 'Alice', color: '#6366f1' }] })
    seedCurrentUser(99)

    render(<VacayPersons />)

    // The color dot button is identified by its title attribute "Change color"
    await user.click(screen.getByRole('button', { name: 'Change color' }))

    // Color picker modal heading is rendered via portal
    expect(screen.getByRole('heading', { name: 'Change color' })).toBeInTheDocument()
  })

  it('FE-COMP-VACAYPERSONS-009: Selecting a preset color calls updateColor', async () => {
    const updateColorMock = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    seedVacay({
      users: [{ id: 1, username: 'Alice', color: '#6366f1' }],
      updateColor: updateColorMock,
    })
    seedCurrentUser(99)

    render(<VacayPersons />)

    // Open color picker for Alice (id=1)
    await user.click(screen.getByRole('button', { name: 'Change color' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Change color' })).toBeInTheDocument()
    )

    // Preset swatches: buttons with a backgroundColor inline style, no text content, no title.
    // The color dot trigger button is excluded because it has title="Change color".
    const allBtns = screen.getAllByRole('button')
    const colorSwatches = allBtns.filter(
      b => b.style.backgroundColor && !b.textContent?.trim() && !b.title
    )

    expect(colorSwatches.length).toBeGreaterThan(0)

    // Click the first swatch – PRESET_COLORS[0] is '#6366f1'
    await user.click(colorSwatches[0])

    expect(updateColorMock).toHaveBeenCalledWith('#6366f1', 1)
  })

  it('FE-COMP-VACAYPERSONS-010: isFused enables row click to select user', async () => {
    const setSelectedUserIdMock = vi.fn()
    const user = userEvent.setup()

    seedVacay({
      users: [
        { id: 1, username: 'Alice', color: '#6366f1' },
        { id: 2, username: 'Bob', color: '#ec4899' },
      ],
      isFused: true,
      selectedUserId: 1, // non-null: prevents useEffect from calling the mock
      setSelectedUserId: setSelectedUserIdMock,
    })
    seedCurrentUser(99) // distinct id to avoid the "(you)" label

    render(<VacayPersons />)

    // Clicking Bob's name text bubbles up to the row div's onClick
    await user.click(screen.getByText('Bob'))

    expect(setSelectedUserIdMock).toHaveBeenCalledWith(2)
  })

  it('FE-COMP-VACAYPERSONS-011: isFused false disables row selection', async () => {
    const setSelectedUserIdMock = vi.fn()
    const user = userEvent.setup()

    seedVacay({
      users: [{ id: 2, username: 'Bob', color: '#ec4899' }],
      isFused: false,
      selectedUserId: 1, // non-null: prevents useEffect from calling the mock
      setSelectedUserId: setSelectedUserIdMock,
    })
    seedCurrentUser(99)

    render(<VacayPersons />)

    await user.click(screen.getByText('Bob'))

    expect(setSelectedUserIdMock).not.toHaveBeenCalled()
  })
})

function familyPersonsSession(overrides: Partial<VacayChromeSession> = {}): VacayChromeSession {
  return {
    familyChrome: true,
    plan: null,
    users: [
      { id: 'p1', username: 'Ada', color: '#6366f1' },
    ],
    pendingInvites: [],
    isFused: true,
    entries: [],
    companyHolidays: [],
    stats: [],
    selectedYear: 2026,
    selectedUserId: 'p1',
    holidays: {},
    tripWindows: [],
    approvedTripDates: new Set(),
    proposedTripDates: new Set(),
    currentPersonId: 'p1',
    canReview: false,
    overlayMode: 'add',
    overlayPresets: [
      { id: 'h', name: 'Household', enabled: false, personIds: ['p1'] },
      { id: 'f', name: 'Family', enabled: false, personIds: ['p1'] },
    ],
    overlayPeople: [],
    pendingOutgoing: [],
    incomingAccess: [],
    setSelectedUserId: vi.fn(),
    updatePlan: vi.fn(),
    updateColor: vi.fn(),
    invite: vi.fn(),
    cancelInvite: vi.fn(),
    dissolve: vi.fn(),
    toggleEntry: vi.fn(),
    toggleCompanyHoliday: vi.fn(),
    loadStats: vi.fn(),
    updateVacationDays: vi.fn(),
    addHolidayCalendar: vi.fn(),
    updateHolidayCalendar: vi.fn(),
    deleteHolidayCalendar: vi.fn(),
    toggleOverlayPreset: vi.fn(),
    addOverlayPerson: vi.fn(),
    removeOverlayPerson: vi.fn(),
    requestCalendarAccess: vi.fn(),
    revokeCalendarAccess: vi.fn(),
    loadOverlayPickerOptions: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

describe('VacayPersons family chrome gates', () => {
  it('defaults to you plus Household/Family toggles', () => {
    render(
      <FamilyVacayProvider value={familyPersonsSession()}>
        <VacayPersons />
      </FamilyVacayProvider>,
    )
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('(you)')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Household' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Family' })).toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
  })

  it('HOF plus opens Add Individual User without Nest invite copy', async () => {
    const user = userEvent.setup()
    render(
      <FamilyVacayProvider value={familyPersonsSession({ overlayMode: 'add', canReview: true })}>
        <VacayPersons />
      </FamilyVacayProvider>,
    )
    await user.click(screen.getAllByRole('button')[0])
    expect(screen.getByRole('heading', { name: 'Add Individual User' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Invite User' })).not.toBeInTheDocument()
  })

  it('child plus opens Request access', async () => {
    const user = userEvent.setup()
    render(
      <FamilyVacayProvider value={familyPersonsSession({ overlayMode: 'request', canReview: false })}>
        <VacayPersons />
      </FamilyVacayProvider>,
    )
    await user.click(screen.getAllByRole('button')[0])
    expect(screen.getByRole('heading', { name: 'Request access' })).toBeInTheDocument()
  })

  it('guest can change own color but not overlay extras', async () => {
    const user = userEvent.setup()
    render(
      <FamilyVacayProvider value={familyPersonsSession({
        canReview: false,
        overlayPeople: [{ id: 'p2', username: 'Bob', color: '#ec4899' }],
      })}>
        <VacayPersons />
      </FamilyVacayProvider>,
    )

    const colorButtons = screen.getAllByRole('button', { name: 'Change color' })
    expect(colorButtons).toHaveLength(1)
    await user.click(colorButtons[0])
    expect(screen.getByRole('heading', { name: 'Change color' })).toBeInTheDocument()
  })

  it('preset toggle does not retarget the paint brush', async () => {
    const setSelectedUserId = vi.fn()
    const toggleOverlayPreset = vi.fn()
    const user = userEvent.setup()
    render(
      <FamilyVacayProvider value={familyPersonsSession({ setSelectedUserId, toggleOverlayPreset })}>
        <VacayPersons />
      </FamilyVacayProvider>,
    )
    await user.click(screen.getByRole('switch', { name: 'Household' }))
    expect(toggleOverlayPreset).toHaveBeenCalledWith('h', true)
    expect(setSelectedUserId).not.toHaveBeenCalled()
  })

  it('reviewer can change overlay individual color', async () => {
    render(
      <FamilyVacayProvider value={familyPersonsSession({
        canReview: true,
        overlayPeople: [{ id: 'p2', username: 'Bob', color: '#ec4899' }],
      })}>
        <VacayPersons />
      </FamilyVacayProvider>,
    )
    expect(screen.getAllByRole('button', { name: 'Change color' })).toHaveLength(2)
  })
})
