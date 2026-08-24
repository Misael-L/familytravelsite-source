import { render, screen, waitFor } from '../../../tests/helpers/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { buildUser } from '../../../tests/helpers/factories'
import { useAuthStore } from '../../store/authStore'
import { ToastContainer } from '../../components/shared/Toast'
import VacayPage from '../VacayPage'
import { loadVacayYear, emptyVacayOverlay } from '../../data/supabase/vacay'
import { fetchNagerPublicHolidays } from '../../data/supabase/nagerHolidays'

const { isSupabaseMock } = vi.hoisted(() => ({
  isSupabaseMock: vi.fn(() => true),
}))

vi.mock('../../data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('../../data/supabase/vacay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/vacay')>()
  return {
    ...actual,
    loadVacayYear: vi.fn(),
    listCalendarEntries: vi.fn().mockResolvedValue([]),
    listPtoYears: vi.fn().mockResolvedValue([]),
    listBlockedDates: vi.fn().mockResolvedValue([]),
    toggleCalendarEntry: vi.fn(),
    upsertCalendarSettings: vi.fn(),
    upsertPtoYear: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('../../data/supabase/nagerHolidays', () => ({
  fetchNagerPublicHolidays: vi.fn(),
  fetchNagerCountries: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../components/Layout/Navbar', () => ({
  default: () => <nav data-testid="navbar" />,
}))

vi.mock('../../api/websocket', () => ({
  addListener: vi.fn(),
  removeListener: vi.fn(),
}))

describe('Family Vacay hub chrome', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
    isSupabaseMock.mockReturnValue(true)
    vi.mocked(fetchNagerPublicHolidays).mockResolvedValue([])
    seedStore(useAuthStore, {
      isAuthenticated: true,
      user: buildUser(),
      familyId: 'fam-1',
      personId: 'p1',
      membershipRole: 'parent',
    })
    vi.mocked(loadVacayYear).mockResolvedValue({
      settings: {
        familyId: 'fam-1',
        blockWeekends: true,
        weekendDays: '0,6',
        weekStart: 1,
        holidaysEnabled: false,
        familyDaysEnabled: true,
        carryOverEnabled: true,
        visibleYears: [2026],
      },
      plan: {
        id: 'fam-1',
        holidays_enabled: false,
        holidays_region: null,
        holiday_calendars: [],
        block_weekends: true,
        carry_over_enabled: true,
        company_holidays_enabled: true,
        weekend_days: '0,6',
        week_start: 1,
      },
      users: [{ id: 'p1', username: 'Ada Lovelace', color: '#6366f1' }],
      entries: [],
      blockedDates: [],
      ptoRows: [],
      tripWindows: [],
      overlay: {
        ...emptyVacayOverlay('p1'),
        presets: [
          { id: 'h', name: 'Household', enabled: false, personIds: ['p1'] },
          { id: 'f', name: 'Family', enabled: false, personIds: ['p1'] },
        ],
      },
    })
  })

  it('shows family roster names and hides Nest invite chrome', async () => {
    render(
      <>
        <ToastContainer />
        <VacayPage />
      </>,
    )
    await waitFor(() => {
      expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0)
    })
    expect(screen.queryByRole('heading', { name: /invite user/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/fusion request/i)).not.toBeInTheDocument()
    expect(screen.getByText('Household')).toBeInTheDocument()
    expect(screen.getByText('Family')).toBeInTheDocument()
    expect(screen.getByText('School')).toBeInTheDocument()
    expect(screen.getAllByText('Family day').length).toBeGreaterThan(0)
    expect(screen.getByText('Inspect')).toBeInTheDocument()
  })

  it('toasts missingPerson when family profile is not linked', async () => {
    seedStore(useAuthStore, {
      isAuthenticated: true,
      user: buildUser(),
      familyId: null,
      personId: null,
    })
    render(
      <>
        <ToastContainer />
        <VacayPage />
      </>,
    )
    await waitFor(() => {
      expect(screen.getByText(/family profile is not linked/i)).toBeInTheDocument()
    })
    expect(loadVacayYear).not.toHaveBeenCalled()
  })

  it('does not blank the page when overlay enrichment is empty after a core load', async () => {
    render(<VacayPage />)
    await waitFor(() => {
      expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0)
    })
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument()
  })

  it('reviewer sees add-year chrome and year chevrons', async () => {
    render(<VacayPage />)
    await waitFor(() => {
      expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByTitle('Add previous year').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('Add next year').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('svg.lucide-chevron-left').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('svg.lucide-chevron-right').length).toBeGreaterThan(0)
  })

  it('guest keeps year chevrons but not add/remove year', async () => {
    seedStore(useAuthStore, {
      isAuthenticated: true,
      user: buildUser(),
      familyId: 'fam-1',
      personId: 'p1',
      membershipRole: 'guest',
    })
    vi.mocked(loadVacayYear).mockResolvedValue({
      settings: {
        familyId: 'fam-1',
        blockWeekends: true,
        weekendDays: '0,6',
        weekStart: 1,
        holidaysEnabled: false,
        familyDaysEnabled: true,
        carryOverEnabled: true,
        visibleYears: [2025, 2026],
      },
      plan: {
        id: 'fam-1',
        holidays_enabled: false,
        holidays_region: null,
        holiday_calendars: [],
        block_weekends: true,
        carry_over_enabled: true,
        company_holidays_enabled: true,
        weekend_days: '0,6',
        week_start: 1,
      },
      users: [{ id: 'p1', username: 'Ada Lovelace', color: '#6366f1' }],
      entries: [],
      blockedDates: [],
      ptoRows: [],
      tripWindows: [],
      overlay: emptyVacayOverlay('p1'),
    })
    render(<VacayPage />)
    await waitFor(() => {
      expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0)
    })
    expect(screen.queryByTitle('Add previous year')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Add next year')).not.toBeInTheDocument()
    expect(document.querySelectorAll('svg.lucide-minus').length).toBe(0)
    expect(document.querySelectorAll('svg.lucide-chevron-left').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('svg.lucide-chevron-right').length).toBeGreaterThan(0)
  })

  it('keeps the calendar mounted when switching years after boot', async () => {
    const payload = {
      settings: {
        familyId: 'fam-1',
        blockWeekends: true,
        weekendDays: '0,6',
        weekStart: 1,
        holidaysEnabled: false,
        familyDaysEnabled: true,
        carryOverEnabled: true,
        visibleYears: [2025, 2026],
      },
      plan: {
        id: 'fam-1',
        holidays_enabled: false,
        holidays_region: null,
        holiday_calendars: [],
        block_weekends: true,
        carry_over_enabled: true,
        company_holidays_enabled: true,
        weekend_days: '0,6',
        week_start: 1,
      },
      users: [{ id: 'p1', username: 'Ada Lovelace', color: '#6366f1' }],
      entries: [],
      blockedDates: [],
      ptoRows: [],
      tripWindows: [],
      overlay: {
        ...emptyVacayOverlay('p1'),
        presets: [
          { id: 'h', name: 'Household', enabled: false, personIds: ['p1'] },
          { id: 'f', name: 'Family', enabled: false, personIds: ['p1'] },
        ],
      },
    }
    let releaseSecond: () => void = () => {}
    const secondLoad = new Promise<void>(resolve => { releaseSecond = resolve })
    let calls = 0
    vi.mocked(loadVacayYear).mockImplementation(async () => {
      calls += 1
      if (calls > 1) await secondLoad
      return payload
    })

    render(
      <>
        <ToastContainer />
        <VacayPage />
      </>,
    )
    await waitFor(() => {
      expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0)
    })
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getAllByText('2025')[0])
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument()
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0)
    releaseSecond()
    await waitFor(() => expect(calls).toBeGreaterThan(1))
  })
})
