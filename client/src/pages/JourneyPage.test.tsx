// FE-PAGE-JOURNEY-001 to FE-PAGE-JOURNEY-010
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/helpers/msw/server';
import { resetAllStores, seedStore } from '../../tests/helpers/store';
import { buildUser } from '../../tests/helpers/factories';
import { useAuthStore } from '../store/authStore';
import { useAddonStore } from '../store/addonStore';
import { usePermissionsStore } from '../store/permissionsStore';
import JourneyPage from './JourneyPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../components/Layout/Navbar', () => ({
  default: () => <nav data-testid="navbar" />,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

let _seq = 500;
function nextId(): number {
  return ++_seq;
}

function buildJourneyListItem(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as number) ?? nextId();
  return {
    id,
    user_id: 1,
    title: `Journey ${id}`,
    subtitle: null,
    cover_gradient: null,
    cover_image: null,
    status: 'draft' as const,
    entry_count: 0,
    photo_count: 0,
    place_count: 0,
    trip_date_min: null as string | null,
    trip_date_max: null as string | null,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

function seedDefaults() {
  seedStore(useAuthStore, { isAuthenticated: true, user: buildUser() });
  seedStore(useAddonStore, {
    addons: [{ id: 'journey', type: 'global', enabled: true }],
  } as any);
  seedStore(usePermissionsStore, { level: 'owner' } as any);
}

function setupDefaultHandlers(journeys: ReturnType<typeof buildJourneyListItem>[] = []) {
  server.use(
    http.get('/api/journeys', () =>
      HttpResponse.json({ journeys })
    ),
    http.get('/api/journeys/suggestions', () =>
      HttpResponse.json({ trips: [] })
    ),
    http.get('/api/journeys/available-trips', () =>
      HttpResponse.json({ trips: [] })
    ),
  );
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockNavigate.mockReset();
  resetAllStores();
  seedDefaults();
  setupDefaultHandlers();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('JourneyPage', () => {
  // FE-PAGE-JOURNEY-001
  it('FE-PAGE-JOURNEY-001: renders without crashing', async () => {
    render(<JourneyPage />);
    await waitFor(() => {
      expect(screen.getByTestId('navbar')).toBeInTheDocument();
    });
  });

  // FE-PAGE-JOURNEY-002
  it('FE-PAGE-JOURNEY-002: shows loading state', async () => {
    server.use(
      http.get('/api/journeys', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return HttpResponse.json({ journeys: [] });
      }),
    );
    render(<JourneyPage />);
    // The spinner has animate-spin class while loading with no journeys
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  // FE-PAGE-JOURNEY-003
  it('FE-PAGE-JOURNEY-003: shows empty state when no journeys', async () => {
    setupDefaultHandlers([]);
    render(<JourneyPage />);
    await waitFor(() => {
      // Grid renders with only the create card (the dashed-border button)
      // The "0 journeys" counter is shown
      expect(screen.getByText(/0/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // FE-PAGE-JOURNEY-003b
  it('FE-PAGE-JOURNEY-003b: failed list load is not an empty grid', async () => {
    server.use(
      http.get('/api/journeys', () =>
        HttpResponse.json({ error: 'server error' }, { status: 500 })
      ),
    );
    render(<JourneyPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText('Could not load journeys.')).toBeInTheDocument();
    expect(screen.queryByText(/create a new journey/i)).not.toBeInTheDocument();
  });

  // FE-PAGE-JOURNEY-004
  it('FE-PAGE-JOURNEY-004: shows journey cards when journeys exist', async () => {
    const j1 = buildJourneyListItem({ id: 1, title: 'Summer in Italy' });
    const j2 = buildJourneyListItem({ id: 2, title: 'Winter in Japan' });
    setupDefaultHandlers([j1, j2]);

    render(<JourneyPage />);
    await waitFor(() => {
      expect(screen.getByText('Summer in Italy')).toBeInTheDocument();
      expect(screen.getByText('Winter in Japan')).toBeInTheDocument();
    });
  });

  // FE-PAGE-JOURNEY-005
  it('FE-PAGE-JOURNEY-005: create journey button exists', async () => {
    render(<JourneyPage />);
    await waitFor(() => {
      expect(screen.getAllByText(/Create Journey|Create a new Journey/i).length).toBeGreaterThan(0);
    });
  });

  // FE-PAGE-JOURNEY-006
  it('FE-PAGE-JOURNEY-006: create journey dialog opens on click', async () => {
    const user = userEvent.setup();

    server.use(
      http.get('/api/journeys/available-trips', () =>
        HttpResponse.json({ trips: [] })
      ),
    );

    render(<JourneyPage />);

    await waitFor(() => {
      // Wait for page to finish loading
      expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
    });

    // Find and click a create button (mobile or desktop)
    const createButtons = screen.getAllByText(/Create Journey|Create a new Journey/i);
    await user.click(createButtons[0]);

    // Modal should now show the journey name input
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Southeast Asia 2026/i)).toBeInTheDocument();
    });
  });

  // FE-PAGE-JOURNEY-007
  it('FE-PAGE-JOURNEY-007: shows suggestion card for recently ended trips', async () => {
    const suggestion = {
      id: 99,
      title: 'Paris Adventure',
      start_date: '2026-03-01',
      end_date: '2026-04-01',
      place_count: 5,
    };
    server.use(
      http.get('/api/journeys', () =>
        HttpResponse.json({ journeys: [] })
      ),
      http.get('/api/journeys/suggestions', () =>
        HttpResponse.json({ trips: [suggestion] })
      ),
    );

    render(<JourneyPage />);
    await waitFor(() => {
      // The suggestion banner shows the trip title embedded via dangerouslySetInnerHTML
      // The translation key is journey.frontpage.suggestionText with {title}
      // Look for the suggestion label
      expect(screen.getByText(/Trip just ended/i)).toBeInTheDocument();
    });
  });

  // FE-PAGE-JOURNEY-007b — XSS regression: the suggestion banner interpolates
  // a user-controlled trip title into an HTML template that is later passed to
  // dangerouslySetInnerHTML. The sanitiser in @trek/shared must drop any script
  // payload, otherwise renaming a trip is a one-click XSS for anyone visiting
  // the Journey page.
  it('FE-PAGE-JOURNEY-007b: sanitises script payloads in suggestion title', async () => {
    const malicious = {
      id: 1337,
      title: '<img src=x onerror=alert(1)><script>window.__pwned=true</script>',
      start_date: '2026-03-01',
      end_date: '2026-04-01',
      place_count: 3,
    };
    server.use(
      http.get('/api/journeys', () =>
        HttpResponse.json({ journeys: [] })
      ),
      http.get('/api/journeys/suggestions', () =>
        HttpResponse.json({ trips: [malicious] })
      ),
    );

    render(<JourneyPage />);
    await waitFor(() => {
      expect(screen.getByText(/Trip just ended/i)).toBeInTheDocument();
    });

    // The script tag must not survive the sanitiser anywhere in the rendered DOM.
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img[onerror]')).toBeNull();
    // And the side effect would only fire if onerror executed.
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  // FE-PAGE-JOURNEY-008
  it('FE-PAGE-JOURNEY-008: shows active journey hero when active journey exists', async () => {
    const active = buildJourneyListItem({ id: 10, title: 'Active Trip', status: 'active', trip_date_min: '2020-01-01', trip_date_max: '2099-12-31' });
    const other = buildJourneyListItem({ id: 11, title: 'Completed Trip', status: 'completed' });
    setupDefaultHandlers([active, other]);

    render(<JourneyPage />);
    await waitFor(() => {
      expect(screen.getByText('Active Trip')).toBeInTheDocument();
    });
    // Active journey section label
    expect(screen.getByText(/Active Journey/i)).toBeInTheDocument();
  });

  // FE-PAGE-JOURNEY-009
  it('FE-PAGE-JOURNEY-009: dismiss suggestion removes the banner', async () => {
    const user = userEvent.setup();
    const suggestion = {
      id: 77,
      title: 'Tokyo Trip',
      start_date: '2026-03-01',
      end_date: '2026-04-01',
      place_count: 3,
    };
    server.use(
      http.get('/api/journeys', () =>
        HttpResponse.json({ journeys: [] })
      ),
      http.get('/api/journeys/suggestions', () =>
        HttpResponse.json({ trips: [suggestion] })
      ),
    );

    render(<JourneyPage />);
    await waitFor(() => {
      expect(screen.getByText(/Trip just ended/i)).toBeInTheDocument();
    });

    // Click dismiss
    await user.click(screen.getByText(/Dismiss/i));

    await waitFor(() => {
      expect(screen.queryByText(/Trip just ended/i)).not.toBeInTheDocument();
    });
  });

  // FE-PAGE-JOURNEY-010
  it('FE-PAGE-JOURNEY-010: shows journey count in header', async () => {
    const j1 = buildJourneyListItem({ id: 1, title: 'Trip A' });
    const j2 = buildJourneyListItem({ id: 2, title: 'Trip B' });
    const j3 = buildJourneyListItem({ id: 3, title: 'Trip C' });
    setupDefaultHandlers([j1, j2, j3]);

    render(<JourneyPage />);
    await waitFor(() => {
      expect(screen.getByText('Trip A')).toBeInTheDocument();
    });
    // The count "3 journeys" text is displayed
    expect(screen.getByText(/3 journeys/i)).toBeInTheDocument();
  });

  // FE-PAGE-JOURNEY-011
  it('FE-PAGE-JOURNEY-011: clicking a journey card navigates to detail page', async () => {
    const user = userEvent.setup();
    const j1 = buildJourneyListItem({ id: 42, title: 'Morocco Road Trip' });
    setupDefaultHandlers([j1]);

    render(<JourneyPage />);
    await waitFor(() => {
      expect(screen.getByText('Morocco Road Trip')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Morocco Road Trip'));
    expect(mockNavigate).toHaveBeenCalledWith('/journey/42');
  });

  // FE-PAGE-JOURNEY-012
  it('FE-PAGE-JOURNEY-012: create journey form submission navigates to new journey', async () => {
    const user = userEvent.setup();
    const createdJourney = { id: 99, user_id: 1, title: 'My New Journey', subtitle: null, cover_gradient: null, cover_image: null, status: 'draft', created_at: Date.now(), updated_at: Date.now() };

    server.use(
      http.get('/api/journeys', () => HttpResponse.json({ journeys: [] })),
      http.get('/api/journeys/suggestions', () => HttpResponse.json({ trips: [] })),
      http.get('/api/journeys/available-trips', () =>
        HttpResponse.json({ trips: [
          { id: 5, title: 'Thailand 2026', start_date: '2026-05-01', end_date: '2026-05-14', place_count: 8 },
        ] })
      ),
      http.post('/api/journeys', () => HttpResponse.json(createdJourney)),
    );

    render(<JourneyPage />);
    await waitFor(() => {
      expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
    });

    // Open the create modal
    const createButtons = screen.getAllByText(/Create Journey/i);
    await user.click(createButtons[0]);

    // Fill name
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Southeast Asia 2026/i)).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/Southeast Asia 2026/i), 'My New Journey');

    // Select a trip
    await waitFor(() => {
      expect(screen.getByText('Thailand 2026')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Thailand 2026'));

    // The modal footer submit is the last button in the dialog
    const dialog = screen.getByRole('dialog')
    const footerButtons = dialog.querySelectorAll('button')
    const submitBtn = footerButtons[footerButtons.length - 1]
    expect(submitBtn).toBeTruthy()
    await user.click(submitBtn!)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/journey/99');
    });
  });

  // FE-PAGE-JOURNEY-013
  it('FE-PAGE-JOURNEY-013: journey card shows entry/photo/place counts', async () => {
    const j1 = buildJourneyListItem({
      id: 20,
      title: 'Stats Journey',
      entry_count: 12,
      photo_count: 47,
      place_count: 5,
    });
    setupDefaultHandlers([j1]);

    render(<JourneyPage />);
    await waitFor(() => {
      expect(screen.getByText('Stats Journey')).toBeInTheDocument();
    });

    // The card renders entry_count, photo_count, place_count values
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  // FE-PAGE-JOURNEY-014
  it('FE-PAGE-JOURNEY-014: journey card shows draft status badge', async () => {
    const live = buildJourneyListItem({
      id: 29,
      title: 'Live Hero',
      status: 'active',
      trip_date_min: '2020-01-01',
      trip_date_max: '2099-12-31',
    })
    const draft = buildJourneyListItem({ id: 30, title: 'Draft Journey', status: 'draft' })
    setupDefaultHandlers([live, draft])

    render(<JourneyPage />);
    await waitFor(() => {
      expect(screen.getByText('Draft Journey')).toBeInTheDocument();
    });

    // Draft badge rendered
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  // FE-PAGE-JOURNEY-015
  it('FE-PAGE-JOURNEY-015: completed journeys fall back to Latest Journey hero', async () => {
    const latest = buildJourneyListItem({
      id: 40,
      title: 'Italy 2026',
      status: 'completed',
      trip_date_min: '2026-07-01',
      trip_date_max: '2026-07-10',
    })
    const older = buildJourneyListItem({ id: 41, title: 'Older Draft', status: 'draft' })
    setupDefaultHandlers([latest, older])

    render(<JourneyPage />)
    await waitFor(() => {
      expect(screen.getByText('Italy 2026')).toBeInTheDocument()
    })
    expect(screen.getByText('Latest Journey')).toBeInTheDocument()
    expect(screen.queryByText('Active Journey')).not.toBeInTheDocument()
  })

  it('FE-PAGE-JOURNEY-016: search suppresses the hero', async () => {
    const user = userEvent.setup()
    const latest = buildJourneyListItem({ id: 41, title: 'Italy 2026', status: 'draft' })
    setupDefaultHandlers([latest])

    render(<JourneyPage />)
    await waitFor(() => {
      expect(screen.getByText('Latest Journey')).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(/search/i))
    await user.type(screen.getByPlaceholderText(/search journeys/i), 'italy')
    await waitFor(() => {
      expect(screen.queryByText('Latest Journey')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Italy 2026')).toBeInTheDocument()
  })

  it('FE-PAGE-JOURNEY-017: journey cards are keyboard activatable', async () => {
    const user = userEvent.setup()
    const live = buildJourneyListItem({
      id: 42,
      title: 'Live Hero',
      status: 'active',
      trip_date_min: '2020-01-01',
      trip_date_max: '2099-12-31',
    })
    const card = buildJourneyListItem({ id: 43, title: 'Keyboard Journey', status: 'draft' })
    setupDefaultHandlers([live, card])

    render(<JourneyPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Keyboard Journey/i })).toBeInTheDocument()
    })
    await user.tab()
    const cardBtn = screen.getByRole('button', { name: /Keyboard Journey/i })
    cardBtn.focus()
    await user.keyboard('{Enter}')
    expect(mockNavigate).toHaveBeenCalledWith('/journey/43')
  })

  // FE-PAGE-JOURNEY-018
  it('FE-PAGE-JOURNEY-018: active journey hero shows "Continue writing" button', async () => {
    const active = buildJourneyListItem({ id: 50, title: 'Writing Journey', status: 'active', trip_date_min: '2020-01-01', trip_date_max: '2099-12-31' });
    setupDefaultHandlers([active]);

    render(<JourneyPage />);
    await waitFor(() => {
      expect(screen.getByText('Writing Journey')).toBeInTheDocument();
    });

    expect(screen.getByText('Continue writing')).toBeInTheDocument();
  });

  // FE-PAGE-JOURNEY-019
  it('FE-PAGE-JOURNEY-019: live hero shows Active Journey, not Live/Synced chrome', async () => {
    const active = buildJourneyListItem({ id: 51, title: 'Live Journey', status: 'active', trip_date_min: '2020-01-01', trip_date_max: '2099-12-31' })
    setupDefaultHandlers([active])

    render(<JourneyPage />)
    await waitFor(() => {
      expect(screen.getByText('Live Journey')).toBeInTheDocument()
    })

    expect(screen.getByText('Active Journey')).toBeInTheDocument()
    expect(screen.queryByText('Synced')).not.toBeInTheDocument()
  })

  // FE-PAGE-JOURNEY-020
  it('FE-PAGE-JOURNEY-020: clicking active journey hero navigates to its detail page', async () => {
    const user = userEvent.setup();
    const active = buildJourneyListItem({ id: 60, title: 'Clickable Hero', status: 'active', trip_date_min: '2020-01-01', trip_date_max: '2099-12-31' });
    setupDefaultHandlers([active]);

    render(<JourneyPage />);
    await waitFor(() => {
      expect(screen.getByText('Clickable Hero')).toBeInTheDocument();
    });

    // Click the hero card title
    await user.click(screen.getByText('Clickable Hero'));
    expect(mockNavigate).toHaveBeenCalledWith('/journey/60')
  })

  it('FE-PAGE-JOURNEY-021: zero stats render as dashes', async () => {
    const j1 = buildJourneyListItem({
      id: 70,
      title: 'Empty Stats',
      entry_count: 0,
      photo_count: 0,
      place_count: 0,
      status: 'active',
      trip_date_min: '2020-01-01',
      trip_date_max: '2099-12-31',
    })
    setupDefaultHandlers([j1])
    render(<JourneyPage />)
    await waitFor(() => {
      expect(screen.getByText('Empty Stats')).toBeInTheDocument()
    })
    expect(screen.getAllByText('--').length).toBeGreaterThan(0)
  })

  it('FE-PAGE-JOURNEY-022: missing cover still renders a hero', async () => {
    const j1 = buildJourneyListItem({
      id: 71,
      title: 'No Cover',
      cover_image: null,
      status: 'draft',
    })
    setupDefaultHandlers([j1])
    render(<JourneyPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Latest Journey/i })).toBeInTheDocument()
    })
    expect(screen.getByText('No Cover')).toBeInTheDocument()
  })

  it('FE-PAGE-JOURNEY-023: desktop scale uses 1800px container, 4-col grid, and TREK hero title class', async () => {
    const j1 = buildJourneyListItem({ id: 80, title: 'Scale Journey', status: 'draft' })
    setupDefaultHandlers([j1])
    const { container } = render(<JourneyPage />)
    await waitFor(() => {
      expect(screen.getByText('Scale Journey')).toBeInTheDocument()
    })
    expect(container.querySelector('.journey-front')?.className).toContain('max-w-[1800px]')
    expect(container.querySelector('[class*="xl:grid-cols-4"]')).toBeTruthy()
    expect(container.querySelector('.journey-hero-title')).toBeTruthy()
    expect(container.querySelector('.journey-create-card')).toBeTruthy()
  })
})
